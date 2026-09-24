import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PRIVATE_KEY_PEM = Deno.env.get("WHATSAPP_FLOW_PRIVATE_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") ?? "";
const SIGNATURE_MODE = (Deno.env.get("FLOW_SIGNATURE_MODE") ?? "log").toLowerCase();
const FLOW_TOKEN_SECRET = Deno.env.get("FLOW_TOKEN_SECRET") ?? "";

function hexToBytes(hex: string): Uint8Array | null { if (hex.length % 2 !== 0) return null; const bytes = new Uint8Array(hex.length / 2); for (let i = 0; i < bytes.length; i++) { const value = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16); if (Number.isNaN(value)) return null; bytes[i] = value; } return bytes; }
async function isValidMetaSignature(body: string, signatureHeader: string | null): Promise<boolean> { if (!APP_SECRET || !signatureHeader?.startsWith("sha256=")) return false; const expected = hexToBytes(signatureHeader.slice(7)); if (!expected) return false; const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const actual = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))); if (actual.length !== expected.length) return false; let diff = 0; for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]; return diff === 0; }
async function hmacHex(secret: string, data: string): Promise<string> { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))); return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join(""); }
function timingSafeEqualHex(a: string, b: string): boolean { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
// Verifies a token minted by signFlowToken() in whatsapp-webhook:
// <prefix>:<part1>:<part2>:...:<nonce>:<expiry_unix>:<hmac_sha256_hex>.
// A valid signature proves WE minted this exact token (order id / wa_id included), so a
// party who can only trigger arbitrarily-shaped, validly Meta-signed Flow endpoint
// requests (Meta's signature proves origin, not token content) cannot forge one pointing
// at someone else's order or profile. Returns the signed parts on success, or null on any
// mismatch/expiry -- callers must treat null exactly like "token not recognized", never as
// an error, so an invalid/forged token degrades to an anonymous/empty Flow screen instead
// of leaking another customer's data.
async function parseSignedToken(prefix: string, token: string, partCount: number): Promise<string[] | null> {
  if (!FLOW_TOKEN_SECRET) return null;
  const segments = String(token).split(":");
  if (segments.length !== 1 + partCount + 3) return null;
  if (segments[0] !== prefix) return null;
  const sig = segments[segments.length - 1];
  const expiry = Number(segments[segments.length - 2]);
  if (!/^[a-f0-9]+$/i.test(sig)) return null;
  const payload = segments.slice(0, segments.length - 1).join(":");
  const expected = await hmacHex(FLOW_TOKEN_SECRET, payload);
  if (!timingSafeEqualHex(expected.toLowerCase(), sig.toLowerCase())) return null;
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return null;
  return segments.slice(1, 1 + partCount);
}
function base64ToBytes(value: string): Uint8Array { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
function bytesToBase64(bytes: Uint8Array): string { let binary = ""; const chunkSize = 0x8000; for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize)); return btoa(binary); }
function pemToArrayBuffer(pem: string): ArrayBuffer { const base64 = pem.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, ""); return base64ToBytes(base64).buffer; }
async function importPrivateKey(): Promise<CryptoKey> { if (!PRIVATE_KEY_PEM) throw new Error("WHATSAPP_FLOW_PRIVATE_KEY secret is not configured"); return await crypto.subtle.importKey("pkcs8", pemToArrayBuffer(PRIVATE_KEY_PEM), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]); }
async function decryptRequest(payload: { encrypted_aes_key: string; encrypted_flow_data: string; initial_vector: string }) { const privateKey = await importPrivateKey(); const aesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, base64ToBytes(payload.encrypted_aes_key)); const iv = base64ToBytes(payload.initial_vector); const encryptedFlowData = base64ToBytes(payload.encrypted_flow_data); const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, await crypto.subtle.importKey("raw", aesKey, "AES-GCM", false, ["decrypt", "encrypt"]), encryptedFlowData); return { body: JSON.parse(new TextDecoder().decode(decrypted)), aesKey: new Uint8Array(aesKey), iv }; }
async function encryptResponse(response: Record<string, unknown>, aesKeyBytes: Uint8Array, iv: Uint8Array): Promise<string> { const flippedIv = Uint8Array.from(iv, (byte) => byte ^ 0xff); const key = await crypto.subtle.importKey("raw", aesKeyBytes, "AES-GCM", false, ["encrypt"]); const plaintext = new TextEncoder().encode(JSON.stringify(response)); const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: flippedIv, tagLength: 128 }, key, plaintext); return bytesToBase64(new Uint8Array(encrypted)); }
async function db(path: string, options: RequestInit = {}) { if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase environment is not configured"); return fetch(`${SUPABASE_URL}${path}`, { ...options, headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(options.headers ?? {}) } }); }
async function getProfileByWhatsAppId(waId: string) { const r = await db(`/rest/v1/Profile?select=id,name,email&whatsAppUserId=eq.${encodeURIComponent(waId)}&limit=1`); if (!r.ok) throw new Error(`Profile lookup failed: ${await r.text()}`); const rows = await r.json(); return rows[0] ?? null; }
async function getProfileByUpdateFlowToken(token: string) {
  const signed = await parseSignedToken("update-profile", token, 1);
  if (signed) return await getProfileByWhatsAppId(signed[0]);
  // Legacy unsigned format (issued before signed flow tokens, 24 Sep). Trusted as before
  // for backward compatibility during rollout -- safe to delete once whatsapp-webhook has
  // been emitting only signed tokens for at least the token TTL (24h) and no more legacy
  // matches show up in logs.
  const legacy = String(token).match(/^update-profile:([0-9]{8,20}):([a-f0-9-]+)$/i);
  if (!legacy) return null;
  console.warn("Accepted legacy unsigned update-profile flow token; remove this fallback once signed tokens have fully rolled out.");
  return await getProfileByWhatsAppId(legacy[1]);
}
async function getProfileByCheckoutFlowToken(token: string) {
  const signed = await parseSignedToken("checkout-address", token, 2);
  let orderId: string | null = signed ? signed[0] : null;
  if (!orderId) {
    // Legacy unsigned format -- see comment in getProfileByUpdateFlowToken.
    const legacy = String(token).match(/^checkout-address:([0-9]+):([a-f0-9-]+)$/i);
    if (legacy) {
      orderId = legacy[1];
      console.warn("Accepted legacy unsigned checkout-address flow token; remove this fallback once signed tokens have fully rolled out.");
    }
  }
  if (!orderId) return null;
  const r = await db(`/rest/v1/orders?select=id,profile_id,whatsapp_user_id,status&id=eq.${encodeURIComponent(orderId)}&limit=1`);
  if (!r.ok) throw new Error(`Checkout order lookup failed: ${await r.text()}`);
  const rows = await r.json();
  const order = rows[0];
  if (!order?.profile_id || order.status !== "pending_payment") return null;
  return { id: order.profile_id, whatsapp_user_id: order.whatsapp_user_id ?? "" };
}
async function getFlowProfile(body: any) {
  const token = String(body?.flow_token ?? "");
  const checkoutProfile = await getProfileByCheckoutFlowToken(token);
  if (checkoutProfile?.id) return checkoutProfile;
  const updateProfile = await getProfileByUpdateFlowToken(token);
  if (updateProfile?.id) return updateProfile;
  const waId = getWhatsAppId(body);
  if (!waId) return null;
  return await getProfileByWhatsAppId(waId);
}
async function getAddresses(profileId: string) { const r = await db(`/rest/v1/addresses?select=id,label,recipient_name,phone,address_line_1,address_line_2,locality,city,state,pincode,country,is_default,is_active&profile_id=eq.${encodeURIComponent(profileId)}&is_active=eq.true&order=is_default.desc,updated_at.desc`); if (!r.ok) throw new Error(`Address lookup failed: ${await r.text()}`); return await r.json(); }
function addressSummary(address: any) { return [address.address_line_1, address.locality, address.city].filter(Boolean).join(", ").slice(0, 20); }
function flowAddressItems(addresses: any[]) { return addresses.map((a) => ({ id: a.id, "main-content": { title: a.label || "Address", description: addressSummary(a), metadata: `${a.city || ""}${a.pincode ? `, ${a.pincode}` : ""}`.trim() }, "on-click-action": { name: "data_exchange", payload: { selected_address_id: a.id } } })); }
function addressOptions(hasSavedAddresses: boolean) { const options: any[] = []; if (hasSavedAddresses) options.push({ id: "select_address", "main-content": { title: "Select an address", description: "Choose address" }, "on-click-action": { name: "data_exchange", payload: { user_action: "SELECT_ADDRESS" } } }); options.push({ id: "add_new_address", "main-content": { title: "Add a new address", description: "Create new address" }, "on-click-action": { name: "navigate", next: { type: "screen", name: "NEW_ADDRESS" }, payload: {} } }); return options; }
function getWhatsAppId(body: any): string { const fromData = body?.data?.whatsapp_user_id ?? body?.data?.wa_id; if (fromData) return String(fromData); const token = String(body?.flow_token ?? ""); const match = token.match(/^(?:address-test-|address-)(\d{8,20})$/); return match ? match[1] : ""; }
async function handleInit(body: any) {
  const token = String(body?.flow_token ?? "");
  const updateProfile = await getProfileByUpdateFlowToken(token);
  if (updateProfile?.id) {
    return {
      version: "3.0",
      screen: "UPDATE_PROFILE",
      data: {
        name: updateProfile.name ?? "",
        email: updateProfile.email ?? ""
      }
    };
  }

  const profile = await getFlowProfile(body);
  if (!profile?.id) return { version: "3.0", screen: "ADDRESS_LIST", data: { has_saved_addresses: false, address_count: 0, address_options: addressOptions(false) } };
  const addresses = await getAddresses(profile.id); const hasSavedAddresses = addresses.length > 0; console.log("Address Flow INIT profile:", profile.id, "saved_addresses:", addresses.length); return { version: "3.0", screen: "ADDRESS_LIST", data: { has_saved_addresses: hasSavedAddresses, address_count: addresses.length, address_options: addressOptions(hasSavedAddresses) } }; }
async function addressDetailsResponse(address: any) { return { version: "3.0", screen: "ADDRESS_DETAILS", data: { address_id: address.id, label: address.label ?? "Address", recipient_name: address.recipient_name ?? "", phone: address.phone ?? "", address_line_1: address.address_line_1 ?? "", address_line_2: address.address_line_2 ?? "", locality: address.locality ?? "", city: address.city ?? "", state: address.state ?? "", pincode: address.pincode ?? "", country: address.country ?? "India" } }; }

async function handleDataExchange(body: any) {
  const data = body?.data ?? {};
  const profile = await getFlowProfile(body);

  if (body?.screen === "ADDRESS_LIST" && data?.user_action === "SELECT_ADDRESS") {
    if (!profile?.id) throw new Error("Profile not found");
    const addresses = await getAddresses(profile.id);
    return { version: "3.0", screen: "ADDRESS_SELECTION", data: { saved_addresses: flowAddressItems(addresses) } };
  }

  if (body?.screen === "ADDRESS_LIST" && data?.user_action === "ADD_NEW_ADDRESS") {
    if (!profile?.id) throw new Error("Profile not found");
    return { version: "3.0", screen: "NEW_ADDRESS", data: {} };
  }

  if (body?.screen === "ADDRESS_SELECTION" && data?.selected_address_id) {
    if (!profile?.id) throw new Error("Profile not found");
    const addresses = await getAddresses(profile.id);
    const address = addresses.find((a: any) => String(a.id) === String(data.selected_address_id));
    if (!address) throw new Error("Selected address not found");
    return await addressDetailsResponse(address);
  }

  if (body?.screen === "NEW_ADDRESS") {
    if (!profile?.id) throw new Error("Profile not found");

    const insertBody = {
      profile_id: profile.id,
      label: String(data.label ?? ""),
      recipient_name: String(data.recipient_name ?? ""),
      phone: String(data.phone ?? ""),
      address_line_1: String(data.address_line_1 ?? ""),
      address_line_2: data.address_line_2 ? String(data.address_line_2) : null,
      locality: String(data.locality ?? ""),
      city: String(data.city ?? ""),
      state: String(data.state ?? ""),
      pincode: String(data.pincode ?? ""),
      country: String(data.country ?? "India"),
      is_default: false,
      is_active: true
    };

    const r = await db(`/rest/v1/addresses`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(insertBody)
    });
    if (!r.ok) throw new Error(`Address insert failed: ${await r.text()}`);

    const rows = await r.json();
    const address = rows[0];
    if (!address?.id) throw new Error("Address insert returned no ID");

    return {
      version: "3.0",
      screen: "SUCCESS",
      data: {
        extension_message_response: {
          params: {
            flow_token: String(body?.flow_token ?? ""),
            address_id: String(address.id),
            address_label: String(address.label ?? "")
          }
        }
      }
    };
  }

  return { version: "3.0", screen: "ADDRESS_LIST", data: { has_saved_addresses: false, address_count: 0, address_options: addressOptions(false) } };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const rawBody = await req.text();
    const signatureValid = await isValidMetaSignature(rawBody, req.headers.get("x-hub-signature-256"));
    console.log("Flow request signature:", JSON.stringify({ valid: signatureValid, mode: SIGNATURE_MODE }));
    if (!signatureValid && SIGNATURE_MODE === "enforce") return new Response("Invalid signature", { status: 432 });
    const payload = JSON.parse(rawBody);
    if (!payload?.encrypted_aes_key || !payload?.encrypted_flow_data || !payload?.initial_vector) return new Response("Invalid Flow request", { status: 400 });
    const { body, aesKey, iv } = await decryptRequest(payload);
    console.log("WhatsApp Flow action:", body.action, "screen:", body.screen, "flow_token:", body.flow_token ?? "", "data:", JSON.stringify(body.data ?? {}));
    let response: Record<string, unknown>;
    if (body.action === "ping") response = { version: "3.0", data: { status: "active" } };
    else if (body.action === "INIT") response = await handleInit(body);
    else if (body.action === "data_exchange") response = await handleDataExchange(body);
    else response = { version: "3.0", screen: "ADDRESS_LIST", data: { has_saved_addresses: false, address_count: 0, address_options: addressOptions(false) } };
    const encryptedResponse = await encryptResponse(response, aesKey, iv);
    return new Response(encryptedResponse, { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (error) {
    console.error("WhatsApp address Flow endpoint error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
});
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WHATSAPP_APP_SECRET=Deno.env.get("WHATSAPP_APP_SECRET")??"";
const ACCESS_TOKEN=Deno.env.get("WHATSAPP_ACCESS_TOKEN");
const PHONE_NUMBER_ID=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")??"1327606333760280";
const VERIFY_TOKEN=Deno.env.get("WHATSAPP_VERIFY_TOKEN")??"";
const API_VERSION=Deno.env.get("WHATSAPP_API_VERSION")??"v25.0";
const CATALOG_ID=Deno.env.get("WHATSAPP_CATALOG_ID")??"1515875913870520";
const POPULAR_PRODUCT_SET_ID="1027827043551409";
const CATALOG_THUMBNAIL_PRODUCT_ID="sdedto6u1x";
// Must be exactly "test" or "live". Anything else (unset, typo) disables Razorpay calls
// instead of silently falling back to test mode.
const RAZORPAY_MODE_RAW=(Deno.env.get("RAZORPAY_MODE")??"").trim().toLowerCase();
const RAZORPAY_MODE=RAZORPAY_MODE_RAW==="live"||RAZORPAY_MODE_RAW==="test"?RAZORPAY_MODE_RAW:null;
const RAZORPAY_KEY_ID=RAZORPAY_MODE?Deno.env.get(RAZORPAY_MODE==="live"?"RAZORPAY_LIVE_KEY_ID":"RAZORPAY_TEST_KEY_ID"):undefined;
const RAZORPAY_KEY_SECRET=RAZORPAY_MODE?Deno.env.get(RAZORPAY_MODE==="live"?"RAZORPAY_LIVE_KEY_SECRET":"RAZORPAY_TEST_KEY_SECRET"):undefined;
const RAZORPAY_IS_TEST=RAZORPAY_MODE!=="live";
const RAZORPAY_CALLBACK_URL="https://wa.me/919972267897";
const FLOW_TOKEN_SECRET=Deno.env.get("FLOW_TOKEN_SECRET")??"";
const FLOW_TOKEN_TTL_SECONDS=24*60*60;
const ADDRESS_TEMPLATE="address",REGISTRATION_TEMPLATE="registration",UPDATE_PERSONAL_INFO_TEMPLATE="update_personal_info",MAIN_MENU_TEMPLATE="main_menu",PLACE_NEW_ORDER_TEMPLATE="place_new_order",FULL_CATALOGUE_TEMPLATE="full_catalogue",TEMPLATE_LANGUAGE="en";
const MAX_ORDER_MESSAGE_AGE_SECONDS=24*60*60;
// Shared expiry window for the Razorpay Payment Link *and* the WhatsApp order_details
// "order.expiration" field, which Meta's payments docs say should match. Razorpay rejects
// any expire_by under 15 minutes (900s) from now; Meta's expiration.timestamp minimum is
// 300s. 16 minutes gives a 1-minute safety margin above Razorpay's hard floor to absorb
// the checkout request's own processing latency.
const PAYMENT_LINK_EXPIRY_SECONDS=16*60;
// A reused pending payment link must still have this much life left, or it's treated as
// unusable and a fresh Razorpay link is created instead -- with the old 24h expiry this
// never mattered, but with a 16-minute window a slow/re-run checkout could otherwise hand
// back a link that's already expired or about to.
const PAYMENT_LINK_MIN_REMAINING_SECONDS=60;

function hexToBytes(hex:string){
  if(hex.length%2!==0)return null;
  const bytes=new Uint8Array(hex.length/2);
  for(let i=0;i<bytes.length;i++){
    const value=Number.parseInt(hex.slice(i*2,i*2+2),16);
    if(Number.isNaN(value))return null;
    bytes[i]=value;
  }
  return bytes;
}

async function hmacHex(secret:string,data:string):Promise<string>{
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(data)));
  return Array.from(sig).map(b=>b.toString(16).padStart(2,"0")).join("");
}

// Signed flow tokens: <prefix>:<part1>:<part2>:...:<nonce>:<expiry_unix>:<hmac_sha256_hex>.
// The HMAC binds every part (order id / wa_id included) so a party who doesn't hold
// FLOW_TOKEN_SECRET cannot forge a token pointing at someone else's order or profile, even
// though they may be able to trigger arbitrarily-shaped Flow endpoint requests with a
// valid Meta signature (Meta's signature only proves the request came from its
// infrastructure, not that the flow_token content is the one we originally issued).
// Verified by parseSignedToken() in whatsapp-flow.
async function signFlowToken(prefix:string,parts:string[]):Promise<string>{
  if(!FLOW_TOKEN_SECRET)throw new Error("FLOW_TOKEN_SECRET is not configured");
  const nonce=crypto.randomUUID();
  const expiry=Math.floor(Date.now()/1000)+FLOW_TOKEN_TTL_SECONDS;
  const payload=[prefix,...parts,nonce,String(expiry)].join(":");
  const sig=await hmacHex(FLOW_TOKEN_SECRET,payload);
  return `${payload}:${sig}`;
}

async function verifyMetaSignature(body:string,signatureHeader:string|null){
  if(!WHATSAPP_APP_SECRET)return false;
  if(!signatureHeader?.startsWith("sha256="))return false;
  const expected=hexToBytes(signatureHeader.slice(7));
  if(!expected)return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(WHATSAPP_APP_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const actual=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(body)));
  if(actual.length!==expected.length)return false;
  let diff=0;
  for(let i=0;i<actual.length;i++)diff|=actual[i]^expected[i];
  return diff===0;
}

// Logs only the path before "?" so phone numbers in query filters stay out of the logs.
async function timed(kind:string,path:string,run:()=>Promise<Response>){
  const started=performance.now();
  try{
    return await run();
  }finally{
    console.log("Timing:",JSON.stringify({kind,path:path.split("?")[0],ms:Math.round(performance.now()-started)}));
  }
}

async function db(path:string,options:RequestInit={}){
  return timed("db",path,()=>fetch(`${SUPABASE_URL}${path}`,{
    ...options,
    headers:{
      apikey:SERVICE_KEY,
      Authorization:`Bearer ${SERVICE_KEY}`,
      "Content-Type":"application/json",
      ...(options.headers??{})
    }
  }));
}

async function graph(path:string,options:RequestInit={}){
  if(!ACCESS_TOKEN)throw new Error("WHATSAPP_ACCESS_TOKEN is not configured");
  return timed("meta",path,()=>fetch(`https://graph.facebook.com/${API_VERSION}${path}`,{
    ...options,
    headers:{
      Authorization:`Bearer ${ACCESS_TOKEN}`,
      "Content-Type":"application/json",
      ...(options.headers??{})
    }
  }));
}

async function send(payload:unknown){
  const r=await graph(`/${PHONE_NUMBER_ID}/messages`,{method:"POST",body:JSON.stringify(payload)});
  if(!r.ok){
    const text=await r.text();
    console.log("WhatsApp send result:",JSON.stringify({status:r.status,response:text,payload}));
    throw new Error(`WhatsApp API ${r.status}: ${text}`);
  }
  console.log("WhatsApp send result:",JSON.stringify({status:r.status,payload}));
  return {status:r.status};
}

async function razorpay(path:string,options:RequestInit={}){
  if(!RAZORPAY_MODE)throw new Error(`RAZORPAY_MODE must be "test" or "live", got ${JSON.stringify(RAZORPAY_MODE_RAW)}`);
  if(!RAZORPAY_KEY_ID||!RAZORPAY_KEY_SECRET)throw new Error(`Razorpay ${RAZORPAY_MODE} API keys are not configured`);
  const auth=btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`);
  return timed("razorpay",path,()=>fetch(`https://api.razorpay.com${path}`,{
    ...options,
    headers:{Authorization:`Basic ${auth}`,"Content-Type":"application/json",...(options.headers??{})}
  }));
}

async function getProfile(waId:string){
  const r=await db(`/rest/v1/Profile?select=id,name&whatsAppUserId=eq.${encodeURIComponent(waId)}&limit=1`);
  if(!r.ok)throw new Error(`Profile lookup failed: ${await r.text()}`);
  const rows=await r.json();
  return rows[0]??null;
}

async function createAuthUser(waId:string){
  const email=`wa_${waId}@whatsapp.local`;
  const r=await db("/auth/v1/admin/users",{method:"POST",body:JSON.stringify({
    email,
    password:crypto.randomUUID()+crypto.randomUUID(),
    email_confirm:true,
    user_metadata:{whatsapp_user_id:waId}
  })});
  if(!r.ok){
    const text=await r.text();
    if(r.status===422||text.includes("already been registered")){
      const list=await db(`/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
      if(list.ok){
        const data=await list.json();
        if(data?.users?.[0]?.id)return data.users[0].id;
      }
    }
    throw new Error(`Auth user creation failed: ${text}`);
  }
  return (await r.json()).id;
}

async function createProfile(waId:string){
  const id=await createAuthUser(waId);
  const r=await db("/rest/v1/Profile",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({
    id,whatsAppUserId:waId,language:"en",name:null,email:null
  })});
  if(!r.ok){
    const text=await r.text();
    if(r.status===409){
      const existing=await getProfile(waId);
      if(existing)return existing;
    }
    throw new Error(`Profile creation failed: ${text}`);
  }
  return (await r.json())[0];
}

async function ensureProfileInBackground(waId:string){
  try{
    const existing=await getProfile(waId);
    if(existing)return existing;
    return await createProfile(waId);
  }catch(e){
    console.error("Background profile creation failed:",e);
    return null;
  }
}

async function updateProfile(waId:string,name:string,email:string|null){
  const r=await db(`/rest/v1/Profile?whatsAppUserId=eq.${encodeURIComponent(waId)}`,{
    method:"PATCH",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify({name,email})
  });
  if(!r.ok)throw new Error(`Profile update failed: ${await r.text()}`);
}

async function registration(to:string){
  return send({
    messaging_product:"whatsapp",
    to,
    type:"template",
    template:{
      name:REGISTRATION_TEMPLATE,
      language:{code:TEMPLATE_LANGUAGE},
      components:[{
        type:"button",
        sub_type:"flow",
        index:"0",
        parameters:[{type:"action",action:{flow_token:crypto.randomUUID()}}]
      }]
    }
  });
}

async function updatePersonalInfo(to:string,flowToken:string){
  return send({
    messaging_product:"whatsapp",
    to,
    type:"template",
    template:{
      name:UPDATE_PERSONAL_INFO_TEMPLATE,
      language:{code:TEMPLATE_LANGUAGE},
      components:[{
        type:"button",
        sub_type:"flow",
        index:"0",
        parameters:[{type:"action",action:{flow_token:flowToken}}]
      }]
    }
  });
}

async function menu(to:string,name:string){
  return send({
    messaging_product:"whatsapp",
    recipient_type:"individual",
    to,
    type:"interactive",
    interactive:{
      type:"button",
      header:{type:"text",text:"Main menu"},
      body:{text:`Hi *${name}*!\nWhat would you like to do today?\n\nNote: You can always type "Hi" for the main menu`},
      action:{
        buttons:[
          {type:"reply",reply:{id:"place_new_order",title:"Place a new order"}},
          {type:"reply",reply:{id:"settings",title:"Settings"}}
        ]
      }
    }
  });
}

async function placeNewOrder(to:string){
  return send({
    messaging_product:"whatsapp",
    to,
    type:"template",
    template:{name:PLACE_NEW_ORDER_TEMPLATE,language:{code:TEMPLATE_LANGUAGE}}
  });
}

async function fullCatalogue(to:string){
  return send({
    messaging_product:"whatsapp",
    to,
    type:"template",
    template:{
      name:FULL_CATALOGUE_TEMPLATE,
      language:{code:TEMPLATE_LANGUAGE},
      components:[{
        type:"button",
        sub_type:"CATALOG",
        index:"0",
        parameters:[{type:"action",action:{thumbnail_product_retailer_id:CATALOG_THUMBNAIL_PRODUCT_ID}}]
      }]
    }
  });
}

async function sendProductList(to:string,title:string,bodyText:string,productIds:string[]){
  return send({
    messaging_product:"whatsapp",
    to,
    type:"interactive",
    interactive:{
      type:"product_list",
      header:{type:"text",text:title},
      body:{text:bodyText},
      action:{catalog_id:CATALOG_ID,sections:[{title,product_items:productIds.map(product_retailer_id=>({product_retailer_id}))}]}
    }
  });
}

async function getPopularProductsFromSet(){
  const r=await graph(`/${encodeURIComponent(POPULAR_PRODUCT_SET_ID)}/products?fields=retailer_id,name&limit=30`);
  const text=await r.text();
  if(!r.ok)throw new Error(`Popular product set lookup ${r.status}: ${text}`);
  const data=text?JSON.parse(text):{};
  const products=Array.isArray(data?.data)?data.data.filter((p:any)=>String(p?.retailer_id??"").trim()):[];
  if(!products.length)throw new Error(`Popular product set ${POPULAR_PRODUCT_SET_ID} returned no products`);
  return products.slice(0,30);
}

async function popularProducts(to:string){
  const products=await getPopularProductsFromSet();
  return sendProductList(to,"Popular products","Choose from our most popular products.",products.map((p:any)=>String(p.retailer_id).trim()));
}

function isExpectedWebhook(change:any){
  return String(change?.value?.metadata?.phone_number_id??"")===String(PHONE_NUMBER_ID);
}

function isFullCatalogueAction(value:string){
  return value==="full_catalogue"||value==="full catalogue"||value==="browse catalogue"||value==="browse catalog"||value==="view catalogue"||value==="view catalog";
}

function moneyValue(amount:number){
  return {value:Math.round(amount*100),offset:100};
}

async function getExistingProductByRetailerId(id:string){
  const r=await db(`/rest/v1/Product?select=retailer_id,name,description,product_link,catalog_id&retailer_id=eq.${encodeURIComponent(id)}&catalog_id=eq.${encodeURIComponent(CATALOG_ID)}&limit=1`);
  if(!r.ok)throw new Error(`Product lookup failed: ${await r.text()}`);
  const rows=await r.json();
  return rows[0]??null;
}

async function sendAddressFlowTemplate(to:string,flowToken:string){
  return send({
    messaging_product:"whatsapp",
    to,
    type:"template",
    template:{
      name:ADDRESS_TEMPLATE,
      language:{code:TEMPLATE_LANGUAGE},
      components:[{
        type:"button",
        sub_type:"flow",
        index:"0",
        parameters:[{type:"action",action:{flow_token:flowToken}}]
      }]
    }
  });
}

function parseAddressFlowToken(token:string){
  // Used only to pick which specific pending order an nfm_reply address completion
  // belongs to (falls back to "most recent pending order for this waId" if this doesn't
  // match). Not a security boundary by itself -- attachAddressToOrder() always re-checks
  // whatsapp_user_id against the real sender's waId from the verified messaging webhook,
  // so a tampered order id here can at most fail to match and error out safely, never
  // attach to someone else's order.
  const signed=/^checkout-address:([0-9]+):[0-9]{8,20}:[a-f0-9-]+:[0-9]+:[a-f0-9]+$/i.exec(token);
  if(signed)return{orderId:Number(signed[1])};
  const legacy=/^checkout-address:([0-9]+):([a-f0-9-]+)$/i.exec(token);
  return legacy?{orderId:Number(legacy[1])}:null;
}

async function getPendingOrderForWaId(waId:string){
  const r=await db(`/rest/v1/orders?select=*&whatsapp_user_id=eq.${encodeURIComponent(waId)}&status=eq.pending_payment&address_id=is.null&order=created_at.desc&limit=1`);
  if(!r.ok)throw new Error(`Pending order lookup failed: ${await r.text()}`);
  const rows=await r.json();
  return rows[0]??null;
}

async function attachAddressToOrder(orderId:number,waId:string,addressId:string){
  const r=await db(`/rest/v1/orders?id=eq.${encodeURIComponent(String(orderId))}&whatsapp_user_id=eq.${encodeURIComponent(waId)}&status=eq.pending_payment&address_id=is.null`,{
    method:"PATCH",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify({address_id:addressId})
  });
  if(!r.ok)throw new Error(`Order address update failed: ${await r.text()}`);
  const rows=await r.json();
  if(!rows[0])throw new Error("Pending order could not be matched for address completion");
  return rows[0];
}

async function getOrderItems(orderId:number){
  const r=await db(`/rest/v1/order_items?select=id,product_retailer_id,product_name,quantity,unit_price,currency&order_id=eq.${encodeURIComponent(String(orderId))}&order=id.asc`);
  if(!r.ok)throw new Error(`Order items lookup failed: ${await r.text()}`);
  return await r.json();
}

async function getExistingPaymentForOrder(orderId:number){
  const r=await db(`/rest/v1/payments?select=*&order_id=eq.${encodeURIComponent(String(orderId))}&status=in.(pending,processing)&order=created_at.desc&limit=1`);
  if(!r.ok)throw new Error(`Payment lookup failed: ${await r.text()}`);
  const rows=await r.json();
  return rows[0]??null;
}

async function createRazorpayPaymentLink(order:any,waId:string){
  const existing=await getExistingPaymentForOrder(Number(order.id));
  const existingStillUsable=existing?.provider_payment_link_url
    &&(!existing.expires_at||new Date(existing.expires_at).getTime()>Date.now()+PAYMENT_LINK_MIN_REMAINING_SECONDS*1000);
  if(existingStillUsable)return existing;
  const needsFreshReferenceId=Boolean(existing?.provider_payment_link_url);
  if(needsFreshReferenceId){
    console.log("Existing Razorpay Payment Link is expired or about to expire; creating a fresh one:",JSON.stringify({order_id:order.id,payment_id:existing.id,expires_at:existing.expires_at}));
  }
  const amountPaise=Math.round(Number(order.total)*100);
  if(!Number.isInteger(amountPaise)||amountPaise<=0)throw new Error(`Invalid order total for Razorpay: ${order.total}`);
  const profile=await getProfile(waId);
  const customerName=String(profile?.name??"Customer").trim()||"Customer";
  // Razorpay requires reference_id to be globally unique per Payment Link (HTTP 400
  // "An existing reference id has been passed" on reuse). The order's own reference_id
  // (used separately in the WhatsApp order_details message) is unaffected -- only the
  // value we send to Razorpay needs a fresh suffix when replacing an expired link.
  const razorpayReferenceId=needsFreshReferenceId
    ?`${String(order.reference_id).slice(0,34)}-R${crypto.randomUUID().slice(0,4).toUpperCase()}`
    :String(order.reference_id).slice(0,40);
  const payload:any={
    amount:amountPaise,
    currency:"INR",
    accept_partial:false,
    expire_by:Math.floor(Date.now()/1000)+PAYMENT_LINK_EXPIRY_SECONDS,
    reference_id:razorpayReferenceId,
    description:`Payment for order ${order.reference_id}`,
    customer:{name:customerName,contact:`+${waId}`},
    notes:{order_id:String(order.id),whatsapp_user_id:waId},
    callback_url:RAZORPAY_CALLBACK_URL,
    callback_method:"get",
    options:{checkout:{method:{upi:1,card:0,netbanking:0,wallet:0}}}
  };
  console.log("Creating Razorpay Payment Link:",JSON.stringify({
    order_id:order.id,
    order_reference_id:order.reference_id,
    razorpay_reference_id:razorpayReferenceId,
    amount:amountPaise,
    expire_by:payload.expire_by,
    mode:RAZORPAY_IS_TEST?"test_standard_link":"live_standard_link_upi_only",
    callback_url:RAZORPAY_CALLBACK_URL
  }));
  const r=await razorpay("/v1/payment_links",{method:"POST",body:JSON.stringify(payload)});
  const text=await r.text();
  if(!r.ok)throw new Error(`Razorpay Payment Link ${r.status}: ${text}`);
  const link=JSON.parse(text);
  const paymentPayload={
    order_id:Number(order.id),
    provider:"razorpay",
    provider_payment_link_id:link.id,
    provider_payment_link_reference_id:link.reference_id??order.reference_id,
    provider_payment_link_url:link.short_url??link.long_url??null,
    amount:Number(order.total),
    currency:"INR",
    status:"pending",
    expires_at:link.expire_by?new Date(Number(link.expire_by)*1000).toISOString():null
  };
  const insert=await db("/rest/v1/payments",{
    method:"POST",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify(paymentPayload)
  });
  if(!insert.ok)throw new Error(`Saving Payment failed: ${await insert.text()}`);
  return (await insert.json())[0];
}

function buildOrderExpiration(order:any,payment:any){
  // Mirrors the Razorpay Payment Link's own expire_by exactly (payment.expires_at is
  // stored straight from Razorpay's response), so both surfaces agree on when the order
  // stops being payable, per Meta's payments docs. Meta's own minimum is 300 seconds from
  // send time -- if for any reason less than that remains (e.g. a very slow checkout),
  // omit the field rather than risk the whole message being rejected for violating it.
  if(!payment?.expires_at)return null;
  const expiresAtMs=new Date(payment.expires_at).getTime();
  if(!Number.isFinite(expiresAtMs))return null;
  const secondsUntilExpiry=Math.floor((expiresAtMs-Date.now())/1000);
  if(secondsUntilExpiry<300){
    console.error("Payment link expiry is under Meta's 300s minimum; omitting order.expiration from review_and_pay message:",JSON.stringify({order_id:order.id,seconds_until_expiry:secondsUntilExpiry}));
    return null;
  }
  return {timestamp:String(Math.floor(expiresAtMs/1000)),description:"This payment link expires in 15 minutes."};
}

function buildOrderDetailsPayload(to:string,order:any,items:any[],payment:any){
  if(String(order.currency).toUpperCase()!=="INR")throw new Error(`Order currency is ${order.currency}`);
  if(!items.length)throw new Error("Order has no items");
  const expectedTotal=Number(order.subtotal)+Number(order.shipping)-Number(order.discount);
  if(Math.abs(expectedTotal-Number(order.total))>0.001)throw new Error(`Order total mismatch: expected ${expectedTotal}, stored ${order.total}`);
  if(!payment?.provider_payment_link_url)throw new Error("Razorpay Payment Link URL is missing");
  const expiration=buildOrderExpiration(order,payment);
  return {
    messaging_product:"whatsapp",
    recipient_type:"individual",
    to,
    type:"interactive",
    interactive:{
      type:"order_details",
      body:{text:"Here's your order summary. Tap below to review and pay."},
      action:{
        name:"review_and_pay",
        parameters:{
          reference_id:String(order.reference_id),
          type:"physical-goods",
          payment_type:"upi",
          payment_settings:[{
            type:"payment_link",
            payment_link:{uri:String(payment.provider_payment_link_url)}
          }],
          currency:"INR",
          total_amount:moneyValue(Number(order.total)),
          order:{
            status:"pending",
            catalog_id:String(order.catalog_id),
            ...(expiration?{expiration}:{}),
            items:items.map((item:any)=>({
              retailer_id:String(item.product_retailer_id),
              name:String(item.product_name??item.product_retailer_id).trim()||String(item.product_retailer_id),
              amount:moneyValue(Number(item.unit_price)),
              quantity:Number(item.quantity)
            })),
            subtotal:moneyValue(Number(order.subtotal)),
            shipping:moneyValue(Number(order.shipping)),
            discount:moneyValue(Number(order.discount))
          }
        }
      }
    }
  };
}

async function createOrderFromWhatsAppCart(waId:string,m:any){
  const messageId=String(m?.id??"").trim();
  if(!messageId)throw new Error("Order message is missing message id");
  const timestamp=Number(m?.timestamp??0);
  if(timestamp>0&&Number.isFinite(timestamp)&&Math.floor(Date.now()/1000)-timestamp>MAX_ORDER_MESSAGE_AGE_SECONDS){
    console.log("Ignoring stale WhatsApp order message:",JSON.stringify({message_id:messageId,timestamp}));
    return;
  }

  const existingR=await db(`/rest/v1/orders?select=*&whatsapp_message_id=eq.${encodeURIComponent(messageId)}&limit=1`);
  if(!existingR.ok)throw new Error(`Existing order lookup failed: ${await existingR.text()}`);
  const existingOrders=await existingR.json();
  if(existingOrders[0]){
    console.log("Ignoring duplicate WhatsApp order message:",JSON.stringify({message_id:messageId,order_id:existingOrders[0].id}));
    return;
  }

  const profile=await getProfile(waId);
  if(!profile)throw new Error(`Profile not found for WhatsApp user ${waId}`);
  const catalogId=String(m?.order?.catalog_id??CATALOG_ID).trim()||CATALOG_ID;
  const incomingItems=Array.isArray(m?.order?.product_items)?m.order.product_items:[];
  if(!incomingItems.length)throw new Error("Order message contains no product_items");

  const normalizedItems=await Promise.all(incomingItems.map(async(raw:any)=>{
    const retailerId=String(raw?.product_retailer_id??"").trim();
    const quantity=Number(raw?.quantity??0);
    const incomingPrice=Number(raw?.item_price??0);
    const currency=String(raw?.currency??"INR");
    if(!retailerId||!Number.isInteger(quantity)||quantity<=0)throw new Error(`Invalid cart item: ${JSON.stringify(raw)}`);
    const cachedProduct=await getExistingProductByRetailerId(retailerId);
    if(!cachedProduct)console.error("Product missing from local catalogue; using incoming order metadata without Meta API lookup",JSON.stringify({retailer_id:retailerId,catalog_id:catalogId}));
    const unitPrice=incomingPrice;
    const productName=String(cachedProduct?.name??raw?.product_name??raw?.name??"").trim()||null;
    if(!Number.isFinite(unitPrice)||unitPrice<0)throw new Error(`No valid price available for product ${retailerId}`);
    return {product_retailer_id:retailerId,product_name:productName,quantity,unit_price:unitPrice,currency};
  }));

  const subtotal=normalizedItems.reduce((s,i)=>s+i.quantity*i.unit_price,0);
  const shipping=0,discount=0,total=subtotal;
  const referenceId=`ORD-${Date.now()}-${crypto.randomUUID().slice(0,6).toUpperCase()}`;

  // Order + order_items are created atomically via a single Postgres function call
  // (create_order_with_items) so a partial failure -- e.g. a bad item slipping past the
  // checks above -- rolls back the order row too, instead of leaving an empty
  // pending_payment order behind that silently blocks retries (dedup is keyed on
  // whatsapp_message_id, so a half-created order would make every future retry of the
  // same WhatsApp message a no-op forever). The function also absorbs the
  // whatsapp_message_id duplicate-insert race that used to need a 409 + re-select here.
  const rpc=await db("/rest/v1/rpc/create_order_with_items",{
    method:"POST",
    body:JSON.stringify({
      p_reference_id:referenceId,
      p_profile_id:profile.id,
      p_whatsapp_user_id:waId,
      p_catalog_id:catalogId,
      p_whatsapp_message_id:messageId,
      p_currency:"INR",
      p_subtotal:subtotal,
      p_shipping:shipping,
      p_discount:discount,
      p_total:total,
      p_items:normalizedItems.map(i=>({
        product_retailer_id:i.product_retailer_id,
        product_name:i.product_name,
        quantity:i.quantity,
        unit_price:i.unit_price,
        currency:i.currency
      }))
    })
  });
  if(!rpc.ok)throw new Error(`Order creation failed: ${await rpc.text()}`);
  const result=await rpc.json();
  const order=result?.order;
  if(!order?.id)throw new Error(`Order creation RPC returned no order: ${JSON.stringify(result)}`);
  if(result?.duplicate){
    console.log("Concurrent duplicate WhatsApp order detected:",JSON.stringify({message_id:messageId,order_id:order.id}));
    return;
  }

  const flowToken=await signFlowToken("checkout-address",[String(order.id),waId]);
  await sendAddressFlowTemplate(waId,flowToken);
}

async function handleAddressFlowCompletion(waId:string,data:any){
  const addressId=String(data?.address_id??"").trim();
  const token=String(data?.flow_token??"").trim();
  if(!addressId||!token)throw new Error("Address Flow completion missing address_id or flow_token");
  const tokenData=parseAddressFlowToken(token);
  const order=tokenData
    ?await attachAddressToOrder(tokenData.orderId,waId,addressId)
    :await(async()=>{
      const p=await getPendingOrderForWaId(waId);
      if(!p)throw new Error(`No pending order found for ${waId}`);
      return attachAddressToOrder(Number(p.id),waId,addressId);
    })();
  const [items,payment]=await Promise.all([
    getOrderItems(Number(order.id)),
    createRazorpayPaymentLink(order,waId)
  ]);
  await send(buildOrderDetailsPayload(waId,order,items,payment));
}


Deno.serve(async(req:Request)=>{
  if(req.method==="GET"){
    const u=new URL(req.url);
    if(VERIFY_TOKEN&&u.searchParams.get("hub.verify_token")===VERIFY_TOKEN){
      return new Response(u.searchParams.get("hub.challenge")??"",{status:200});
    }
    return new Response("Forbidden",{status:403});
  }

  if(req.method!=="POST")return new Response("Method not allowed",{status:405});

  try{
    if(!WHATSAPP_APP_SECRET)return new Response("Webhook signature verification is not configured",{status:500});
    const rawBody=await req.text();
    const signature=req.headers.get("x-hub-signature-256");
    if(!(await verifyMetaSignature(rawBody,signature)))return new Response("Invalid signature",{status:401});
    const body=JSON.parse(rawBody);


    for(const entry of body?.entry??[]){
      for(const change of entry?.changes??[]){
        if(change?.field!=="messages"||!isExpectedWebhook(change))continue;
        for(const m of change?.value?.messages??[]){
          const waId=m.from;
          if(!waId)continue;

          if(m.type==="text"){
            const profile=await getProfile(waId);
            if(!profile){
              await registration(waId);
              EdgeRuntime.waitUntil(ensureProfileInBackground(waId));
            }else if(profile.name)await menu(waId,profile.name);
            else await registration(waId);
          }

          if(m.type==="interactive"&&m.interactive?.type==="nfm_reply"){
            const raw=m.interactive.nfm_reply.response_json;
            const data=typeof raw==="string"?JSON.parse(raw):raw;
            if(data?.profile_updated){
              const updatedProfile=await getProfile(waId);
              if(updatedProfile?.name)await menu(waId,updatedProfile.name);
              continue;
            }
            if(data?.address_id){
              await handleAddressFlowCompletion(waId,data);
              continue;
            }
            const name=String(data?.name??"").trim();
            const email=String(data?.email??"").trim()||null;
            if(!name)throw new Error("Missing name from Flow response");
            await updateProfile(waId,name,email);
            await menu(waId,name);
          }

          if(m.type==="order")await createOrderFromWhatsAppCart(waId,m);

          if(m.type==="button"){
            const payload=String(m.button?.payload??"").trim().toLowerCase();
            const text=String(m.button?.text??"").trim().toLowerCase();
            const profile=await getProfile(waId);
            if(!profile?.name)continue;
            if(payload==="place_new_order"||payload==="place_order"||payload==="place_an_order"||text==="place a new order")await placeNewOrder(waId);
            if(payload==="settings"||text==="settings")await updatePersonalInfo(waId,await signFlowToken("update-profile",[waId]));
            if(isFullCatalogueAction(payload)||isFullCatalogueAction(text))await fullCatalogue(waId);
            if(payload==="popular_products"||payload==="popular_oil_products"||text==="popular products"||text==="popular oil products")await popularProducts(waId);
          }

          if(m.type==="interactive"&&m.interactive?.type==="button_reply"){
            const reply=m.interactive.button_reply??{};
            const id=String(reply.id??"").trim().toLowerCase();
            const title=String(reply.title??"").trim().toLowerCase();
            if(id==="place_new_order"||id==="place_order"||id==="place_an_order"||title==="place a new order")await placeNewOrder(waId);
            if(isFullCatalogueAction(id)||isFullCatalogueAction(title))await fullCatalogue(waId);
            if(id==="popular_products"||id==="popular_oil_products"||title==="popular products"||title==="popular oil products")await popularProducts(waId);
            if(id==="settings"||title==="settings")await updatePersonalInfo(waId,await signFlowToken("update-profile",[waId]));
          }
        }
      }
    }

    return Response.json({ok:true});
  }catch(e){
    console.error("Webhook error:",e);
    return Response.json({ok:false,error:String(e)},{status:500});
  }
});
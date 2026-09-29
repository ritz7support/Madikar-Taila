// Generated into dist/server/index.js by scripts/build-worker.mjs.
// Razorpay credentials and the store signing key are server-only runtime values.
const API = 'https://api.razorpay.com/v1';
const encoder = new TextEncoder();

function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
function config(env){
  const shippingPaise = Number(env.SHIPPING_FLAT_PAISE);
  return {
    ready: Boolean(env.STORE_ORDERS_ENABLED === 'true' && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.SUPABASE_URL && env.STORE_SIGNING_PRIVATE_JWK && env.SHIPPING_FLAT_PAISE !== undefined && Number.isInteger(shippingPaise) && shippingPaise >= 0),
    shippingPaise:Number.isInteger(shippingPaise) && shippingPaise >= 0 ? shippingPaise : null
  };
}
function base64url(bytes){
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
async function storeApi(env,body){
  if (!env.SUPABASE_URL || !env.STORE_SIGNING_PRIVATE_JWK) throw new Error('The store service is not configured yet.');
  const raw = JSON.stringify(body);
  const stamp = String(Date.now());
  const key = await crypto.subtle.importKey('jwk',JSON.parse(env.STORE_SIGNING_PRIVATE_JWK),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,encoder.encode(stamp+'.'+raw)));
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/madikar-store`,{
    method:'POST',headers:{'Content-Type':'application/json','x-store-timestamp':stamp,'x-store-signature':base64url(signature)},
    body:raw,signal:AbortSignal.timeout(body.action === 'admin_upload_image' ? 30000 : 12000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error=new Error(data.error || 'The store service is temporarily unavailable.');
    error.status=response.status;
    throw error;
  }
  return data;
}
async function catalog(env){
  const data = await storeApi(env,{action:'catalog'});
  if (!Array.isArray(data.products)) throw new Error('The product catalog is unavailable.');
  return data.products;
}
function clean(value,max){
  return typeof value === 'string' ? value.trim().replace(/[\x00-\x1F\x7F]/g,' ').slice(0,max) : '';
}
function validateAddress(raw){
  if (!raw || typeof raw !== 'object') throw new Error('Please enter a shipping address.');
  const a = {
    name:clean(raw.name,80),phone:clean(raw.phone,10),email:clean(raw.email,120),
    line1:clean(raw.line1,120),line2:clean(raw.line2,120),city:clean(raw.city,60),
    state:clean(raw.state,60),postalCode:clean(raw.postalCode,6)
  };
  if (a.name.length < 2 || !/^[0-9]{10}$/.test(a.phone) || !a.line1 || !a.city || !a.state || !/^[0-9]{6}$/.test(a.postalCode)) throw new Error('Please complete all required delivery fields.');
  if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw new Error('Please enter a valid email address.');
  return a;
}
async function priceLines(raw,env,requireAvailable=false){
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 16) throw new Error('Please select between 1 and 16 different products.');
  const products = await catalog(env);
  const book = Object.fromEntries(products.map(product => [product.id,product]));
  const seen = new Set();
  let subtotalPaise = 0;
  const lines = raw.map(line => {
    const item = book[line?.id];
    const variantIndex = line?.variant;
    const quantity = line?.quantity;
    if (!item || !Array.isArray(item.variants) || !Number.isInteger(variantIndex) || variantIndex < 0 || variantIndex >= item.variants.length || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('Your bag contains an invalid item or quantity.');
    const key = `${line.id}:${variantIndex}`;
    if (seen.has(key)) throw new Error('Your bag contains a duplicate item.');
    seen.add(key);
    const variant = item.variants[variantIndex];
    if (!Number.isInteger(variant.price) || variant.price < 1 || variant.price > 100000) throw new Error('Your bag contains an invalid price.');
    if (variant.orderable === false) throw new Error('Please remove an unavailable item from your bag.');
    if (variant.inventoryQuantity !== null && variant.inventoryQuantity < quantity) throw new Error('Please reduce the quantity of an item with limited stock.');
    if (requireAvailable && variant.available !== true) throw new Error('Please confirm product availability before online payment.');
    subtotalPaise += variant.price*100*quantity;
    return {name:item.name,size:variant.size,quantity};
  });
  if (subtotalPaise < 100 || subtotalPaise > 10000000) throw new Error('The order amount is outside the supported range.');
  return {lines,subtotalPaise};
}
function itemNotes(lines){
  const chunks = [];
  let current = '';
  for (const line of lines){
    const label = `${line.name} ${line.size} x${line.quantity}`;
    if (current && `${current}; ${label}`.length > 250){chunks.push(current);current = label}
    else current = current ? `${current}; ${label}` : label;
  }
  if (current) chunks.push(current);
  if (chunks.length > 5) throw new Error('Please reduce the number of different items in your bag.');
  return Object.fromEntries(chunks.map((value,index) => [`items_${index+1}`,value]));
}
async function razorpay(path,env,options={}){
  const authorization = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const response = await fetch(`${API}${path}`,{
    ...options,
    headers:{Authorization:`Basic ${authorization}`,'Content-Type':'application/json',Accept:'application/json',...(options.headers || {})},
    signal:AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error('Razorpay is temporarily unavailable. Please try again shortly.');
  return response.json();
}
async function signature(orderId,paymentId,secret){
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${orderId}|${paymentId}`)));
  return [...bytes].map(byte => byte.toString(16).padStart(2,'0')).join('');
}
function equalHex(a,b){
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i=0;i<a.length;i++) mismatch |= a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch === 0;
}
async function readJson(request){
  if (Number(request.headers.get('content-length') || 0) > 12000) throw new Error('The checkout request is too large.');
  return request.json();
}
async function createOrder(request,env){
  const body = await readJson(request);
  const address = validateAddress(body.address);
  const {lines,subtotalPaise} = await priceLines(body.lines,env,true);
  const amountPaise = subtotalPaise+Number(env.SHIPPING_FLAT_PAISE);
  const notes = {
    customer_name:address.name,mobile:address.phone,email:address.email,
    address_line_1:address.line1,address_line_2:address.line2,
    city:address.city,state:address.state,pincode:address.postalCode,country:'India',
    ...itemNotes(lines)
  };
  const order = await razorpay('/orders',env,{
    method:'POST',
    body:JSON.stringify({amount:amountPaise,currency:'INR',receipt:`MT${Date.now().toString(36)}${crypto.randomUUID().slice(0,6)}`,notes})
  });
  if (!/^order_[A-Za-z0-9]+$/.test(order.id || '') || order.amount !== amountPaise || order.currency !== 'INR') throw new Error('The payment order could not be prepared.');
  const stored = await storeApi(env,{action:'create_order',channel:'razorpay',customer:address,address,lines:body.lines,
    shippingPaise:Number(env.SHIPPING_FLAT_PAISE),expectedSubtotalPaise:subtotalPaise,providerOrderId:order.id});
  if (stored.totalPaise !== amountPaise) throw new Error('The payment total changed. Please review your bag.');
  return json({orderId:order.id,amountPaise,keyId:env.RAZORPAY_KEY_ID,reference:stored.reference});
}
async function createWhatsAppOrder(request,env){
  const body = await readJson(request);
  const address = validateAddress(body.address);
  const {subtotalPaise} = await priceLines(body.lines,env);
  if (env.STORE_ORDERS_ENABLED !== 'true') return json({subtotalPaise,saved:false});
  const stored = await storeApi(env,{action:'create_order',channel:'whatsapp',customer:address,address,lines:body.lines,
    shippingPaise:0,expectedSubtotalPaise:subtotalPaise});
  return json({reference:stored.reference,subtotalPaise:stored.subtotalPaise});
}
async function verifyPayment(request,env){
  const body = await readJson(request);
  const orderId = clean(body.orderId,80), paymentId = clean(body.paymentId,80), received = clean(body.signature,64);
  if (!/^order_[A-Za-z0-9]+$/.test(orderId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId) || !/^[a-f0-9]{64}$/i.test(received)) throw new Error('The payment response is incomplete.');
  const order = await razorpay(`/orders/${orderId}`,env);
  const expected = await signature(order.id,paymentId,env.RAZORPAY_KEY_SECRET);
  if (!equalHex(expected,received.toLowerCase())) return json({error:'Payment signature could not be verified.'},400);
  const payment = await razorpay(`/payments/${paymentId}`,env);
  if (payment.order_id !== order.id || payment.amount !== order.amount || payment.currency !== 'INR') return json({error:'Payment does not match this order.'},400);
  if (payment.status !== 'captured') return json({status:'pending',orderId:order.id,paymentId});
  const stored = await storeApi(env,{action:'record_payment',providerOrderId:order.id,providerPaymentId:paymentId});
  return json({status:'paid',orderId:order.id,paymentId,reference:stored.reference});
}

export default {
  async fetch(request,env){
    const url = new URL(request.url);
    if (url.pathname === '/api/admin/config' && request.method === 'GET') {
      return json({url:env.SUPABASE_URL || '',ready:Boolean(env.SUPABASE_URL && env.STORE_SIGNING_PRIVATE_JWK)});
    }
    if (url.pathname === '/api/admin' && request.method === 'POST') {
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({error:'Cross-origin admin request is not allowed.'},403);
      if (Number(request.headers.get('content-length') || 0) > 2100000) return json({error:'Request too large.'},413);
      try {
        const token=request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
        if (!token) return json({error:'Please sign in.'},401);
        const raw=await request.text();
        if (raw.length > 2100000) return json({error:'Request too large.'},413);
        const body=JSON.parse(raw);
        if (!body || typeof body.action !== 'string' || !body.action.startsWith('admin_')) return json({error:'Invalid admin request.'},400);
        return json(await storeApi(env,{...body,adminToken:token}));
      } catch (error) {
        return json({error:error.message || 'Admin request failed.'},error.status || 502);
      }
    }
    if (url.pathname === '/api/catalog' && request.method === 'GET') {
      try { return json({products:await catalog(env)}); }
      catch { return json({error:'The product catalog is temporarily unavailable.'},503); }
    }
    if (!url.pathname.startsWith('/api/checkout/')) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found',{status:404});
    if (request.method === 'GET' && url.pathname === '/api/checkout/config') return json(config(env));
    if (request.method !== 'POST' || !['/api/checkout/order','/api/checkout/verify','/api/checkout/whatsapp'].includes(url.pathname)) return json({error:'Not found.'},404);
    if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) return json({error:'Cross-origin checkout is not allowed.'},403);
    if (url.pathname !== '/api/checkout/whatsapp' && !config(env).ready) return json({error:'Online payment is not configured yet.'},503);
    try {
      return url.pathname.endsWith('/order') ? await createOrder(request,env)
        : url.pathname.endsWith('/whatsapp') ? await createWhatsAppOrder(request,env)
        : await verifyPayment(request,env);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The checkout request failed.';
      const clientError = /^(Please|Your bag|The order amount|The checkout request|Product prices changed)/.test(message);
      return json({error:message},clientError?400:502);
    }
  }
};

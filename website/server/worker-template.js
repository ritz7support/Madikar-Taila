// Generated into dist/server/index.js by scripts/build-worker.mjs.
// Razorpay credentials stay in Supabase. Sites signs requests to the website service.
const encoder = new TextEncoder();
const STATIC_VERSION = '__STATIC_VERSION__';

async function staticAsset(request,env,ctx,path=null){
  if(!env.ASSETS)return new Response('Not found',{status:404});
  const assetUrl=new URL(request.url);if(path)assetUrl.pathname=path;
  const assetRequest=new Request(assetUrl,request);
  // Sites runs in an isolated Workers namespace where caches.default is forbidden.
  // Cache availability is an optimization; failures must never break a public page.
  let cache;
  try{cache=await globalThis.caches?.open('madikar-static-'+STATIC_VERSION)}catch{}
  if(request.method!=='GET'||!cache)return env.ASSETS.fetch(assetRequest);
  // Only public static files enter this cache. Every deployment has a content hash;
  // catalog, stock, admin operations and payment responses always bypass it.
  const keyUrl=new URL(request.url);keyUrl.pathname='/__madikar_static/'+STATIC_VERSION+assetUrl.pathname;keyUrl.search='';
  const key=new Request(keyUrl,{method:'GET'});
  let response;
  try{response=await cache.match(key)}catch{return env.ASSETS.fetch(assetRequest)}
  if(!response){
    response=await env.ASSETS.fetch(assetRequest);
    if(response.status===200&&!response.headers.has('set-cookie')&&!/private|no-store/i.test(response.headers.get('cache-control')||'')){
      const stored=new Response(response.clone().body,response);stored.headers.set('Cache-Control','public, max-age=300');
      const save=cache.put(key,stored).catch(()=>{});if(ctx?.waitUntil)ctx.waitUntil(save);else await save;
    }
  }
  const headers=new Headers(response.headers);
  if(!headers.has('set-cookie')&&!/private|no-store/i.test(headers.get('cache-control')||''))headers.set('Cache-Control','public, max-age=0, must-revalidate');
  if(response.status===200&&headers.get('etag')&&request.headers.get('if-none-match')===headers.get('etag'))return new Response(null,{status:304,headers});
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function json(value,status=200){
  return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
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
    body:raw,signal:AbortSignal.timeout(body.action === 'admin_upload_image' || body.action.startsWith('checkout_') ? 45000 : 12000)
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
async function readCheckout(request){
  if (Number(request.headers.get('content-length') || 0) > 12000) throw Object.assign(new Error('The checkout request is too large.'),{status:413});
  const raw=await request.text();
  if (raw.length > 12000) throw Object.assign(new Error('The checkout request is too large.'),{status:413});
  try { const body=JSON.parse(raw);if(!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();return body; }
  catch { throw Object.assign(new Error('Invalid checkout request.'),{status:400}); }
}
async function clientHash(request,env){
  // The edge sets this header. Do not trust client-supplied forwarding headers.
  const ip=request.headers.get('cf-connecting-ip') || 'unknown';
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode(env.STORE_SIGNING_PRIVATE_JWK+'|'+ip));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

export default {
  async fetch(request,env,ctx){
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
    if (request.method === 'GET' && /^\/products\/[^/]+\/?$/.test(url.pathname)) {
      return staticAsset(request,env,ctx,'/');
    }
    if (!url.pathname.startsWith('/api/checkout/')) return staticAsset(request,env,ctx);
    if (request.method === 'GET' && url.pathname === '/api/checkout/config') {
      try { return json(await storeApi(env,{action:'checkout_config'})); }
      catch { return json({ready:false,shippingPaise:null}); }
    }
    const actions={'/api/checkout/order':'checkout_create','/api/checkout/verify':'checkout_verify','/api/checkout/status':'checkout_status'};
    if (request.method !== 'POST' || !actions[url.pathname]) return json({error:'Not found.'},404);
    if (request.headers.get('origin') !== url.origin) return json({error:'Cross-origin checkout is not allowed.'},403);
    try {
      const body=await readCheckout(request);
      const payload={sessionId:body.sessionId,token:body.token,action:actions[url.pathname]};
      if(payload.action==='checkout_create') Object.assign(payload,{address:body.address,lines:body.lines,clientHash:await clientHash(request,env)});
      if(payload.action==='checkout_verify') Object.assign(payload,{orderId:body.orderId,paymentId:body.paymentId,signature:body.signature});
      return json(await storeApi(env,payload));
    } catch (error) {
      const status=error.status || 502;
      return json({error:status<500 ? error.message : 'Checkout is temporarily unavailable. Please try again.'},status);
    }
  }
};

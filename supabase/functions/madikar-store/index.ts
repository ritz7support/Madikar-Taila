import { createCheckoutService } from './checkout.ts';
import { createShipmentNotificationService } from './shipment.ts';
// Deployed as the madikar-store Supabase Edge Function.
// The existing Sites Worker and Vercel each hold a separate private signing key.
const PUBLIC_KEYS = [
  {"kty":"EC","x":"cq-NvRARsJ3yZ98RjzDONU2DQG5q8l08E3f5w2NQmhM","y":"XdcBtphFvmtRY-P3wDoRpB0sG98R9AfwxFao1apJJTk","crv":"P-256"},
  {"kty":"EC","x":"3l8SKGlnkOMjFKl8qGcvFTtQWxaMeNDD-a7FwxM8vOs","y":"fUThszv70RUw1d4h6zyD2FM4WxaeFXNFBFnJ5s22qKs","crv":"P-256"}
];
const encoder = new TextEncoder();
const projectUrl = Deno.env.get('SUPABASE_URL') || '';
const modernKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
const serviceKey = modernKeys ? JSON.parse(modernKeys).default : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ADMIN_LINK_HASH = '4240f4f9741453c302797fefb598e1b59631a0469895c4533c9ae0776b74f552';

function result(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}
  });
}
function decodeBase64Url(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function authentic(request, raw) {
  const stamp = request.headers.get('x-store-timestamp') || '';
  const signature = request.headers.get('x-store-signature') || '';
  if (!/^\d{13}$/.test(stamp) || !/^[A-Za-z0-9_-]{80,100}$/.test(signature)) return false;
  if (Math.abs(Date.now() - Number(stamp)) > 300000) return false;
  const signed = decodeBase64Url(signature);
  const payload = encoder.encode(stamp + '.' + raw);
  for (const publicKey of PUBLIC_KEYS) {
    const key = await crypto.subtle.importKey('jwk', publicKey,
      {name:'ECDSA', namedCurve:'P-256'}, false, ['verify']);
    if (await crypto.subtle.verify({name:'ECDSA', hash:'SHA-256'}, key, signed, payload)) return true;
  }
  return false;
}
async function database(path, options = {}, readOnly = !options.method || options.method === 'GET') {
  if (!projectUrl || !serviceKey) throw new Error('Supabase service configuration is unavailable');
  const headers = {
    apikey: serviceKey,
    'Content-Type':'application/json',
    Accept:'application/json',
    ...(options.headers || {})
  };
  if (!serviceKey.startsWith('sb_secret_')) headers.Authorization = 'Bearer ' + serviceKey;
  // PGRST303 has intermittently rejected otherwise valid catalog reads. Retry
  // only this read-only failure; never replay payment or admin writes.
  let response, payload;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(projectUrl + path, {...options, headers, signal:AbortSignal.timeout(12000)});
    payload = await response.json().catch(() => null);
    if (response.ok || !readOnly || payload?.code !== 'PGRST303' || attempt === 2) break;
    await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 150 : 350));
  }
  if (!response.ok) {
    console.error('Store database operation failed', response.status, payload?.code || '');
    if (payload?.message === 'Product prices changed') return {error:'Product prices changed', status:409};
    const transient = payload?.code === 'PGRST303';
    const error = new Error(transient ? 'The dashboard could not load right now. Please try again.' : 'Store database operation failed');
    error.status = transient ? 503 : response.status;
    error.transientDatabase = transient;
    throw error;
  }
  return {payload, status:200};
}

const adminText = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const adminId = value => /^[0-9]{1,18}$/.test(String(value || '')) ? String(value) : null;
const allowedImageUrl = value => {
  if (typeof value !== 'string') return false;
  if (/^assets\/[A-Za-z0-9_.-]+$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.origin === projectUrl && url.pathname.startsWith('/storage/v1/object/public/madikar-product-images/');
  } catch { return false; }
};
async function adminIdentity(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token)));
  const hex=[...digest].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  let mismatch=0;
  for(let i=0;i<64;i++) mismatch|=hex.charCodeAt(i)^ADMIN_LINK_HASH.charCodeAt(i);
  return mismatch===0?{email:'Team access'}:null;
}
async function storeProduct(productId) {
  const id = adminId(productId);
  if (!id) return null;
  const response = await database('/rest/v1/Product?select=id,store_id,catalog_id&id=eq.' + id + '&limit=1');
  return response.payload?.[0]?.store_id ? response.payload[0] : null;
}
function productFields(body) {
  const name = adminText(body.name,120);
  const category = adminText(body.category,60);
  const description = adminText(body.description,1000);
  if (name.length < 2 || category.length < 2 || !Array.isArray(body.images) ||
    (body.active && body.images.length < 1) || body.images.length > 6 || typeof body.active !== 'boolean') {
    throw new Error('Invalid product details');
  }
  const images = body.images.map(image => ({
    url:image?.url,alt:adminText(image?.alt,160),
    kind:image?.kind === 'product_photo' ? 'product_photo' : 'illustration'
  }));
  if (images.some(image => !allowedImageUrl(image.url))) throw new Error('Invalid product image');
  return {store_name:name,category,short_description:description,images,store_active:body.active};
}
function variantFields(body) {
  const size = adminText(body.size,40);
  const price = Number(body.price);
  const inventory = body.inventoryQuantity === null || body.inventoryQuantity === '' ? null : Number(body.inventoryQuantity);
  const status = body.availabilityStatus;
  if (!size || !Number.isFinite(price) || price < 1 || price > 100000 ||
    Math.round(price * 100) !== price * 100 ||
    (inventory !== null && (!Number.isInteger(inventory) || inventory < 0 || inventory > 1000000)) ||
    !['unverified','available','unavailable'].includes(status)) throw new Error('Invalid pack details');
  const fields = {size,price,inventory_quantity:inventory,availability_status:status};
  // Old admin tabs omit this field: preserve a previously saved weight on PATCH.
  if (Object.prototype.hasOwnProperty.call(body,'shippingWeightGrams')) {
    const raw = body.shippingWeightGrams;
    const weight = raw === null || (typeof raw === 'string' && raw.trim() === '') ? null : Number(raw);
    if (weight !== null && ((!['string','number'].includes(typeof raw)) ||
      !Number.isInteger(weight) || weight <= 0 || weight > 2147483647)) {
      throw Object.assign(new Error('Shipping weight must be a positive whole number of grams, or blank.'),{status:400});
    }
    fields.shipping_weight_grams = weight;
  }
  return fields;
}
async function adminAction(body) {
  if (body.action === 'admin_me') return {label:'Team access'};
  if (body.action === 'admin_catalog') {
    const [products,variants] = await Promise.all([
      database('/rest/v1/Product?select=id,store_id,store_name,name,category,short_description,images,store_sort_order,store_active,catalog_id&store_id=not.is.null&order=store_sort_order.asc'),
      database('/rest/v1/ProductVariant?select=id,product_id,position,size,price,inventory_quantity,availability_status,shipping_weight_grams&order=position.asc,id.asc')
    ]);
    const byId = new Map();
    for (const variant of variants.payload || []) {
      const list = byId.get(variant.product_id) || []; list.push(variant); byId.set(variant.product_id,list);
    }
    return {products:(products.payload || []).map(p => ({
      ...p,display_name:p.store_name || p.name,meta_linked:p.catalog_id !== 'madikar-store',
      variants:byId.get(p.id) || []
    }))};
  }
  if (body.action === 'admin_orders') {
    const page = Number(body.page);
    if (!Number.isInteger(page) || page < 0 || page > 1000) throw new Error('Invalid page');
    const source = body.source || 'all';
    if (!['all','store','whatsapp'].includes(source)) throw Object.assign(new Error('Invalid order source'),{status:400});
    const orders = await database('/rest/v1/rpc/store_admin_orders_page',{
      method:'POST',body:JSON.stringify({p_page:page,p_source:source})
    },true);
    return orders.payload;
  }
  if (body.action === 'admin_update_fulfillment') {
    const id = adminId(body.id);
    const stage = body.status;
    const previous = body.previousStatus;
    const stages = ['processing','shipped','completed','cancelled'];
    if (!id || !stages.includes(stage) || !stages.includes(previous)) {
      throw Object.assign(new Error('Invalid order status'),{status:400});
    }
    const fields = {fulfillment_status:stage};
    if (stage === 'shipped') {
      const tracking = typeof body.trackingId === 'string' ? body.trackingId.trim() : '';
      if (!tracking || tracking.length > 120 || /[\x00-\x1f\x7f]/.test(tracking)) {
        throw Object.assign(new Error('Enter a tracking ID of 1 to 120 characters before marking the order shipped.'),{status:400});
      }
      fields.tracking_id = tracking;
      // Old admin tabs omit the estimate; preserve an existing value on PATCH.
      if (Object.prototype.hasOwnProperty.call(body,'estimatedDeliveryDays')) {
        const raw = body.estimatedDeliveryDays;
        const days = raw === null || (typeof raw === 'string' && raw.trim() === '') ? null : Number(raw);
        if (days !== null && (!['number','string'].includes(typeof raw) || !Number.isInteger(days) || days < 1 || days > 2147483647)) {
          throw Object.assign(new Error('Estimated delivery must be a positive whole number of days, or blank.'),{status:400});
        }
        fields.estimated_delivery_days = days;
      }
    }
    const response = await database('/rest/v1/orders?id=eq.' + id + '&status=neq.pending_payment&fulfillment_status=eq.' + previous,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(fields)
    });
    const order = response.payload?.[0];
    if (!order) throw Object.assign(new Error('Order changed or is awaiting payment. Refresh orders and try again.'),{status:409});
    if (stage === 'shipped' && order.estimated_delivery_days) scheduleShipmentNotification(order.id);
    return {id:order.id,fulfillmentStatus:order.fulfillment_status,trackingId:order.tracking_id || null,
      estimatedDeliveryDays:order.estimated_delivery_days ?? null,
      ...(stage==='shipped'?{shipmentNotification:await shipmentService.view(order.id).catch(()=>null)}:{})};
  }
  if (body.action === 'admin_shipment_notification' || body.action === 'admin_retry_shipment_notification') {
    const id=adminId(body.id);
    if (!id) throw Object.assign(new Error('Invalid order'),{status:400});
    if (body.action === 'admin_retry_shipment_notification') {
      await shipmentService.retry(id);
      scheduleShipmentNotification(id);
    }
    return {shipmentNotification:await shipmentService.view(id)};
  }
  if (body.action === 'admin_save_product') {
    const product = await storeProduct(body.id);
    if (!product) throw new Error('Product not found');
    const fields=productFields(body);
    if (fields.store_active) {
      const variants=await database('/rest/v1/ProductVariant?select=id&product_id=eq.' + product.id + '&limit=1');
      if (!variants.payload?.length) throw new Error('Add a pack size before listing the product');
    }
    const response=await database('/rest/v1/Product?id=eq.' + product.id,{
      method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(fields)
    });
    return {product:response.payload?.[0]};
  }
  if (body.action === 'admin_add_product') {
    const fields=productFields({...body,active:false});
    const last=await database('/rest/v1/Product?select=store_sort_order&store_sort_order=not.is.null&order=store_sort_order.desc&limit=1');
    const storeId='p' + Date.now() + Math.floor(Math.random()*100000).toString().padStart(5,'0');
    const response=await database('/rest/v1/Product',{
      method:'POST',headers:{Prefer:'return=representation'},
      body:JSON.stringify({...fields,name:fields.store_name,description:fields.short_description,
        store_id:storeId,retailer_id:storeId,catalog_id:'madikar-store',
        store_sort_order:Number(last.payload?.[0]?.store_sort_order || 0)+1})
    });
    return {product:response.payload?.[0]};
  }
  if (body.action === 'admin_save_variant') {
    const fields=variantFields(body);
    let product;
    if (body.id != null) {
      const id=adminId(body.id);
      if (!id) throw new Error('Invalid pack');
      const record=await database('/rest/v1/ProductVariant?select=id,product_id&id=eq.' + id + '&limit=1');
      product=await storeProduct(record.payload?.[0]?.product_id);
      if (!product) throw new Error('Pack not found');
      const response=await database('/rest/v1/ProductVariant?id=eq.' + id,{
        method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(fields)
      });
      return {variant:response.payload?.[0]};
    }
    product=await storeProduct(body.productId);
    if (!product) throw new Error('Product not found');
    const variants=await database('/rest/v1/ProductVariant?select=position&product_id=eq.' + product.id + '&order=position.desc&limit=1');
    const response=await database('/rest/v1/ProductVariant',{
      method:'POST',headers:{Prefer:'return=representation'},
      body:JSON.stringify({...fields,product_id:product.id,position:Number(variants.payload?.[0]?.position ?? -1)+1})
    });
    return {variant:response.payload?.[0]};
  }
  if (body.action === 'admin_upload_image') {
    const product=await storeProduct(body.productId);
    if (!product) throw new Error('Product not found');
    const extensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    const mime=body.mime, extension=extensions[mime];
    if (!extension || typeof body.base64 !== 'string' || body.base64.length > 2000000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(body.base64)) throw new Error('Invalid image');
    const binary=atob(body.base64);
    if (binary.length > 1500000 || binary.length < 100) throw new Error('Invalid image size');
    const bytes=Uint8Array.from(binary,c => c.charCodeAt(0));
    const isJpeg=mime==='image/jpeg' && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    const isPng=mime==='image/png' && bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71;
    const isWebp=mime==='image/webp' && binary.slice(0,4)==='RIFF' && binary.slice(8,12)==='WEBP';
    if (!isJpeg && !isPng && !isWebp) throw new Error('Invalid image content');
    const path='products/' + product.store_id + '/' + crypto.randomUUID() + '.' + extension;
    const headers={apikey:serviceKey,'Content-Type':mime,'cache-control':'3600'};
    if (!serviceKey.startsWith('sb_secret_')) headers.Authorization='Bearer ' + serviceKey;
    const uploaded=await fetch(projectUrl + '/storage/v1/object/madikar-product-images/' + path,{
      method:'POST',headers,body:bytes,signal:AbortSignal.timeout(30000)
    });
    if (!uploaded.ok) throw new Error('Image upload failed');
    return {url:projectUrl + '/storage/v1/object/public/madikar-product-images/' + path};
  }
  throw new Error('Unknown admin operation');
}

const checkoutService = createCheckoutService({database,env:key=>Deno.env.get(key),background:promise=>EdgeRuntime.waitUntil(promise)});
const shipmentService = createShipmentNotificationService({database,env:key=>Deno.env.get(key)});
function scheduleShipmentNotification(orderId){
  EdgeRuntime.waitUntil(shipmentService.work(orderId).catch(()=>console.error('Shipment notification will be reconciled by recovery.')));
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return result({error:'Method not allowed'},405);
  const path = new URL(request.url).pathname;
  if (path.endsWith('/shipment-recovery')) {
    try {
      if (!await checkoutService.authorizeRecovery(request.headers.get('x-checkout-recovery'))) return result({error:'Unauthorized'},401);
      return result(await shipmentService.work());
    } catch { return result({error:'Shipment recovery temporarily unavailable'},503); }
  }
  if (path.endsWith('/checkout-recovery')) {
    try {
      if (!await checkoutService.authorizeRecovery(request.headers.get('x-checkout-recovery'))) return result({error:'Unauthorized'},401);
      return result(await checkoutService.work());
    }
    catch { return result({error:'Recovery temporarily unavailable'},503); }
  }
  if (path.endsWith('/razorpay-webhook')) {
    try {
      if (Number(request.headers.get('content-length') || 0) > 100000) return result({error:'Request too large'},413);
      const event = await request.text();
      if (event.length > 100000) return result({error:'Request too large'},413);
      return result(await checkoutService.webhook(event,request.headers.get('x-razorpay-signature')));
    } catch(error) { return result({error:'Payment event could not be accepted'},error.status || 503); }
  }
  if (Number(request.headers.get('content-length') || 0) > 2100000) return result({error:'Request too large'},413);
  let raw;
  try {
    raw = await request.text();
    if (raw.length > 2100000 || !await authentic(request, raw)) return result({error:'Unauthorized'},401);
  } catch {
    return result({error:'Unauthorized'},401);
  }
  let body;
  try { body = JSON.parse(raw); } catch { return result({error:'Invalid JSON'},400); }
  if (body.action !== 'admin_upload_image' && raw.length > 20000) return result({error:'Request too large'},413);
  try {
    if (body.action === 'checkout_config') return result(await checkoutService.config());
    if (body.action === 'checkout_create') return result(await checkoutService.create(body));
    if (body.action === 'checkout_verify') return result(await checkoutService.verify(body));
    if (body.action === 'checkout_status') return result(await checkoutService.status(body));
    if (typeof body.action === 'string' && body.action.startsWith('admin_')) {
      const admin=await adminIdentity(body.adminToken);
      if (!admin) return result({error:'Owner access required'},403);
      return result(await adminAction({...body,admin}));
    }
    if (body.action === 'catalog') {
      const [productResponse,variantResponse] = await Promise.all([
        database('/rest/v1/Product?select=id,store_id,slug,category,name,store_name,website_description,traditional_benefits,extraction_craft,ingredients_and_more,images&store_active=eq.true&store_id=not.is.null&slug=not.is.null&order=store_sort_order.asc'),
        database('/rest/v1/ProductVariant?select=product_id,position,size,price,inventory_quantity,availability_status&order=position.asc')
      ]);
      const variantsByProduct = new Map();
      for (const variant of variantResponse.payload || []) {
        const list = variantsByProduct.get(variant.product_id) || [];
        list.push({size:variant.size,price:Number(variant.price),
          available:variant.availability_status === 'available' && variant.inventory_quantity !== 0,
          orderable:variant.availability_status !== 'unavailable' && variant.inventory_quantity !== 0,
          availabilityStatus:variant.availability_status,inventoryQuantity:variant.inventory_quantity});
        variantsByProduct.set(variant.product_id,list);
      }
      const products = (productResponse.payload || []).map(p => ({
        id:p.store_id, slug:p.slug, category:p.category, name:p.store_name || p.name,
        note:p.website_description || '', traditional_benefits:p.traditional_benefits || '',
        extraction_craft:p.extraction_craft || '', ingredients_and_more:p.ingredients_and_more || '',
        image:p.images?.[0]?.url || '',
        image_alt:p.images?.[0]?.kind === 'product_photo' ? p.images?.[0]?.alt || '' : '',
        image_kind:p.images?.[0]?.kind || 'illustration', variants:variantsByProduct.get(p.id) || []
      }));
      return result({products});
    }
    return result({error:'Unknown operation'},404);
  } catch (error) {
    console.error('Madikar store operation failed', error);
    return result({error:error.transientDatabase || error.status && error.status < 500 ? error.message : 'Store service is temporarily unavailable'},error.status || 502);
  }
});

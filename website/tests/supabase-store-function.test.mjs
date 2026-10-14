import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash, generateKeyPairSync, webcrypto} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('Supabase function rejects unsigned requests and accepts signed catalog/admin operations and rejects retired order actions',async () => {
  const pair = generateKeyPairSync('ec',{namedCurve:'P-256'});
  const publicJwk = pair.publicKey.export({format:'jwk'});
  const privateJwk = pair.privateKey.export({format:'jwk'});
  const adminToken='a'.repeat(43);
  const source = readFileSync(new URL('../../supabase/functions/madikar-store/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'')
    .replace(/const PUBLIC_KEYS = \[[\s\S]*?\];/,`const PUBLIC_KEYS = [${JSON.stringify(publicJwk)}];`)
    .replace(/const ADMIN_LINK_HASH = '[a-f0-9]{64}';/,`const ADMIN_LINK_HASH = '${createHash('sha256').update(adminToken).digest('hex')}';`);
  let handler;
  let variant={id:10,product_id:1,position:0,size:'500 ml',price:175,inventory_quantity:5,availability_status:'available',shipping_weight_grams:null,retailer_id:'Verified-Pack-ID'};
  let rejectCatalogReads=0;
  let rejectOrderReads=0;
  const orders=Array.from({length:25},(_,index)=>({id:index+1,reference_id:'ORDER-'+(index+1),source:index<8?'store':'whatsapp',
    status:index===0?'pending_payment':'processing',fulfillment_status:'processing',created_at:'2026-10-07T00:00:00Z',
    total:175,subtotal:175,shipping:0,profile_id:null,address_id:null}));
  const databaseCalls = [];
  const shipmentWork=[],shipmentRetries=[];
  const notifications=new Map();
  const sandbox = {
    createCheckoutService:()=>({authorizeRecovery:async token=>token==='recovery-token'}),
    createShipmentNotificationService:()=>({work:async id=>{shipmentWork.push(id);return {checked:0}},
      view:async id=>notifications.get(Number(id)) || null,retry:async id=>{shipmentRetries.push(id)}}),
    EdgeRuntime:{waitUntil:promise=>promise.catch(()=>{})},
    Deno:{env:{get:key => ({SUPABASE_URL:'https://supabase.example',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_test'})})[key]},serve:fn => {handler=fn}},
    crypto:webcrypto, TextEncoder, Response, Request, URL, atob, AbortSignal, Date, setTimeout,
    console:{error:() => {}},
    fetch:async (url,options) => {
      databaseCalls.push({url:String(url),options});
      assert.equal(options.headers.apikey,'sb_secret_test');
      assert.equal(options.headers.Authorization,undefined);
      if (String(url).includes('/Product?') && options.method === 'PATCH') {
        const updated=JSON.parse(options.body);
        assert.deepEqual(Object.keys(updated).sort(),['category','images','short_description','store_active','store_name']);
        return Response.json([{id:1,...updated}]);
      }
      if (String(url).includes('/Product?') && String(url).includes('id=eq.1')) return Response.json([{id:1,store_id:'p1',catalog_id:'1515875913870520'}]);
      if (String(url).includes('/Product?')) return Response.json([{id:1,store_id:'p1',slug:'groundnut-oil',name:'Groundnut Oil',category:'Oils',website_description:'Groundnut oil',images:[{url:'assets/groundnut-oil.jpg',alt:'Groundnut Oil product image',kind:'product_photo'}]}]);
      if (String(url).includes('/ProductVariant')) {
        if (!options.method && rejectCatalogReads-->0) return Response.json({code:'PGRST303',message:'JWT claims validation failed'},{status:401});
        if (options.method === 'PATCH') variant={...variant,...JSON.parse(options.body)};
        if (options.method === 'POST') return Response.json([{id:11,shipping_weight_grams:null,retailer_id:null,...JSON.parse(options.body)}]);
        return Response.json([variant]);
      }
      if (String(url).includes('/rpc/store_admin_orders_page')) {
        if(rejectOrderReads-->0)return Response.json({code:'PGRST303'},{status:401});
        const {p_page,p_source}=JSON.parse(options.body);
        const found=orders.filter(o=>p_source==='all'||o.source===p_source).toSorted((a,b)=>b.id-a.id);
        return Response.json({orders:found.slice(p_page*20,(p_page+1)*20),hasMore:found.length>(p_page+1)*20,page:p_page});
      }
      if (String(url).includes('/rest/v1/orders?')) {
        const query=new URL(url).searchParams;
        if (options.method === 'PATCH') {
          const order=orders.find(o=>String(o.id)===query.get('id')?.slice(3));
          if (!order || order.status==='pending_payment' || order.fulfillment_status!==query.get('fulfillment_status')?.slice(3)) return Response.json([]);
          Object.assign(order,JSON.parse(options.body));
          if(order.fulfillment_status==='shipped'&&order.estimated_delivery_days)notifications.set(order.id,{status:'pending',attempts:0});
          return Response.json([order]);
        }
        const source=query.get('source')?.slice(3);
        return Response.json(orders.filter(o=>!source||o.source===source).toSorted((a,b)=>b.id-a.id)
          .slice(Number(query.get('offset')),Number(query.get('offset'))+Number(query.get('limit'))));
      }
      if (String(url).includes('/rest/v1/order_items?') || String(url).includes('/rest/v1/payments?')) return Response.json([]);
      if (String(url).includes('store_create_order')) return Response.json({reference:'STORE-TEST123',subtotalPaise:35000});
      if (String(url).includes('store_record_payment')) return Response.json({reference:'STORE-TEST123',status:'paid'});
      throw new Error('Unexpected database call');
    }
  };
  vm.runInNewContext(source,sandbox);
  const endpoint = 'https://supabase.example/functions/v1/madikar-store';
  const unsigned = await handler(new Request(endpoint,{method:'POST',body:JSON.stringify({action:'catalog'})}));
  assert.equal(unsigned.status,401);
  assert.equal(databaseCalls.length,0);

  const key = await webcrypto.subtle.importKey('jwk',privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  async function send(body) {
    const raw = JSON.stringify(body), stamp = String(Date.now());
    const bytes = new Uint8Array(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(stamp+'.'+raw)));
    const signature = Buffer.from(bytes).toString('base64url');
    return handler(new Request(endpoint,{method:'POST',headers:{'x-store-timestamp':stamp,'x-store-signature':signature},body:raw}));
  }
  const catalog = await send({action:'catalog'});
  assert.deepEqual(await catalog.json(),{products:[{id:'p1',slug:'groundnut-oil',name:'Groundnut Oil',category:'Oils',note:'Groundnut oil',traditional_benefits:'',extraction_craft:'',ingredients_and_more:'',image:'assets/groundnut-oil.jpg',image_alt:'Groundnut Oil product image',image_kind:'product_photo',variants:[{size:'500 ml',price:175,available:true,orderable:true,availabilityStatus:'available',inventoryQuantity:5}]}]});
  const created = await send({action:'create_order',channel:'whatsapp',lines:[{id:'p1',variant:0,quantity:1}]});
  assert.equal(created.status,404);
  const paid = await send({action:'record_payment',providerOrderId:'order_TEST123',providerPaymentId:'pay_TEST123'});
  assert.equal(paid.status,404);
  const denied = await send({action:'admin_me',adminToken:'invalid'});
  assert.equal(denied.status,403);
  const admin = await send({action:'admin_me',adminToken});
  assert.deepEqual(await admin.json(),{label:'Team access'});
  const saved = await send({action:'admin_save_product',adminToken,id:1,
    name:'Groundnut Oil',category:'Oils',description:'Store description',
    images:[{url:'assets/groundnut-oil.jpg',alt:'Groundnut Oil',kind:'product_photo'}],active:false});
  assert.equal((await saved.json()).product.store_name,'Groundnut Oil');

  // Weight writes round-trip through authenticated admin operations, without
  // changing existing prices/stock or the public catalog response contract.
  const pack={action:'admin_save_variant',adminToken,id:10,size:'500 ml',price:175,inventoryQuantity:5,availabilityStatus:'available'};
  const before={...variant};
  const weighted=await send({...pack,shippingWeightGrams:'550'});
  assert.equal(weighted.status,200);
  assert.deepEqual((await weighted.json()).variant,{...before,shipping_weight_grams:550});
  const adminCatalog=await send({action:'admin_catalog',adminToken});
  assert.equal((await adminCatalog.json()).products[0].variants[0].shipping_weight_grams,550);
  assert.ok(databaseCalls.some(c=>c.url.includes('select=id,product_id,position,size,price,inventory_quantity,availability_status,shipping_weight_grams')));
  rejectCatalogReads=1;
  const retried=await send({action:'admin_catalog',adminToken});
  assert.equal(retried.status,200,'transient PGRST303 read should recover');
  rejectCatalogReads=3;
  const unavailable=await send({action:'admin_catalog',adminToken});
  assert.equal(unavailable.status,503,'persistent read failure is not an invalid team code');
  assert.match((await unavailable.json()).error,/try again/i);
  const orderCalls=databaseCalls.length;
  const firstPage=await send({action:'admin_orders',adminToken,page:0,source:'all'});
  const firstResult=await firstPage.json();
  assert.equal(firstResult.orders.length,20);
  assert.equal(firstResult.hasMore,true);
  assert.equal(firstResult.orders[0].id,25);
  assert.equal(databaseCalls.length-orderCalls,1,'one database request loads the complete page');
  const secondResult=await (await send({action:'admin_orders',adminToken,page:1,source:'all'})).json();
  assert.equal(secondResult.orders.length,5);
  assert.equal(secondResult.hasMore,false);
  const websiteOrders=await (await send({action:'admin_orders',adminToken,page:0,source:'store'})).json();
  assert.equal(websiteOrders.orders.length,8);
  assert.ok(websiteOrders.orders.every(o=>o.source==='store'));
  rejectOrderReads=1;
  assert.equal((await send({action:'admin_orders',adminToken,page:0,source:'all'})).status,200,'read-only RPC retries PGRST303');
  for(const trackingId of [undefined,'','   ','x'.repeat(121),'bad\ntracking']){
    const count=databaseCalls.length;
    assert.equal((await send({action:'admin_update_fulfillment',adminToken,id:2,status:'shipped',previousStatus:'processing',trackingId})).status,400);
    assert.equal(databaseCalls.length,count,'invalid tracking must not reach the database');
  }
  for(const estimatedDeliveryDays of [0,-1,1.5,'abc',true,[],{},2147483648]){
    const count=databaseCalls.length;
    assert.equal((await send({action:'admin_update_fulfillment',adminToken,id:2,status:'shipped',previousStatus:'processing',trackingId:'TRACK-123',estimatedDeliveryDays})).status,400);
    assert.equal(databaseCalls.length,count,'invalid delivery estimates must not write');
  }
  const changed=await send({action:'admin_update_fulfillment',adminToken,id:2,status:'shipped',previousStatus:'processing',trackingId:' TRACK-123 ',estimatedDeliveryDays:'5'});
  assert.equal(changed.status,200);
  assert.equal((await changed.json()).fulfillmentStatus,'shipped');
  assert.equal(orders[1].status,'processing','payment and bot status must remain unchanged');
  assert.equal(orders[1].tracking_id,'TRACK-123');
  assert.equal(orders[1].estimated_delivery_days,5);
  assert.ok(shipmentWork.includes(2),'shipment sends are scheduled after successful save');
  assert.equal((await (await send({action:'admin_shipment_notification',adminToken,id:2})).json()).shipmentNotification.status,'pending');
  assert.equal((await send({action:'admin_retry_shipment_notification',adminToken,id:2})).status,200);
  assert.deepEqual(shipmentRetries,['2']);
  assert.equal((await send({action:'admin_retry_shipment_notification',adminToken:'invalid',id:2})).status,403);
  assert.equal(shipmentRetries.length,1);
  const unauthorizedRecovery=await handler(new Request(endpoint+'/shipment-recovery',{method:'POST'}));
  assert.equal(unauthorizedRecovery.status,401);
  assert.equal((await handler(new Request(endpoint+'/shipment-recovery',{method:'POST',headers:{'x-checkout-recovery':'recovery-token'}}))).status,200);
  const legacyShipment=await send({action:'admin_update_fulfillment',adminToken,id:2,status:'shipped',previousStatus:'shipped',trackingId:'TRACK-123'});
  assert.equal((await legacyShipment.json()).estimatedDeliveryDays,5,'old admin clients preserve saved estimates');
  const clearedShipment=await send({action:'admin_update_fulfillment',adminToken,id:2,status:'shipped',previousStatus:'shipped',trackingId:'TRACK-123',estimatedDeliveryDays:null});
  assert.equal((await clearedShipment.json()).estimatedDeliveryDays,null);
  assert.equal((await send({action:'admin_update_fulfillment',adminToken,id:1,status:'shipped',previousStatus:'processing',trackingId:'TRACK-123'})).status,409);
  assert.equal((await send({action:'admin_update_fulfillment',adminToken,id:2,status:'completed',previousStatus:'processing'})).status,409);
  assert.equal((await send({action:'admin_update_fulfillment',adminToken,id:2,status:'unknown',previousStatus:'shipped'})).status,400);
  assert.equal((await send({action:'admin_update_fulfillment',adminToken:'invalid',id:2,status:'completed',previousStatus:'shipped'})).status,403);
  const legacy=await send(pack);
  assert.equal((await legacy.json()).variant.shipping_weight_grams,550,'old admin clients must preserve saved weights');
  const publicCatalog=await send({action:'catalog'});
  const publicVariant=(await publicCatalog.json()).products[0].variants[0];
  assert.equal(publicVariant.price,175);
  assert.equal(publicVariant.orderable,true);
  assert.equal(Object.hasOwn(publicVariant,'shipping_weight_grams'),false);
  assert.equal(Object.hasOwn(publicVariant,'retailer_id'),false,'Phase 1 must preserve the public catalog contract');
  assert.equal(variant.retailer_id,'Verified-Pack-ID','existing admin saves preserve mapped IDs');
  for (const invalid of [0,-1,0.5,'500.5','abc',true,[],{},2147483648]) {
    const calls=databaseCalls.length;
    const rejected=await send({...pack,shippingWeightGrams:invalid});
    assert.equal(rejected.status,400,JSON.stringify(invalid));
    assert.match((await rejected.json()).error,/whole number of grams/);
    assert.equal(databaseCalls.length,calls,'invalid weights must not reach the database');
  }
  for (const blank of ['',null,'   ']) {
    const cleared=await send({...pack,shippingWeightGrams:blank});
    assert.equal((await cleared.json()).variant.shipping_weight_grams,null);
  }
  const {id:ignoredId,...newPack}=pack;
  for (const weight of [250,'']) {
    const added=await send({...newPack,productId:1,shippingWeightGrams:weight});
    assert.equal(added.status,200);
    const addedVariant=(await added.json()).variant;
    assert.equal(addedVariant.shipping_weight_grams,weight === '' ? null : weight);
    assert.equal(addedVariant.retailer_id,null,'new packs need no retailer ID in Phase 1');
  }
  for (const retailerId of [null,'Verified-Pack-ID']) {
    variant.retailer_id=retailerId;
    const unchanged=await send({...pack,retailerId:'unreviewed',retailer_id:'unreviewed'});
    assert.equal((await unchanged.json()).variant.retailer_id,retailerId,'current admin field whitelist preserves nullable/mapped metadata');
    const lastPatch=databaseCalls.filter(c=>c.options.method==='PATCH'&&c.url.includes('/ProductVariant')).at(-1);
    assert.equal(Object.hasOwn(JSON.parse(lastPatch.options.body),'retailer_id'),false);
  }
  const calls=databaseCalls.length;
  assert.equal((await send({...pack,adminToken:'invalid',shippingWeightGrams:600})).status,403);
  assert.equal(databaseCalls.length,calls);
});

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
  const source = readFileSync(new URL('../../supabase/functions/madikar-store/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'')
    .replace(/const PUBLIC_KEYS = \[[\s\S]*?\];/,`const PUBLIC_KEYS = [${JSON.stringify(publicJwk)}];`)
    .replace(/const ADMIN_LINK_HASH = '[a-f0-9]{64}';/,`const ADMIN_LINK_HASH = '${createHash('sha256').update(adminToken).digest('hex')}';`);
  let handler;
  const databaseCalls = [];
  const sandbox = {
    createCheckoutService:()=>({}),
    Deno:{env:{get:key => ({SUPABASE_URL:'https://supabase.example',SUPABASE_SECRET_KEYS:JSON.stringify({default:'sb_secret_test'})})[key]},serve:fn => {handler=fn}},
    crypto:webcrypto, TextEncoder, Response, Request, URL, atob, AbortSignal, Date,
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
      if (String(url).includes('/ProductVariant?')) return Response.json([{product_id:1,position:0,size:'500 ml',price:175,inventory_quantity:5,availability_status:'available'}]);
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
});

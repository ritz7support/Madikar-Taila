import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac, generateKeyPairSync, webcrypto} from 'node:crypto';
import worker from '../dist/server/index.js';

const pair = generateKeyPairSync('ec',{namedCurve:'P-256'});
const publicJwk = pair.publicKey.export({format:'jwk'});
const env = {
  RAZORPAY_KEY_ID:'rzp_test_example', RAZORPAY_KEY_SECRET:'test_secret',
  SHIPPING_FLAT_PAISE:'5000', SUPABASE_URL:'https://supabase.example', STORE_ORDERS_ENABLED:'true',
  STORE_SIGNING_PRIVATE_JWK:JSON.stringify(pair.privateKey.export({format:'jwk'}))
};
const origin = 'https://store.example';
const address = {name:'Test Customer',phone:'9876543210',email:'test@example.com',line1:'1 Market Road',line2:'Near the park',city:'Dharwad',state:'Karnataka',postalCode:'580001'};
const body = {lines:[{id:'p1',variant:0,quantity:2}],address};
const post = (path,data) => new Request(`${origin}${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(data)});
const catalog = [{id:'p1',name:'Groundnut Oil',category:'Oils',note:'Groundnut oil',image:'',image_alt:null,variants:[{size:'500 ml',price:175,available:true,orderable:true,inventoryQuantity:5}]}];

async function signedCall(options) {
  const stamp = options.headers['x-store-timestamp'];
  const bytes = Buffer.from(options.headers['x-store-signature'].replaceAll('-','+').replaceAll('_','/'),'base64');
  const key = await webcrypto.subtle.importKey('jwk',publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  assert.equal(await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,bytes,new TextEncoder().encode(stamp+'.'+options.body)),true);
  return JSON.parse(options.body);
}

test('checkout stays unavailable before credentials are configured',async () => {
  const response = await worker.fetch(new Request(`${origin}/api/checkout/config`),{});
  assert.deepEqual(await response.json(),{ready:false,shippingPaise:null});
  const order = await worker.fetch(post('/api/checkout/order',body),{});
  assert.equal(order.status,503);
});

test('catalog and WhatsApp order use signed Supabase requests',async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url,options) => {
    assert.equal(String(url),'https://supabase.example/functions/v1/madikar-store');
    const call = await signedCall(options); calls.push(call);
    if (call.action === 'catalog') return Response.json({products:catalog});
    if (call.action === 'create_order') return Response.json({reference:'STORE-TEST123',subtotalPaise:35000,totalPaise:35000});
    throw new Error(`Unexpected action: ${call.action}`);
  };
  try {
    const response = await worker.fetch(new Request(`${origin}/api/catalog`),env);
    assert.deepEqual((await response.json()).products,catalog);
    const order = await worker.fetch(post('/api/checkout/whatsapp',body),{
      SUPABASE_URL:env.SUPABASE_URL,STORE_SIGNING_PRIVATE_JWK:env.STORE_SIGNING_PRIVATE_JWK,STORE_ORDERS_ENABLED:'true'
    });
    assert.equal(order.status,200);
    assert.equal((await order.json()).reference,'STORE-TEST123');
    assert.equal(calls.at(-1).channel,'whatsapp');
    assert.equal(calls.at(-1).expectedSubtotalPaise,35000);
  } finally {globalThis.fetch = originalFetch}
});

test('Razorpay payment is verified before the shared order is marked paid',async () => {
  const originalFetch = globalThis.fetch;
  let orderRequest;
  const calls = [];
  globalThis.fetch = async (url,options) => {
    if (String(url).endsWith('/functions/v1/madikar-store')) {
      const call = await signedCall(options); calls.push(call);
      if (call.action === 'catalog') return Response.json({products:catalog});
      if (call.action === 'create_order') return Response.json({reference:'STORE-TEST123',subtotalPaise:35000,totalPaise:40000});
      if (call.action === 'record_payment') return Response.json({reference:'STORE-TEST123',status:'paid'});
    }
    if (String(url).endsWith('/orders') && options?.method === 'POST') {
      orderRequest = JSON.parse(options.body);
      return Response.json({id:'order_TEST123',amount:orderRequest.amount,currency:'INR'});
    }
    if (String(url).endsWith('/orders/order_TEST123')) return Response.json({id:'order_TEST123',amount:40000,currency:'INR'});
    if (String(url).endsWith('/payments/pay_TEST123')) return Response.json({id:'pay_TEST123',order_id:'order_TEST123',amount:40000,currency:'INR',status:'captured'});
    throw new Error(`Unexpected URL: ${url}`);
  };
  try {
    const created = await worker.fetch(post('/api/checkout/order',body),env);
    assert.equal(created.status,200);
    assert.deepEqual(await created.json(),{orderId:'order_TEST123',amountPaise:40000,keyId:'rzp_test_example',reference:'STORE-TEST123'});
    assert.equal(orderRequest.amount,40000);
    assert.equal(orderRequest.notes.address_line_1,'1 Market Road');
    assert.equal(calls.find(x=>x.action==='create_order').providerOrderId,'order_TEST123');
    const signature = createHmac('sha256',env.RAZORPAY_KEY_SECRET).update('order_TEST123|pay_TEST123').digest('hex');
    const verified = await worker.fetch(post('/api/checkout/verify',{orderId:'order_TEST123',paymentId:'pay_TEST123',signature}),env);
    assert.equal((await verified.json()).status,'paid');
    assert.equal(calls.at(-1).action,'record_payment');
    const forged = await worker.fetch(post('/api/checkout/verify',{orderId:'order_TEST123',paymentId:'pay_TEST123',signature:'0'.repeat(64)}),env);
    assert.equal(forged.status,400);
    const invalid = await worker.fetch(post('/api/checkout/order',{...body,lines:[{id:'p1',variant:0,quantity:'2'}]}),env);
    assert.equal(invalid.status,400);
  } finally {globalThis.fetch = originalFetch}
});

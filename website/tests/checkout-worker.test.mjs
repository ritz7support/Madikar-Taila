import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPairSync,webcrypto} from 'node:crypto';
import worker from '../dist/server/index.js';
const pair=generateKeyPairSync('ec',{namedCurve:'P-256'});
const env={SUPABASE_URL:'https://supabase.example',STORE_SIGNING_PRIVATE_JWK:JSON.stringify(pair.privateKey.export({format:'jwk'}))};
const origin='https://store.example';
const post=(path,body)=>new Request(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function signedCall(options){
  const key=await webcrypto.subtle.importKey('jwk',pair.publicKey.export({format:'jwk'}),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  assert.equal(await webcrypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,Buffer.from(options.headers['x-store-signature'],'base64url'),new TextEncoder().encode(options.headers['x-store-timestamp']+'.'+options.body)),true);
  return JSON.parse(options.body);
}
test('missing Sites signing configuration fails closed without upstream requests',async()=>{
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Must not call upstream')};
  try{
    const config=await worker.fetch(new Request(origin+'/api/checkout/config'),{});
    assert.deepEqual(await config.json(),{ready:false,shippingPaise:null});
    assert.equal((await worker.fetch(post('/api/checkout/order',{}),{})).status,502);
  }finally{globalThis.fetch=original}
});
test('catalog/config are signed; retired WhatsApp checkout cannot create an order',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,env.SUPABASE_URL+'/functions/v1/madikar-store');
    const body=await signedCall(options);calls.push(body.action);
    return Response.json(body.action==='catalog'?{products:[{id:'p1'}]}:{ready:true,shippingPaise:0});
  };
  try{
    assert.deepEqual(await (await worker.fetch(new Request(origin+'/api/catalog'),env)).json(),{products:[{id:'p1'}]});
    assert.deepEqual(await (await worker.fetch(new Request(origin+'/api/checkout/config'),env)).json(),{ready:true,shippingPaise:0});
    assert.equal((await worker.fetch(post('/api/checkout/whatsapp',{}),env)).status,404);
    assert.deepEqual(calls,['catalog','checkout_config']);
  }finally{globalThis.fetch=original}
});
test('verification forwards only session proof and preserves backend validation failure',async()=>{
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{assert.equal(url,env.SUPABASE_URL+'/functions/v1/madikar-store');calls.push(await signedCall(options));return Response.json({error:'Invalid payment signature.'},{status:400})};
  try{
    const body={sessionId:'session',token:'token',orderId:'order_test',paymentId:'pay_test',signature:'invalid',mode:'live',amount:1,action:'admin_orders'};
    const response=await worker.fetch(post('/api/checkout/verify',body),env);
    assert.equal(response.status,400);
    assert.deepEqual(calls,[{sessionId:'session',token:'token',action:'checkout_verify',orderId:'order_test',paymentId:'pay_test',signature:'invalid'}]);
    assert.equal((await response.json()).error,'Invalid payment signature.');
    const malformed=new Request(origin+'/api/checkout/order',{method:'POST',headers:{Origin:origin},body:'{'});
    assert.equal((await worker.fetch(malformed,env)).status,400);assert.equal(calls.length,1);
  }finally{globalThis.fetch=original}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {setImmediate} from 'node:timers/promises';
import worker from '../server/worker-template.js';
const source=readFileSync(new URL('../dist/client/checkout.js',import.meta.url),'utf8');
function browser({session=null,path='/',reply={status:'pending'}}={}){
  const nodes=new Map(),storage=new Map(),requests=[],navigation=[],consumed=[],timers=[];
  if(session)storage.set('madikar-checkout-session',JSON.stringify(session));
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:selector==='#checkout-success',dataset:{},style:{},classList:{add(){},remove(){}},setAttribute(){},focus(){},listeners:{},addEventListener(event,handler){this.listeners[event]=handler},elements:{name:{focus(){}}}});return nodes.get(selector)};
  const location={search:new URL(path,'https://store.test').search,assign:path=>navigation.push(path)};
  const context=vm.createContext({window:{MADIKAR_STORE:{money:String,cartEntries:()=>[],closeCart(){},consumeCart:lines=>consumed.push(lines)},location},location,
    document:{querySelector:node,body:{style:{}},addEventListener(){},activeElement:null},history:{replaceState:(_s,_t,path)=>navigation.push(path)},URLSearchParams,AbortSignal,setTimeout:fn=>timers.push(fn),
    sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return Response.json(typeof reply==='function'?reply(requests.length):reply)}});
  vm.runInContext(source,context);return {node,requests,navigation,consumed,storage,timers,context};
}
const saved={sessionId:crypto.randomUUID(),token:'a'.repeat(64),lines:[{id:'p1',variant:0,quantity:1}]};
test('typing payment=true without a session cannot show a confirmation',async()=>{
  const page=browser({path:'/?payment=true'});await setImmediate();assert.equal(page.node('#checkout-success').hidden,true);assert.equal(page.requests.length,0);assert.equal(page.consumed.length,0);
});
test('server-confirmed payment restores popup once, removes purchased items, returns home',async()=>{
  const page=browser({session:saved,reply:{status:'paid',reference:'WEB-order',paymentId:'pay_test',mode:'live'}});await setImmediate();
  assert.equal(page.requests[0].url,'/api/checkout/status');assert.equal(page.node('#checkout-success').hidden,false);assert.equal(page.consumed.length,1);
  assert.match(page.node('#payment-reference').textContent,/WEB-order/);assert.equal(page.navigation[0],'/?payment=true');
  page.node('#checkout-done').listeners.click();assert.equal(page.navigation.at(-1),'/');assert.equal(page.storage.has('madikar-checkout-session'),false);
});
test('pending payment retains cart and does not show success',async()=>{
  const page=browser({session:{...saved,confirming:true},path:'/?payment=true'});await setImmediate();
  assert.equal(page.node('#checkout-success').hidden,true);assert.equal(page.consumed.length,0);assert.equal(page.node('#razorpay-pay').disabled,true);
  assert.equal(page.node('#checkout-confirming').hidden,false);
});

test('a rejected link session clears locally without consuming the unpaid bag',async()=>{
  const page=browser({session:{...saved,paymentMethod:'payment_link',requested:true},reply:{status:'failed'}});
  await vm.runInContext('checkPayment(readSession())',page.context);
  assert.equal(page.storage.has('madikar-checkout-session'),false);assert.equal(page.consumed.length,0);
  assert.equal(page.node('#checkout-success').hidden,true);
});

test('overlapping verification and status responses consume one session only once, even after dismissal',async()=>{
 const result={status:'paid',reference:'ORD-FIXTURE',paymentId:'pay_fixture',mode:'test'};
 const page=browser({session:saved,reply:result});await setImmediate();
 assert.equal(page.consumed.length,1);page.node('#checkout-done').listeners.click();
 const navigations=page.navigation.length;
 assert.equal(vm.runInContext('showPaid('+JSON.stringify(result)+','+JSON.stringify(saved)+')',page.context),true);
 assert.equal(page.consumed.length,1);assert.equal(page.navigation.length,navigations);assert.equal(page.storage.has('madikar-checkout-session'),false);
});

test('pending payment automatically confirms from the same session without another payment attempt',async()=>{
  const page=browser({session:{...saved,confirming:true},reply:n=>n===1?{status:'pending'}:{status:'paid',reference:'ORD-fixture',paymentId:'pay_fixture',mode:'live'}});
  await setImmediate();assert.equal(page.node('#checkout-success').hidden,true);
  page.timers.shift()();await setImmediate();
  assert.equal(page.node('#checkout-success').hidden,false);assert.equal(page.node('#checkout-confirming').hidden,true);
  assert.equal(page.consumed.length,1);assert.equal(page.requests.length,2);
  assert.ok(page.requests.every(r=>r.url==='/api/checkout/status'&&r.body.sessionId===saved.sessionId));
});
test('delivery fields are required except email and landmark',()=>{
  const html=readFileSync(new URL('../dist/client/index.html',import.meta.url),'utf8');
  for(const field of ['name','phone','line1','city','state','postalCode','country'])assert.match(html,new RegExp('<input[^>]*name="'+field+'"[^>]*required'));
  for(const field of ['email','line2'])assert.doesNotMatch(html,new RegExp('<input[^>]*name="'+field+'"[^>]*required'));
});
test('Worker rejects cross-origin posts and removed WhatsApp checkout route',async()=>{
  const request=new Request('https://store.test/api/checkout/order',{method:'POST',headers:{origin:'https://other.test'},body:'{}'});
  assert.equal((await worker.fetch(request,{})).status,403);
  assert.equal((await worker.fetch(new Request('https://store.test/api/checkout/whatsapp',{method:'POST'}),{})).status,404);
});
test('Worker uses signed Supabase request and discards caller mode, amount and action',async()=>{
  const key=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const env={SUPABASE_URL:'https://database.test',STORE_SIGNING_PRIVATE_JWK:JSON.stringify(await crypto.subtle.exportKey('jwk',key.privateKey))};
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://database.test/functions/v1/madikar-store');const body=JSON.parse(options.body);
    assert.equal(body.action,'checkout_create');assert.equal(body.mode,undefined);assert.equal(body.amount,undefined);assert.equal(body.adminToken,undefined);assert.match(body.clientHash,/^[a-f0-9]{64}$/);
    const signature=Buffer.from(options.headers['x-store-signature'],'base64url');
    assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key.publicKey,signature,new TextEncoder().encode(options.headers['x-store-timestamp']+'.'+options.body)),true);
    return Response.json({sessionId:saved.sessionId});
  };
  try{const result=await worker.fetch(new Request('https://store.test/api/checkout/order',{method:'POST',headers:{origin:'https://store.test','cf-connecting-ip':'192.0.2.1'},body:JSON.stringify({...saved,action:'admin_orders',mode:'live',amount:1,adminToken:'forged'})}),env);assert.equal(result.status,200)}finally{globalThis.fetch=original}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createCheckoutService,validateDelivery} from './checkout.ts';
const address={name:'Test Buyer',phone:'9000000001',email:'',line1:'1 Test Street',line2:'',city:'Dharwad',state:'Karnataka',postalCode:'580001',country:'India'};
const body=()=>({sessionId:crypto.randomUUID(),token:'a'.repeat(64),clientHash:'b'.repeat(64),address:{...address},lines:[{id:'p1',variant:0,quantity:2}]});
const mac=(secret,value)=>createHmac('sha256',secret).update(value).digest('hex');
function fixture({mode='test',existing=true,enabled=true,shipping=5000}={}){
  const state={calls:[],sessions:[],profiles:existing?[{id:crypto.randomUUID(),whatsAppUserId:'91'+address.phone,name:'Original',email:'original@example.test'}]:[],orders:[],payment:{id:'pay_fixture',order_id:'order_fixture',amount:40000,currency:'INR',status:'captured',method:'upi'},finalized:0,remoteOrders:0,handoffs:[],allowed:true,due:[]};
  const env={RAZORPAY_MODE:mode,RAZORPAY_TEST_KEY_ID:'rzp_test_fixture',RAZORPAY_TEST_KEY_SECRET:'test-secret',RAZORPAY_LIVE_KEY_ID:'rzp_live_fixture',RAZORPAY_LIVE_KEY_SECRET:'live-secret',RAZORPAY_TEST_WEBHOOK_SECRET:'test-hook',RAZORPAY_LIVE_WEBHOOK_SECRET:'live-hook',N8N_WEBHOOK_URL:'https://fulfilment.example.test'};
  const database=async(path,options={})=>{
    const url=new URL(path,'https://db.example.test'),data=options.body?JSON.parse(options.body):null,method=options.method||'GET';state.calls.push({path,method,data});
    let payload;const table=url.pathname.split('/').at(-1),id=url.searchParams.get('id')?.slice(3);
    if(table==='store_checkout_settings')payload=[{enabled,shipping_paise:shipping,recovery_token:'f'.repeat(64)}];
    else if(table==='store_allow_checkout')payload=state.allowed;
    else if(table==='Product')payload=[{id:1,store_id:'p1',name:'Oil',store_name:'Groundnut Oil',retailer_id:'meta-oil',catalog_id:'catalog'}];
    else if(table==='ProductVariant')payload=[{id:10,product_id:1,position:0,size:'500 ml',price:175,inventory_quantity:null,availability_status:'available'}];
    else if(table==='Profile'){
      if(method==='POST')state.profiles.push(data);
      payload=state.profiles.filter(p=>p.whatsAppUserId===url.searchParams.get('whatsAppUserId')?.slice(3));
    }else if(table==='users'){payload={id:crypto.randomUUID()};}
    else if(table==='store_checkout_sessions'){
      if(method==='POST')state.sessions.push({...data,status:'preparing',expires_at:new Date(Date.now()+1800000).toISOString()});
      if(method==='PATCH')Object.assign(state.sessions.find(s=>s.id===id),data);
      payload=state.sessions.filter(s=>id?s.id===id:s.provider_order_id===url.searchParams.get('provider_order_id')?.slice(3));
    }else if(table==='store_finalize_checkout'){
      const s=state.sessions.find(s=>s.id===data.p_session_id);
      if(s.status!=='paid'){state.finalized++;Object.assign(s,{status:'paid',order_id:1,provider_payment_id:data.p_payment_id,paid_at:data.p_paid_at});state.orders.push({id:1,reference_id:'WEB-fixture',address_id:crypto.randomUUID(),status:'paid'});}
      payload={reference:'WEB-fixture'};
    }else if(table==='orders')payload=state.orders;
    else if(table==='addresses')payload=[{id:'address',recipient_name:address.name}];
    else if(table==='store_claim_payment_confirmations'){if(state.confirmationError)throw new Error('Tracking unavailable');payload=[];}
    else if(table==='store_claim_checkout_work'){payload=state.due.splice(0);}
    else if(table==='store_complete_handoff'){state.orders[0].status='processing';state.sessions[0].handoff_sent_at=new Date().toISOString();payload=null;}
    else throw new Error('Unexpected DB call: '+path);
    return {payload,status:200};
  };
  const fetch=async(url,options)=>{
    if(url===env.N8N_WEBHOOK_URL){state.handoffs.push(JSON.parse(options.body));return new Response('ok')}
    const expected=state.sessions[0]?.mode||mode;
    assert.equal(options.headers.Authorization,'Basic '+btoa(env['RAZORPAY_'+expected.toUpperCase()+'_KEY_ID']+':'+env['RAZORPAY_'+expected.toUpperCase()+'_KEY_SECRET']));
    if(url.endsWith('/orders')&&options.method==='POST'){state.remoteOrders++;return Response.json({id:'order_fixture',amount:40000,currency:'INR'})}
    if(url.endsWith('/orders/order_fixture/payments'))return Response.json({items:[state.payment]});
    if(url.endsWith('/orders/order_fixture'))return Response.json({id:'order_fixture',amount:40000,currency:'INR',status:'paid'});
    if(url.endsWith('/payments/pay_fixture'))return Response.json(state.payment);
    throw new Error('Unexpected network call: '+url);
  };
  const tasks=[];
  const service=createCheckoutService({database,env:key=>env[key],fetch,background:promise=>tasks.push(promise)});
  const verify=b=>service.verify({...b,orderId:'order_fixture',paymentId:'pay_fixture',signature:mac(env['RAZORPAY_'+state.sessions[0].mode.toUpperCase()+'_KEY_SECRET'],'order_fixture|pay_fixture')});
  return {state,env,service,verify,flush:()=>Promise.all(tasks)};
}
test('only email and area/landmark are optional',()=>{
  assert.deepEqual(validateDelivery(address),address);
  for(const key of ['name','phone','line1','city','state','postalCode','country'])assert.throws(()=>validateDelivery({...address,[key]:''}));
  assert.throws(()=>validateDelivery({...address,phone:'1234567890'}));assert.throws(()=>validateDelivery({...address,email:'invalid'}));
});
test('shipping hold and invalid mode fail closed without creating profiles or orders',async()=>{
  for(const options of [{shipping:null},{enabled:false},{mode:'invalid'}]){const f=fixture(options);assert.equal((await f.service.config()).ready,false);await assert.rejects(f.service.create(body()));assert.equal(f.state.sessions.length,0);assert.equal(f.state.calls.filter(c=>c.method==='POST').length,0);}
});
test('mode selection, private existing profile reuse, server prices, repeat create reuse',async()=>{
  for(const mode of ['test','live']){
    const f=fixture({mode}),b=body(),before=structuredClone(f.state.profiles);
    const first=await f.service.create(b),repeat=await f.service.create(b);
    assert.equal(first.keyId,'rzp_'+mode+'_fixture');assert.deepEqual(first,repeat);assert.equal(f.state.remoteOrders,1);assert.equal(f.state.finalized,0);
    assert.deepEqual(f.state.profiles,before);assert.equal(f.state.calls.some(c=>c.path.startsWith('/auth/')),false);
    assert.equal(JSON.stringify(first).includes('secret'),false);assert.equal(first.amountPaise,40000);
    await assert.rejects(f.service.create({...b,address:{...address,city:'Changed'}}),/changed/);
  }
});
test('new profile uses same hidden Auth identity; no address or order before payment',async()=>{
  const f=fixture({existing:false});await f.service.create(body());
  const auth=f.state.calls.find(c=>c.path==='/auth/v1/admin/users');assert.equal(auth.data.email,'wa_919000000001@whatsapp.local');
  assert.equal(f.state.profiles[0].whatsAppUserId,'919000000001');assert.equal(f.state.orders.length,0);assert.equal(f.state.calls.some(c=>c.path.includes('/addresses')),false);
});
test('rate limit stops profile creation; invalid carts are rejected',async()=>{
  const f=fixture({existing:false});f.state.allowed=false;await assert.rejects(f.service.create(body()),/Too many/);assert.equal(f.state.calls.some(c=>c.path.startsWith('/auth/')),false);
  f.state.allowed=true;await assert.rejects(f.service.create({...body(),lines:[{id:'p1',variant:0,quantity:0}]}),/invalid/);
});
test('tampered signature, token and payment amount cannot finalize',async()=>{
  const f=fixture(),b=body();await f.service.create(b);
  await assert.rejects(f.service.verify({...b,orderId:'order_fixture',paymentId:'pay_fixture',signature:'0'.repeat(64)}),/signature/);
  await assert.rejects(f.service.status({...b,token:'c'.repeat(64)}),/not found/);
  f.state.payment.amount=1;await assert.rejects(f.verify(b),/does not match/);assert.equal(f.state.finalized,0);
});
test('authorized is pending; captured is recorded once and survives mode change',async()=>{
  const f=fixture(),b=body();await f.service.create(b);f.state.payment.status='authorized';assert.equal((await f.verify(b)).status,'pending');assert.equal(f.state.finalized,0);
  f.env.RAZORPAY_MODE='live';f.state.payment.status='captured';assert.equal((await f.verify(b)).status,'paid');assert.equal((await f.verify(b)).status,'paid');await f.flush();assert.equal(f.state.finalized,1);assert.equal(f.state.handoffs.length,0);
});
test('authenticated webhook recovers closed browser and ignores bot payment orders',async()=>{
  const f=fixture(),b=body();await f.service.create(b);
  const event=JSON.stringify({event:'payment.captured',payload:{payment:{entity:f.state.payment}}});
  await assert.rejects(f.service.webhook(event,'0'.repeat(64)),/signature/);
  await f.service.webhook(event,mac('test-hook',event));await f.service.webhook(event,mac('test-hook',event));assert.equal(f.state.finalized,1);
  const other=event.replaceAll('order_fixture','order_bot');assert.equal((await f.service.webhook(other,mac('test-hook',other))).ignored,true);await f.flush();
});
test('both test and live website payments trigger n8n with explicit mode',async()=>{
  for(const mode of ['live','test']){const f=fixture({mode}),b=body();await f.service.create(b);await f.verify(b);await f.flush();f.state.due=[f.state.sessions[0]];await f.service.work();
    assert.equal(f.state.handoffs.length,1);assert.equal(f.state.orders[0].status,'processing');
    assert.equal(f.state.handoffs[0].payment_mode,mode);assert.equal(f.state.handoffs[0].is_test,mode==='test');if(true){assert.equal(f.state.handoffs[0].event,'order.paid');assert.equal(f.state.handoffs[0].items[0].unit_price,175);}
  }
});
test('recovery requires its separate secret',async()=>{const f=fixture();assert.equal(await f.service.authorizeRecovery(null),false);assert.equal(await f.service.authorizeRecovery('e'.repeat(64)),false);assert.equal(await f.service.authorizeRecovery('f'.repeat(64)),true)});

test('WhatsApp tracking failure cannot block payment result or n8n',async()=>{
  const f=fixture(),b=body();await f.service.create(b);f.state.confirmationError=true;
  assert.equal((await f.verify(b)).status,'paid');await f.flush();
  f.state.due=[f.state.sessions[0]];await f.service.work();
  assert.equal(f.state.handoffs.length,1);assert.equal(f.state.orders[0].status,'processing');
});

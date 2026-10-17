import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {createHmac,webcrypto} from 'node:crypto';
import vm from 'node:vm';

const source=stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/razorpay-webhook/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''));
function fixture(mode='live'){
  const state={calls:[],rpc:[],messages:[],handoffs:[],pending:[],payment:{id:7,order_id:9,status:'pending',amount:1,provider_payment_link_reference_id:'ORD-fixture',provider_payment_link_id:'plink_fixture'},order:{source:'whatsapp',id:9,reference_id:'ORD-fixture',total:1,status:'pending_payment',whatsapp_user_id:'919000000001'}};
  const env={SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture',RAZORPAY_MODE:mode,RAZORPAY_LIVE_WEBHOOK_SECRET:'live-fixture',RAZORPAY_TEST_WEBHOOK_SECRET:'test-fixture',WHATSAPP_ACCESS_TOKEN:'fixture'};
  const sandbox={crypto:webcrypto,TextEncoder,Response,Request,URL,Date,setTimeout,console:{log(){},warn(){},error(){}},
    Deno:{env:{get:k=>env[k]},serve:handler=>{state.handler=handler;}},EdgeRuntime:{waitUntil:p=>state.pending.push(p)},
    deliverOrderHandoff:async id=>{state.handoffs.push(id);return 'sent';},
    fetch:async(url,options={})=>{
      const u=new URL(url),table=u.pathname.split('/').at(-1),method=options.method||'GET',body=options.body&&JSON.parse(options.body);state.calls.push({url:String(url),method,body});
      if(u.hostname==='graph.facebook.com'){state.messages.push(body);return Response.json({messages:[{id:'wamid.fixture'}]});}
      assert.equal(u.hostname,'db.example.test');
      if(table==='payments'){
        if(method==='GET'){assert.equal(u.searchParams.get('orders.source'),'eq.whatsapp');assert.match(u.searchParams.get('select'),/orders!inner\(source\)/);if(state.order.source!=='whatsapp')return Response.json([]);}
        if(method==='PATCH'){Object.assign(state.payment,body);return new Response(null,{status:204});}
        const event=u.searchParams.get('provider_event_id');
        return Response.json(event?(state.payment.provider_event_id===event.slice(3)?[state.payment]:[]):[state.payment]);
      }
      if(table==='orders')return Response.json([state.order]);
      if(table==='mark_payment_paid_and_advance_order'){
        state.rpc.push(body);Object.assign(state.payment,{status:'paid',provider_order_id:body.p_provider_order_id,provider_payment_id:body.p_provider_payment_id,provider_event_id:body.p_provider_event_id});state.order.status='processing';
        return Response.json({payment:state.payment,order:state.order});
      }
      throw Error('Unexpected network call '+url);
    }};
  vm.runInNewContext(source+';globalThis.orderId=getProviderOrderId;',sandbox);
  return {state,orderId:sandbox.orderId,async send(body,{signature=true,event='evt_fixture'}={}){
    const raw=JSON.stringify(body),headers={'content-type':'application/json','x-razorpay-event-id':event};
    if(signature)headers['x-razorpay-signature']=createHmac('sha256',mode+'-fixture').update(raw).digest('hex');
    const r=await state.handler(new Request('https://example.test/webhook',{method:'POST',headers,body:raw}));
    await Promise.all(state.pending.splice(0));return r;
  }};
}
function event({paymentOrderId='order_ABC123',entityOrderId='ABC123',amount=100,event='payment_link.paid'}={}){
  return {event,payload:{payment:{entity:{id:'pay_fixture',order_id:paymentOrderId,amount,currency:'INR'}},order:{entity:{id:entityOrderId}},payment_link:{entity:{id:'plink_fixture',reference_id:'ORD-fixture',amount_paid:amount,currency:'INR'}}}};
}

test('signed live/test payment events store the canonical ID and preserve paid flow and duplicate handling',async()=>{
  for(const mode of ['live','test']){
    const f=fixture(mode),body=event();
    assert.equal((await f.send(body)).status,200);
    assert.equal(f.state.rpc[0].p_provider_order_id,'order_ABC123');
    assert.equal(f.state.payment.provider_payment_id,'pay_fixture');
    assert.equal(f.state.payment.amount,1);assert.equal(f.state.order.reference_id,'ORD-fixture');
    assert.equal(f.state.order.status,'processing');assert.equal(f.state.messages.length,1);assert.equal(f.state.handoffs.length,1);
    assert.equal(f.state.messages[0].interactive.action.parameters.payment.status,'captured');
    assert.equal((await f.send(body)).status,200);
    assert.equal(f.state.rpc.length,1);assert.equal(f.state.messages.length,1);assert.equal(f.state.handoffs.length,1);
  }
});
test('bare order entity fallback receives exactly one prefix',async()=>{
  for(const entityOrderId of ['ABC123','order_ABC123']){
    const f=fixture();assert.equal((await f.send(event({paymentOrderId:null,entityOrderId}))).status,200);
    assert.equal(f.state.payment.provider_order_id,'order_ABC123');
  }
});
test('payment order identity wins and blank or absent IDs retain compatible fallback behavior',()=>{
  const f=fixture();
  assert.equal(f.orderId(event({paymentOrderId:'order_Payment',entityOrderId:'Other'})),'order_Payment');
  assert.equal(f.orderId(event({paymentOrderId:'Bare',entityOrderId:'Other'})),'order_Bare');
  assert.equal(f.orderId(event({paymentOrderId:' ',entityOrderId:' ABC123 '})),'order_ABC123');
  assert.equal(f.orderId({}),'');
});
test('invalid signatures and amount mismatch cannot write paid state or send messages',async()=>{
  const unsigned=fixture();assert.equal((await unsigned.send(event(),{signature:false})).status,401);assert.equal(unsigned.state.calls.length,0);
  const mismatch=fixture();assert.equal((await mismatch.send(event({amount:200}))).status,400);
  assert.equal(mismatch.state.rpc.length,0);assert.equal(mismatch.state.messages.length,0);assert.equal(mismatch.state.handoffs.length,0);
});
test('expiry and cancellation retain their existing status-only behavior',async()=>{
  for(const terminal of ['expired','cancelled']){
    const f=fixture();assert.equal((await f.send(event({event:'payment_link.'+terminal}))).status,200);
    assert.equal(f.state.payment.status,terminal);assert.equal(f.state.order.status,'pending_payment');
    assert.equal(f.state.rpc.length,0);assert.equal(f.state.messages.length,0);assert.equal(f.state.handoffs.length,0);
  }
});

test('website link events cannot send bot confirmations or trigger bot handoff',async()=>{
 for(const type of ['payment_link.paid','payment_link.expired','payment_link.cancelled']){
  const f=fixture();f.state.order.source='store';
  assert.equal((await f.send(event({event:type}))).status,200);assert.equal(f.state.rpc.length,0);assert.equal(f.state.messages.length,0);assert.equal(f.state.handoffs.length,0);
 }
});

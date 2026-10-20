import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebsitePaymentLinks,safePaymentUrl} from './payment-links.ts';
function fixture(){
  const s={id:crypto.randomUUID(),mode:'live',payment_method:'payment_link',customer:{name:'Fixture'},phone:'919000000001',total_paise:44000,expires_at:new Date(Date.now()+1800000).toISOString(),status:'preparing'};
  const state={creates:0,calls:[],finalizes:0,stored:structuredClone(s),link:null,payment:{id:'pay_fixture',order_id:'order_fixture',amount:44000,currency:'INR',status:'captured',method:'upi'},order:{id:'order_fixture',amount:44000,currency:'INR',status:'paid'}};
  const razorpay=async(mode,path,options={})=>{
    assert.equal(mode,'live');state.calls.push({path,options});
    if(path==='/payment_links'&&options.method==='POST'){
      state.creates++;const payload=JSON.parse(options.body);
      if(state.rejectCreate)throw Object.assign(Error('rejected'),{creationRejected:true});
      if(state.unseenTimeout)throw Error('timeout');
      state.link={...payload,id:'plink_fixture',short_url:'https://rzp.io/i/fixture',status:'created',payments:[],amount_paid:0};
      if(state.timeout)throw Error('timeout');return structuredClone(state.link);
    }
    if(path.startsWith('/payment_links?reference_id='))return {payment_links:state.link?[structuredClone(state.link)]:[]};
    if(path==='/payment_links/plink_fixture')return structuredClone(state.link);
    if(path==='/payment_links/plink_fixture/cancel'){
      if(state.cancelRace){state.link.status='paid';state.link.amount_paid=s.total_paise;state.link.payments=[{payment_id:'pay_fixture',amount:s.total_paise,status:'captured'}];throw Error('already paid');}
      state.link.status='cancelled';return structuredClone(state.link);
    }
    if(path==='/payments/pay_fixture')return state.payment;
    if(path==='/orders/order_fixture')return state.order;
    throw Error('Unexpected provider call '+path);
  };
  const service=createWebsitePaymentLinks({razorpay,patch:async(id,data,condition)=>{
    assert.equal(id,s.id);assert.ok(['&status=eq.preparing','&status=eq.preparing&provider_payment_link_id=is.null','&status=neq.paid'].includes(condition));
    if(state.stored.status!=='paid')Object.assign(state.stored,data);
  },rpc:async(name,data)=>{
    assert.equal(name,'store_finalize_link_checkout');assert.equal(data.p_provider_order_id,'order_fixture');assert.equal(data.p_link_id,'plink_fixture');
    assert.equal(data.p_reference_id,'WEB'+s.id.replaceAll('-',''));assert.equal(data.p_amount_paise,44000);
    if(state.stored.status!=='paid')state.finalizes++;state.stored.status='paid';return {reference:'ORD-FIXTURE'};
  },background:p=>p.catch(()=>{}),work:async()=>{}});
  const paid=()=>{Object.assign(state.link,{status:'paid',amount_paid:44000,payments:[{payment_id:'pay_fixture',amount:44000,status:'captured'}]});};
  return {s,state,service,paid};
}
test('standard UPI-only link uses unique reference and fixed website return; notifications left to Razorpay',async()=>{
  const f=fixture(),result=await f.service.create(f.s);assert.equal(result.paymentUrl,'https://rzp.io/i/fixture');assert.equal(result.paymentMethod,'payment_link');
  const payload=JSON.parse(f.state.calls[0].options.body);
  assert.deepEqual(payload.options,{checkout:{method:{upi:1,card:0,netbanking:0,wallet:0}}});
  assert.equal(payload.accept_partial,false);assert.equal(Object.hasOwn(payload,'notify'),false);assert.equal(payload.reminder_enable,false);
  assert.equal(payload.callback_url,'https://madikartaila.com/?payment=return');assert.equal(payload.callback_method,'get');
  assert.equal(payload.reference_id.length,35);assert.equal(payload.amount,44000);
  assert.equal(JSON.stringify(result).includes('Fixture'),false);assert.deepEqual(await f.service.prepared(f.s),result);assert.equal(f.state.creates,1);
});
test('ambiguous create timeout recovers the same link by reference without another POST',async()=>{
  const f=fixture();f.state.timeout=true;await assert.rejects(f.service.create(f.s),/timeout/);
  assert.equal(f.state.stored.provider_payment_link_id,undefined);
  const result=await f.service.prepared(f.s);assert.equal(result.paymentUrl,'https://rzp.io/i/fixture');assert.equal(f.state.creates,1);
  assert.equal(f.state.calls.some(c=>c.path.includes('reference_id=WEB')),true);
});
test('captured link, payment and order must all agree; repeated reconciliation finalizes once',async()=>{
  const f=fixture();await f.service.create(f.s);f.paid();
  assert.equal(f.state.link.order_id,undefined);
  assert.equal((await f.service.reconcile(f.s)).status,'paid');assert.equal((await f.service.reconcile(f.s)).status,'paid');assert.equal(f.state.finalizes,1);
});
test('canonical captured-payment order is required and inconsistent provider order data fails closed',async()=>{
  for(const change of [{id:'order_other'},{amount:1},{currency:'USD'}]){
    const f=fixture();await f.service.create(f.s);f.paid();Object.assign(f.state.order,change);
    await assert.rejects(f.service.reconcile(f.s));assert.equal(f.state.finalizes,0);
  }
  const f=fixture();await f.service.create(f.s);f.paid();f.state.link.order_id='order_other';
  await assert.rejects(f.service.reconcile(f.s));assert.equal(f.state.finalizes,0);
});
test('provider identity, currency, amount, partial-payment and metadata mismatches fail closed',async()=>{
  for(const change of [{id:'plink_other'},{reference_id:'other'},{amount:1},{currency:'USD'},{accept_partial:true},{notes:{website_session:'other',source:'madikar_website'}},{short_url:'https://evil.test/pay'}]){
    const f=fixture();await f.service.create(f.s);f.paid();Object.assign(f.state.link,change);
    await assert.rejects(f.service.reconcile(f.s));assert.equal(f.state.finalizes,0);
  }
  for(const change of [{id:'pay_other'},{order_id:'order_other'},{amount:1},{currency:'USD'}]){
    const f=fixture();await f.service.create(f.s);f.paid();Object.assign(f.state.payment,change);
    await assert.rejects(f.service.reconcile(f.s));assert.equal(f.state.finalizes,0);
  }
});
test('authorized, unconfirmed or inconclusive payments never show paid',async()=>{
  const f=fixture();await f.service.create(f.s);assert.equal((await f.service.reconcile(f.s)).status,'pending');
  f.paid();f.state.payment.status='authorized';assert.equal((await f.service.reconcile(f.s)).status,'pending');
  f.state.payment.status='captured';f.state.order.status='attempted';assert.equal((await f.service.reconcile(f.s)).status,'pending');
  f.state.order.status='paid';f.state.link.payments=[];assert.equal((await f.service.reconcile(f.s)).status,'pending');assert.equal(f.state.finalizes,0);
});
test('cancel and expiry require provider confirmation and cannot discard a winning payment',async()=>{
  const f=fixture();await f.service.create(f.s);assert.equal((await f.service.cancel(f.s)).status,'cancelled');
  const g=fixture();await g.service.create(g.s);g.state.cancelRace=true;await assert.rejects(g.service.cancel(g.s),/already paid/);assert.equal((await g.service.reconcile(g.s)).status,'paid');
  const h=fixture();await h.service.create(h.s);h.state.link.status='expired';assert.equal((await h.service.reconcile(h.s)).status,'expired');h.state.link.payments=[{status:'authorized'}];assert.equal((await h.service.reconcile(h.s)).status,'pending');
});
test('payment URL validation rejects lookalikes, embedded credentials and non-HTTPS',()=>{
  for(const s of ['javascript:alert(1)','http://rzp.io/a','https://rzp.io.evil.test/a','https://x@rzp.io/a','https://evil.test/'])assert.equal(safePaymentUrl(s),null);
  assert.equal(safePaymentUrl('https://rzp.io.in/i/a'),'https://rzp.io.in/i/a');
});

test('definitive create rejection releases the saved checkout without a second POST',async()=>{
  const f=fixture();f.state.rejectCreate=true;
  await assert.rejects(f.service.create(f.s),/creation was rejected/);
  const saved=f.state.stored;
  assert.equal(saved.payment_resolution,'creation_rejected');
  assert.equal((await f.service.reconcile(saved)).status,'failed');
  assert.equal((await f.service.cancel(saved)).status,'failed');
  await assert.rejects(f.service.prepared(saved),/creation was rejected/);
  assert.equal(f.state.creates,1);assert.equal(f.state.calls.length,1);assert.equal(f.state.finalizes,0);
});

test('uncertain timeout with no visible link keeps its hold until expiry',async()=>{
  const f=fixture();f.state.unseenTimeout=true;
  await assert.rejects(f.service.create(f.s),/timeout/);
  assert.equal(f.state.stored.payment_resolution,undefined);
  assert.equal((await f.service.reconcile(f.s)).status,'pending');
  await assert.rejects(f.service.cancel(f.s),/still pending/);
  f.s.expires_at=new Date(Date.now()-1000).toISOString();
  assert.equal((await f.service.reconcile(f.s)).status,'expired');
  assert.equal(f.state.stored.payment_resolution,'expired');assert.equal(f.state.creates,1);
});

test('confirmed terminal links stop background work but late captured payment is still verified',async()=>{
  const f=fixture();await f.service.create(f.s);f.state.link.status='cancelled';
  assert.equal((await f.service.reconcile(f.s)).status,'cancelled');
  assert.equal(f.state.stored.payment_resolution,'cancelled');
  f.paid();assert.equal((await f.service.reconcile(f.state.stored)).status,'paid');assert.equal(f.state.finalizes,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createShipmentNotificationService} from './shipment.ts';
function fixture({reply=()=>Response.json({messages:[{id:'wamid.shipment'}]}),token='token',ackFails=false,phone='919000000001'}={}){
  const state={status:'pending',calls:[],updates:[],attempts:0};
  const database=async(path,options)=>{
    const body=JSON.parse(options.body);
    if(path.endsWith('store_claim_shipment_notifications')){
      if(state.status!=='pending')return {payload:[]};
      state.status='sending';state.attempts++;
      return {payload:[{order_id:42,phone,reference_id:'ORD-1790878290172-9F6732',delivery_days:5,lease_token:'lease',attempts:state.attempts}]};
    }
    if(path.endsWith('store_retry_shipment_notification')){
      if(state.status!=='failed')throw Object.assign(new Error('Retry blocked'),{status:400});
      state.status='pending';return {payload:null};
    }
    if(ackFails)return {error:'DB unavailable'};
    state.status=body.p_status;state.updates.push(body);return {payload:null};
  };
  const service=createShipmentNotificationService({database,env:key=>key==='WHATSAPP_ACCESS_TOKEN'?token:undefined,
    fetch:async(url,options)=>{state.calls.push({url,options,body:JSON.parse(options.body)});return reply();}});
  return {state,service};
}
test('shipment sends the exact en template to the buyer with named order and delivery variables, once',async()=>{
  const f=fixture();await f.service.work(42);await f.service.work(42);
  assert.equal(f.state.calls.length,1);
  assert.equal(f.state.calls[0].url,'https://graph.facebook.com/v25.0/1327606333760280/messages');
  assert.deepEqual(f.state.calls[0].body,{messaging_product:'whatsapp',recipient_type:'individual',to:'919000000001',type:'template',
    template:{name:'order_shipped',language:{code:'en'},components:[{type:'body',parameters:[
      {type:'text',parameter_name:'order_number',text:'ORD-1790878290172-9F6732'},
      {type:'text',parameter_name:'delivery_days',text:'5'}]}]}});
  assert.equal(f.state.updates[0].p_message_id,'wamid.shipment');
});
test('overlapping shipment workers claim and send once',async()=>{
  const f=fixture();await Promise.all([f.service.work(),f.service.work()]);assert.equal(f.state.calls.length,1);
});
test('approval rejection stops automatic sends and can be safely retried after approval',async()=>{
  let approved=false;
  const f=fixture({reply:()=>approved?Response.json({messages:[{id:'wamid.shipment'}]}):Response.json({error:{code:132001}},{status:404})});
  await f.service.work();await f.service.work();assert.equal(f.state.calls.length,1);assert.equal(f.state.status,'failed');
  assert.equal(f.state.updates[0].p_error_code,132001);
  approved=true;await f.service.retry(42);await f.service.work();assert.equal(f.state.status,'sent');
  await assert.rejects(f.service.retry(42),error=>error.status===409);assert.equal(f.state.calls.length,2);
});
test('explicit transient rejection retries; permanent errors stop',async()=>{
  for(const [code,status,expected] of [[130429,429,'pending'],[132012,400,'failed']]){
    const f=fixture({reply:()=>Response.json({error:{code}},{status})});await f.service.work();assert.equal(f.state.status,expected);
  }
});
test('timeouts, malformed responses and uncertain acceptance never automatically resend',async()=>{
  for(const reply of [()=>{throw Error('timeout')},()=>new Response('invalid'),()=>Response.json({})]){
    const f=fixture({reply});await f.service.work();await f.service.work();assert.equal(f.state.status,'uncertain');assert.equal(f.state.calls.length,1);
    await assert.rejects(f.service.retry(42),error=>error.status===409);
  }
});
test('successful send followed by failed tracking save keeps lease for review',async()=>{
  const f=fixture({ackFails:true});await f.service.work();await f.service.work();assert.equal(f.state.status,'sending');assert.equal(f.state.calls.length,1);
});
test('missing configuration or invalid recipient cannot send',async()=>{
  const missing=fixture({token:''});await missing.service.work();assert.equal(missing.state.status,'pending');assert.equal(missing.state.calls.length,0);
  const invalid=fixture({phone:'not-a-phone'});await invalid.service.work();assert.equal(invalid.state.status,'failed');assert.equal(invalid.state.calls.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentConfirmationService} from './confirmation.ts';
function fixture({reply=()=>Response.json({messages:[{id:'wamid.fixture'}]}),token='token',ackFails=false}={}){
  const state={status:'pending',calls:[],updates:[],attempts:0};
  const database=async(path,options)=>{
    const body=JSON.parse(options.body);
    if(path.endsWith('store_claim_payment_confirmations')){
      if(state.status!=='pending')return {payload:[]};
      state.status='sending';state.attempts++;
      return {payload:[{session_id:'session',phone:'919000000001',lease_token:'lease',attempts:state.attempts}]};
    }
    if(ackFails)return {error:'DB unavailable'};
    state.status=body.p_status;state.updates.push(body);return {payload:null};
  };
  const service=createPaymentConfirmationService({database,
    env:key=>key==='WHATSAPP_ACCESS_TOKEN'?token:undefined,
    fetch:async(url,options)=>{state.calls.push({url,options,body:JSON.parse(options.body)});return reply();}
  });
  return {state,service};
}
test('exact approved template, en, no components; accepted message is not resent',async()=>{
  const f=fixture();await f.service.work();await f.service.work();
  assert.equal(f.state.calls.length,1);
  assert.equal(f.state.calls[0].url,'https://graph.facebook.com/v25.0/1327606333760280/messages');
  assert.deepEqual(f.state.calls[0].body,{messaging_product:'whatsapp',recipient_type:'individual',to:'919000000001',
    type:'template',template:{name:'website_payment_confirmation',language:{code:'en'}}});
  assert.equal(f.state.updates[0].p_message_id,'wamid.fixture');
});
test('overlapping workers cannot send the same claimed job twice',async()=>{
  const f=fixture();await Promise.all([f.service.work(),f.service.work()]);assert.equal(f.state.calls.length,1);
});
test('explicit transient rejection retries; permanent template rejection stops',async()=>{
  for(const [code,status,isTransient,expected] of [[130429,429,true,'pending'],[132001,400,false,'failed']]){
    const f=fixture({reply:()=>Response.json({error:{code,is_transient:isTransient}},{status})});
    await f.service.work();assert.equal(f.state.status,expected);
    if(expected==='pending'){await f.service.work();assert.equal(f.state.calls.length,2);}
  }
});
test('timeouts and malformed responses are held without automatic resend',async()=>{
  for(const reply of [()=>{throw new Error('timeout')},()=>new Response('invalid'),()=>Response.json({})]){
    const f=fixture({reply});await f.service.work();await f.service.work();
    assert.equal(f.state.status,'uncertain');assert.equal(f.state.calls.length,1);
  }
});
test('successful send followed by failed database save cannot resend',async()=>{
  const f=fixture({ackFails:true});await f.service.work();await f.service.work();
  assert.equal(f.state.status,'sending');assert.equal(f.state.calls.length,1);
});
test('missing credentials retry without sending or leaking credentials',async()=>{
  const f=fixture({token:''});await f.service.work();assert.equal(f.state.status,'pending');assert.equal(f.state.calls.length,0);
});

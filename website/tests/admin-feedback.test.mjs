import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/client/admin.js',import.meta.url),'utf8').replace(/start\(\);\s*$/,'');
function harness(){
  const nodes=new Map(),timers=new Map();let timer=0;
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:true,textContent:'',dataset:{},listeners:{},addEventListener(event,handler){this.listeners[event]=handler}});return nodes.get(selector)};
  const context=vm.createContext({document:{querySelector:node},URL,URLSearchParams,Response,
    setTimeout:fn=>{timers.set(++timer,fn);return timer},clearTimeout:id=>timers.delete(id),fetch:async()=>Response.json({product:{id:1}})});
  vm.runInContext(source,context);vm.runInContext("state.token='a'.repeat(43)",context);
  return {context,node,timers,run:code=>vm.runInContext(code,context)};
}
test('admin saves show success only after the server responds; reads stay quiet',async()=>{
  const h=harness();await h.run("adminApi('admin_catalog')");assert.equal(h.node('#admin-toast').hidden,true);
  let resolve;h.context.fetch=()=>new Promise(r=>{resolve=r});const pending=h.run("adminApi('admin_save_product',{id:1})");
  assert.equal(h.node('#admin-toast').hidden,true);resolve(Response.json({product:{id:1}}));await pending;
  assert.equal(h.node('#admin-toast').hidden,false);assert.equal(h.node('#admin-toast-message').textContent,'Product details saved.');
  assert.equal(h.node('#admin-toast').dataset.tone,'success');
});
test('rejected and uncertain saves never display a success toast',async()=>{
  const h=harness();h.context.fetch=async()=>Response.json({error:'Order changed. Refresh orders.'},{status:409});
  await assert.rejects(h.run("adminApi('admin_update_fulfillment',{status:'completed'})"));
  assert.equal(h.node('#admin-toast').dataset.tone,'error');assert.match(h.node('#admin-toast-message').textContent,/Order changed/);
  h.context.fetch=async()=>{throw new Error('network error')};await assert.rejects(h.run("adminApi('admin_save_variant')"));
  assert.match(h.node('#admin-toast-message').textContent,/Save not confirmed/);
  h.context.fetch=async()=>new Response('not JSON',{status:200});await assert.rejects(h.run("adminApi('admin_save_product')"));
  assert.equal(h.node('#admin-toast').dataset.tone,'error');
});
test('notifications distinguish queued, accepted and uncertain work from the saved order',()=>{
  const h=harness();
  for(const status of ['pending','sending','sent','failed','uncertain','cancelled']){
    const message=h.run(`savedFeedback('admin_update_fulfillment',{},${JSON.stringify({fulfillmentStatus:'completed',deliveryNotification:{status}})})`);
    assert.match(message,/Order marked Delivered/);
    if(['pending','sending'].includes(status)){assert.match(message,/queued/);assert.doesNotMatch(message,/accepted/)}
    if(status==='sent')assert.match(message,/accepted by WhatsApp/);
    if(['failed','uncertain'].includes(status))assert.match(message,/needs attention/);
  }
  const actions=h.run('Array.from(adminWrites)');
  for(const action of actions)assert.ok(h.run(`savedFeedback('${action}',{},{})`));
  assert.match(h.run("savedFeedback('admin_upload_image',{},{})"),/Save the product/);
  assert.doesNotMatch(h.run("savedFeedback('admin_product_availability',{},{})"),/synced|completed/i);
});
test('toast dismissal, expiry and new feedback cannot leave an old timer active',()=>{
  const h=harness();h.run("showToast('<b>Saved</b>')");assert.equal(h.node('#admin-toast-message').textContent,'<b>Saved</b>');
  h.run("showToast('New save')");assert.equal(h.timers.size,1);
  h.node('#admin-toast').listeners.focusin();assert.equal(h.timers.size,0);
  h.node('#admin-toast').listeners.focusout();assert.equal(h.timers.size,1);
  h.node('#admin-toast-close').listeners.click();assert.equal(h.node('#admin-toast').hidden,true);assert.equal(h.timers.size,0);
  h.run("showToast('Saved')");[...h.timers.values()][0]();assert.equal(h.node('#admin-toast').hidden,true);
});

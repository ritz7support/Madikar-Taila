import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/client/admin.js',import.meta.url),'utf8').replace(/start\(\);\s*$/,'');
function harness(){
  const nodes=new Map(),calls=[];
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',dataset:{},listeners:{},
      addEventListener(name,handler){this.listeners[name]=handler}});
    return nodes.get(selector);
  };
  const orders=Array.from({length:25},(_,index)=>({id:index+1,reference_id:`ORDER-${index+1}`,
    source:index<8?'store':'whatsapp',status:index===0?'pending_payment':'processing',
    fulfillment_status:'processing',created_at:'2026-10-07T00:00:00Z',total:175,subtotal:175,shipping:0}));
  node('#order-source').value='all';
  const context=vm.createContext({document:{querySelector:node},URL,URLSearchParams,Response,
    fetch:async(_url,options)=>{
      const body=JSON.parse(options.body);calls.push(body);
      if(body.action==='admin_update_fulfillment')return Response.json({fulfillmentStatus:body.status});
      const filtered=orders.filter(o=>body.source==='all'||o.source===body.source).toReversed();
      return Response.json({orders:filtered.slice(body.page*20,(body.page+1)*20),hasMore:filtered.length>(body.page+1)*20});
    }});
  vm.runInContext(source,context);
  vm.runInContext("state.token='a'.repeat(43)",context);
  return {node,calls,context};
}

test('orders replace each 20-row page and filter at the server',async()=>{
  const h=harness();
  await vm.runInContext('loadOrders(0)',h.context);
  assert.equal(h.node('#orders-list').innerHTML.match(/class="order-card"/g).length,20);
  assert.equal(h.node('#next-orders').disabled,false);
  await vm.runInContext('loadOrders(1)',h.context);
  assert.equal(h.node('#orders-list').innerHTML.match(/class="order-card"/g).length,5);
  assert.equal(h.node('#next-orders').disabled,true);
  assert.equal(h.node('#orders-page-label').textContent,'Page 2 · up to 20 orders');
  h.node('#order-source').value='store';
  await vm.runInContext('loadOrders(0)',h.context);
  assert.equal(h.node('#orders-list').innerHTML.match(/class="order-card"/g).length,8);
  assert.deepEqual(h.calls.filter(c=>c.action==='admin_orders').map(c=>[c.page,c.source]),[[0,'all'],[1,'all'],[0,'store']]);
});

test('source badges differ and paid orders expose four delivery stages',async()=>{
  const h=harness();
  await vm.runInContext('loadOrders(0)',h.context);
  const html=h.node('#orders-list').innerHTML;
  assert.match(html,/pill--whatsapp/);
  assert.match(html,/pill--store/);
  for(const value of ['processing','shipped','completed','cancelled'])assert.match(html,new RegExp(`option value="${value}"`));
  await vm.runInContext('loadOrders(1)',h.context);
  assert.match(h.node('#orders-list').innerHTML,/Awaiting payment/);
  assert.equal((h.node('#orders-list').innerHTML.match(/data-order-stage/g)||[]).length,5);
  assert.match(h.node('#orders-list').innerHTML,/data-order-stage="1"[^>]*disabled/);
  const select={dataset:{orderStage:'5'},value:'shipped',disabled:false};
  await h.node('#orders-list').listeners.change({target:{closest:()=>select}});
  assert.equal(h.calls.at(-1).action,'admin_update_fulfillment');
  assert.equal(h.calls.at(-1).previousStatus,'processing');
  assert.equal(h.calls.at(-1).status,'shipped');
  assert.equal(select.disabled,false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/client/admin.js',import.meta.url),'utf8').replace(/start\(\);\s*$/,'');
function harness(){
  const nodes=new Map(),calls=[];
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',innerHTML:'',textContent:'',dataset:{},listeners:{},
      setAttribute(){},focus(){},showModal(){this.open=true},close(){this.open=false;this.listeners.close?.()},
      addEventListener(name,handler){this.listeners[name]=handler}});
    return nodes.get(selector);
  };
  const orders=Array.from({length:25},(_,index)=>({id:index+1,reference_id:`ORDER-${index+1}`,
    source:index<8?'store':'whatsapp',status:index===0?'pending_payment':'processing',
    fulfillment_status:'processing',created_at:'2026-10-07T00:00:00Z',total:175,subtotal:175,shipping:0,
    payments:index===0?[]:[{status:'paid',provider_payment_id:'pay_fixture'}]}));
  node('#order-source').value='all';
  const context=vm.createContext({document:{querySelector:node},URL,URLSearchParams,Response,
    fetch:async(_url,options)=>{
      const body=JSON.parse(options.body);calls.push(body);
      if(body.action==='admin_update_fulfillment')return Response.json({fulfillmentStatus:body.status,trackingId:body.trackingId || null,estimatedDeliveryDays:body.estimatedDeliveryDays ?? null});
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
  assert.match(html,/Payment: paid · pay_fixture/);
  assert.doesNotMatch(html,/Payment: processing/);
  for(const value of ['processing','shipped','completed','cancelled'])assert.match(html,new RegExp(`option value="${value}"`));
  await vm.runInContext('loadOrders(1)',h.context);
  assert.match(h.node('#orders-list').innerHTML,/Awaiting payment/);
  assert.equal((h.node('#orders-list').innerHTML.match(/data-order-stage/g)||[]).length,5);
  assert.match(h.node('#orders-list').innerHTML,/data-order-stage="1"[^>]*disabled/);
  const select={dataset:{orderStage:'5'},value:'shipped',disabled:false};
  const before=h.calls.length;
  await h.node('#orders-list').listeners.change({target:{closest:()=>select}});
  assert.equal(h.calls.length,before,'opening the prompt must not write');
  assert.equal(select.value,'processing');
  assert.equal(h.node('#shipping-dialog').open,true);
  await h.node('#shipping-form').listeners.submit({preventDefault(){}});
  assert.equal(h.calls.length,before,'blank tracking must not write');
  h.node('#tracking-id').value=' TRACK-123 ';
  h.node('#delivery-days').value='5';
  await h.node('#shipping-form').listeners.submit({preventDefault(){}});
  assert.equal(h.calls.at(-1).action,'admin_update_fulfillment');
  assert.equal(h.calls.at(-1).previousStatus,'processing');
  assert.equal(h.calls.at(-1).status,'shipped');
  assert.equal(h.calls.at(-1).trackingId,'TRACK-123');
  assert.equal(h.calls.at(-1).estimatedDeliveryDays,5);
  assert.equal(h.node('#order-delivery-5').textContent,'Estimated delivery: within 5 days of dispatch');
  assert.equal(select.value,'shipped');
  assert.equal(h.node('#shipping-dialog').open,false);
  assert.equal(select.disabled,false);
});

test('cancelling shipment or a failed save preserves the prior order stage',async()=>{
  const h=harness();await vm.runInContext('loadOrders(0)',h.context);
  const select={dataset:{orderStage:'25'},value:'shipped',disabled:false};
  await h.node('#orders-list').listeners.change({target:{closest:()=>select}});
  const before=h.calls.length;
  h.node('#shipping-cancel').listeners.click();
  assert.equal(select.value,'processing');assert.equal(h.calls.length,before);
  select.value='shipped';
  await h.node('#orders-list').listeners.change({target:{closest:()=>select}});
  h.context.fetch=async()=>Response.json({error:'Order changed. Refresh orders.'},{status:409});
  h.node('#tracking-id').value='TRACK-123';
  await h.node('#shipping-form').listeners.submit({preventDefault(){}});
  assert.equal(select.value,'processing');
  assert.equal(h.node('#shipping-dialog').open,true);
  assert.match(h.node('#shipping-error').textContent,/Order changed/);
  assert.equal(h.node('#shipping-save').disabled,false);
});

test('delivery estimate rejects non-positive or fractional days and allows unknown',async()=>{
  const h=harness();await vm.runInContext('loadOrders(0)',h.context);
  const select={dataset:{orderStage:'25'},value:'shipped',disabled:false};
  await h.node('#orders-list').listeners.change({target:{closest:()=>select}});
  h.node('#tracking-id').value='TRACK-123';
  const before=h.calls.length;
  for(const value of ['0','-1','1.5','abc','2147483648']){
    h.node('#delivery-days').value=value;
    await h.node('#shipping-form').listeners.submit({preventDefault(){}});
    assert.equal(h.calls.length,before);assert.equal(select.value,'processing');
    assert.match(h.node('#shipping-error').textContent,/positive whole number/);
  }
  h.node('#delivery-days').value='';
  await h.node('#shipping-form').listeners.submit({preventDefault(){}});
  assert.equal(h.calls.at(-1).estimatedDeliveryDays,null);
  assert.equal(h.node('#order-delivery-25').textContent,'');
  assert.equal(select.value,'shipped');
});

test('shipping-message feedback exposes safe retry and blocks retry for accepted or uncertain sends',()=>{
  const h=harness();
  h.context.order={id:25,fulfillment_status:'shipped',estimated_delivery_days:5,shipment_notification:{status:'failed',error_code:132001,attempts:1}};
  let html=vm.runInContext('shipmentMessage(order)',h.context);
  assert.match(html,/Retry after approval/);assert.match(html,/data-retry-shipment/);
  for(const status of ['sent','uncertain']){
    h.context.order.shipment_notification.status=status;
    html=vm.runInContext('shipmentMessage(order)',h.context);assert.doesNotMatch(html,/data-retry-shipment/);
  }
  h.context.order.shipment_notification=null;h.context.order.estimated_delivery_days=null;
  assert.match(vm.runInContext('shipmentMessage(order)',h.context),/data-edit-shipment/);
});

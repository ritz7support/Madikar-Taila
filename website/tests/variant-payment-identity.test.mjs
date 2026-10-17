import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import {calculateShipping} from '../../supabase/functions/_shared/shipping.ts';

const source=stripTypeScriptTypes(readFileSync(new URL('../../supabase/functions/whatsapp-webhook/index.ts',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''));
const parent={id:5,name:'Groundnut oil',description:'Local description',product_link:'https://example.test/oil',catalog_id:'catalog-A'};
const packs=[{id:1,product_id:5,retailer_id:'pack-500',size:'500 ml',price:175,shipping_weight_grams:500,parent},{id:2,product_id:5,retailer_id:'pack-1000',size:'1 L',price:345,shipping_weight_grams:1000,parent}];
const legacy=[{retailer_id:'legacy-only',name:'Legacy item',catalog_id:'catalog-A'}];
function fixture({variants=packs,products=legacy,duplicate=false,lookupStatus=200}={}){
  const state={calls:[],orders:[],items:[],messages:[],payments:[],paymentLinks:[],rpc:null};
  const env={SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture',WHATSAPP_ACCESS_TOKEN:'fixture',WHATSAPP_CATALOG_ID:'catalog-A',WHATSAPP_PHONE_NUMBER_ID:'phone',WHATSAPP_APP_SECRET:'fixture',FLOW_TOKEN_SECRET:'fixture',RAZORPAY_MODE:'test',RAZORPAY_TEST_KEY_ID:'rzp_test_fixture',RAZORPAY_TEST_KEY_SECRET:'fixture'};
  const filter=(u,k)=>{const value=u.searchParams.get(k);return value?value.slice(3):null;};
  const fetch=async(url,options={})=>{
    const u=new URL(url),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;state.calls.push({url:String(url),method,body});
    if(u.hostname==='db.example.test'){
      const table=u.pathname.split('/').at(-1);
      if(table==='ProductVariant'){
        if(lookupStatus!==200)return new Response('lookup unavailable',{status:lookupStatus});
        const found=variants.filter(v=>v.retailer_id===filter(u,'retailer_id')&&v.parent.catalog_id===filter(u,'parent.catalog_id'));
        assert(u.searchParams.get('select').includes('parent:Product!inner('));
        return Response.json(duplicate?[...found,...found]:found);
      }
      if(table==='Product')return Response.json(products.filter(p=>p.retailer_id===filter(u,'retailer_id')&&p.catalog_id===filter(u,'catalog_id')));
      if(table==='Profile')return Response.json([{id:'profile-fixture',name:'Test Buyer'}]);
      if(table==='orders')return Response.json(state.orders);
      if(table==='create_order_with_shipping'){
        state.rpc=body;state.items=body.p_items;
        const order={id:1,reference_id:body.p_reference_id,catalog_id:body.p_catalog_id,currency:body.p_currency,total:body.p_total,subtotal:body.p_subtotal,shipping:body.p_shipping,discount:body.p_discount};
        state.orders.push(order);return Response.json({order,duplicate:false});
      }
      if(table==='payments'){
        if(method==='POST'){state.payments.push({id:1,...body});return Response.json(state.payments);}
        return Response.json(state.payments);
      }
      throw Error('Unexpected database call '+url);
    }
    if(u.hostname==='graph.facebook.com'&&u.pathname.endsWith('/messages')){state.messages.push(body);return Response.json({messages:[{id:'mock-message'}]});}
    if(u.hostname==='api.razorpay.com'&&u.pathname==='/v1/payment_links'){
      state.paymentLinks.push(body);return Response.json({id:'plink_mock',short_url:'https://pay.example.test/mock',reference_id:body.reference_id,expire_by:body.expire_by});
    }
    throw Error('Unexpected external call '+url);
  };
  const sandbox={calculateShipping,Deno:{env:{get:k=>env[k]},serve:()=>{}},crypto:webcrypto,performance,TextEncoder,TextDecoder,Response,Request,URL,AbortSignal,Date,setTimeout,btoa,atob,console:{log:()=>{},error:()=>{}},fetch};
  vm.runInNewContext(source+';globalThis.api={lookup:getExistingProductByRetailerId,create:createOrderFromWhatsAppCart,payment:createRazorpayPaymentLink,details:buildOrderDetailsPayload};',sandbox);
  return {api:sandbox.api,state};
}
const cart=items=>({id:'wamid-fixture',timestamp:String(Math.floor(Date.now()/1000)),order:{catalog_id:'catalog-A',product_items:items}});
const item=(id,price,quantity=1,extra={})=>({product_retailer_id:id,item_price:price,quantity,currency:'INR',...extra});

test('variant lookup identifies exact pack within the incoming catalog',async()=>{
  const f=fixture({variants:[...packs,{id:9,product_id:6,retailer_id:'pack-500',size:'Other',parent:{...parent,id:6,catalog_id:'catalog-B'}}]});
  assert.equal((await f.api.lookup('pack-500','catalog-A')).name,'Groundnut oil (500 ml)');
  assert.equal((await f.api.lookup('pack-1000','catalog-A')).name,'Groundnut oil (1 L)');
  assert.equal((await f.api.lookup('pack-500','catalog-B')).name,'Groundnut oil (Other)');
  assert.equal(await f.api.lookup('pack-500','unrelated-catalog'),null);
  assert.equal(f.state.calls.some(c=>c.url.includes('graph.facebook.com')),false);
});
test('legacy lookup remains readable but unknown pack weights cannot create a payable order',async()=>{
  const f=fixture();assert.equal((await f.api.lookup('legacy-only','catalog-A')).name,'Legacy item');
  await f.api.create('919000000001',cart([item('legacy-only',7.5),item('unmapped',2,1,{name:'Incoming item'})]));
  assert.equal(f.state.orders.length,0);assert.equal(f.state.payments.length,0);assert.equal(f.state.messages[0].type,'text');
});

test('mixed packs preserve incoming prices and exact IDs through order details and payment link',async()=>{
  const f=fixture();
  await f.api.create('919000000001',cart([item('pack-500',1,2),item('pack-1000',345,3)]));
  assert.equal(f.state.rpc.p_total,1237);assert.equal(f.state.rpc.p_shipping,200);
  assert.deepEqual(f.state.items.map(i=>[i.product_retailer_id,i.product_name,i.unit_price,i.quantity]),[['pack-500','Groundnut oil (500 ml)',1,2],['pack-1000','Groundnut oil (1 L)',345,3]]);
  assert.equal(f.state.messages[0].template.name,'address');
  const order=f.state.orders[0],payment=await f.api.payment(order,'919000000001');
  assert.equal(f.state.paymentLinks[0].amount,123700);
  assert.equal(f.state.paymentLinks[0].currency,'INR');
  assert.equal(payment.amount,1237);
  const details=f.api.details('919000000001',order,f.state.items,payment).interactive.action.parameters;
  assert.equal(details.total_amount.value,123700);
  assert.deepEqual(Array.from(details.order.items,i=>[i.retailer_id,i.amount.value,i.quantity]),[['pack-500',100,2],['pack-1000',34500,3]]);
  assert.equal(details.payment_settings[0].payment_link.uri,'https://pay.example.test/mock');
  await f.api.create('919000000001',cart([item('pack-500',1)]));
  assert.equal(f.state.orders.length,1);assert.equal(f.state.messages.length,1);
});
test('duplicate or failing variant lookup stops before order, payment or message creation',async()=>{
  for(const options of [{duplicate:true},{lookupStatus:503}]){
    const f=fixture(options);
    await assert.rejects(f.api.create('919000000001',cart([item('pack-500',1)])),/lookup failed|Ambiguous/);
    assert.equal(f.state.orders.length,0);assert.equal(f.state.messages.length,0);assert.equal(f.state.paymentLinks.length,0);
  }
});
test('catalog response mismatch and ambiguous legacy rows are rejected',async()=>{
  const f=fixture({variants:[{...packs[0],product_id:999}]});
  await assert.rejects(f.api.lookup('pack-500','catalog-A'),/identity mismatch/);
  const old=fixture({products:[...legacy,...legacy]});
  await assert.rejects(old.api.lookup('legacy-only','catalog-A'),/Ambiguous legacy/);
});
test('retailer IDs containing filter punctuation are URL encoded and remain exact',async()=>{
  const id='pack,"special".one&or=(id.gt.0)',f=fixture({variants:[{...packs[0],retailer_id:id}]});
  assert.equal((await f.api.lookup(id,'catalog-A')).retailer_id,id);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/client/admin.js',import.meta.url),'utf8').replace(/start\(\);\s*$/,'');
function editor(){
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector)) elements.set(selector,{value:'',innerHTML:'',dataset:{},addEventListener(){},reportValidity(){return true;}});
    return elements.get(selector);
  };
  const calls=[];
  const context=vm.createContext({document:{querySelector:element},URL,URLSearchParams,
    fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({});}});
  vm.runInContext(source,context);
  vm.runInContext(`state.token='a'.repeat(43); state.editing={id:1,name:'Oil',images:[],variants:[
    {id:10,size:'500 ml',price:175,inventory_quantity:5,availability_status:'available',shipping_weight_grams:null},
    {id:11,size:'1 L',price:345,inventory_quantity:null,availability_status:'available',shipping_weight_grams:1050}
  ]};`,context);
  return {context,element,calls};
}
test('existing editor renders per-variant weights in grams and distinguishes unknown values',()=>{
  const p=editor();vm.runInContext('renderEditor()',p.context);
  const html=p.element('#product-editor').innerHTML;
  assert.match(html,/Shipping weight \(g\)/);
  assert.match(html,/data-shipping-weight[^>]*value=""[^>]*placeholder="Unknown"/);
  assert.match(html,/data-shipping-weight[^>]*value="1050"/);
  assert.match(html,/id="new-shipping-weight"/);
});
test('saving and adding packs submits grams; invalid input cannot send a write',async()=>{
  const p=editor();
  vm.runInContext(`editorValues=()=>({name:'Oil',description:'',category:'Oils',images:[],active:true});
    loadProducts=async()=>{};renderEditor=()=>{};`,p.context);
  p.context.row={dataset:{variantId:'10'},querySelector:selector=>p.element(selector)};
  for(const [key,value] of Object.entries({'[data-size]':'500 ml','[data-price]':'175','[data-stock]':'5','[data-availability]':'available','[data-shipping-weight]':'550'}))p.element(key).value=value;
  await vm.runInContext('saveVariant(row)',p.context);
  assert.equal(p.calls[0].body.shippingWeightGrams,'550');
  assert.equal(p.calls[0].body.id,'10');
  assert.equal(p.calls[0].body.price,'175');
  p.element('[data-shipping-weight]').reportValidity=()=>false;
  await vm.runInContext('saveVariant(row)',p.context);
  assert.equal(p.calls.length,1);
  for(const [key,value] of Object.entries({'#new-size':'1 L','#new-price':'345','#new-stock':'','#new-availability':'available','#new-shipping-weight':''}))p.element(key).value=value;
  await vm.runInContext('saveVariant(null,true)',p.context);
  assert.equal(p.calls[1].body.shippingWeightGrams,'');
  assert.equal(p.calls[1].body.productId,1);
  assert.equal(p.calls[1].body.price,'345');
});

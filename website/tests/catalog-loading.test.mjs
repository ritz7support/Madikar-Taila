import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {setImmediate} from 'node:timers/promises';

const source = readFileSync(new URL('../dist/client/app.js',import.meta.url),'utf8');
const product = {id:'p1',slug:'groundnut-oil',name:'Groundnut Oil',category:'Oils',note:'Wood-pressed groundnut oil',image:'',variants:[{size:'500 ml',price:175,available:true,orderable:true}]};

function page(replies,path='/'){
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector,{
      innerHTML:'',textContent:'',hidden:false,listeners:{},
      addEventListener(type,handler){(this.listeners[type] ||= []).push(handler)}
    });
    return elements.get(selector);
  };
  let calls = 0;
  const delays = [];
  const url = new URL(path,'https://store.example');
  const location = {origin:url.origin,pathname:url.pathname,search:url.search,href:url.href};
  const navigate = (_state,_title,path) => {
    const next = new URL(path,location.origin);
    Object.assign(location,{pathname:next.pathname,search:next.search,href:next.href});
  };
  const context = vm.createContext({
    document:{title:'Madikar Taila',body:{classList:{toggle(){}}},querySelector:element,addEventListener(){}},
    window:{addEventListener(){}},location,history:{replaceState:navigate,pushState:navigate},
    localStorage:{getItem(){return null}},URL,URLSearchParams,AbortSignal,
    setTimeout(resolve,delay){delays.push(delay);queueMicrotask(resolve)},
    fetch:async (url,options) => {
      assert.equal(url,'/api/catalog');
      assert.equal(options.cache,'no-store');
      assert.ok(options.signal instanceof AbortSignal);
      const reply = replies[calls++];
      if (reply instanceof Error) throw reply;
      if (typeof reply === 'function') return reply();
      assert.ok(reply, 'Unexpected extra request');
      return reply;
    }
  });
  vm.runInContext(source,context);
  return {context,element,delays,calls:()=>calls};
}
async function settled(page){
  for(let i=0;i<30;i++){
    if (!vm.runInContext('catalogLoading',page.context)) return;
    await setImmediate();
  }
  assert.fail('Catalog did not settle');
}
const ok = () => Response.json({products:[product]});
const failure = () => Response.json({error:'temporarily unavailable'},{status:503});

test('a temporary backend failure recovers and renders product info',async () => {
  const p=page([failure(),ok()]); await settled(p);
  assert.equal(p.calls(),2);
  assert.deepEqual(p.delays,[1000]);
  assert.equal(p.element('#result-count').textContent,1);
  assert.match(p.element('#product-grid').innerHTML,/Groundnut Oil/);
  assert.match(p.element('#product-grid').innerHTML,/500 ml/);
  assert.match(p.element('#product-grid').innerHTML,/₹175/);
});

test('an outage stops after three attempts; the retry button can recover',async () => {
  const p=page([failure(),failure(),failure(),ok()]); await settled(p);
  assert.equal(p.calls(),3);
  assert.deepEqual(p.delays,[1000,2000]);
  assert.match(p.element('#product-grid').innerHTML,/Try again/);
  const event={target:{closest:selector=>selector==='[data-action="retry-catalog"]'?{}:null}};
  for(const handler of p.element('#product-grid').listeners.click) handler(event);
  await settled(p);
  assert.equal(p.calls(),4);
  assert.match(p.element('#product-grid').innerHTML,/Groundnut Oil/);
  assert.doesNotMatch(p.element('#product-grid').innerHTML,/Try again/);
});

test('network failures recover but access denials are not automatically retried',async () => {
  const offline=page([new TypeError('Network failed'),ok()]); await settled(offline);
  assert.equal(offline.calls(),2);
  const denied=page([Response.json({error:'Unauthorized'},{status:401})]); await settled(denied);
  assert.equal(denied.calls(),1);
  assert.match(denied.element('#product-grid').innerHTML,/Try again/);
});

test('invalid catalogs show the recovery control without rendering broken cards',async () => {
  const p=page([Response.json({products:[{...product,variants:[]}]})]); await settled(p);
  assert.equal(p.calls(),1);
  assert.match(p.element('#product-grid').innerHTML,/Try again/);
  assert.doesNotMatch(p.element('#product-grid').innerHTML,/product-card/);
});

test('overlapping load attempts do not duplicate the catalog request',async () => {
  let resolve;
  const pending=new Promise(r=>{resolve=r});
  const p=page([()=>pending]);
  await vm.runInContext('loadCatalog()',p.context);
  assert.equal(p.calls(),1);
  resolve(ok()); await settled(p);
  assert.equal(p.calls(),1);
  assert.equal(p.element('#result-count').textContent,1);
});

test('a direct product URL renders its page with the database size and price',async () => {
  const p=page([ok()],'/products/groundnut-oil'); await settled(p);
  assert.match(p.element('#product-page').innerHTML,/<h1>Groundnut Oil<\/h1>/);
  assert.match(p.element('#product-page').innerHTML,/500 ml/);
  assert.match(p.element('#product-page').innerHTML,/₹175/);
  assert.doesNotMatch(p.element('#product-page').innerHTML,/Traditional benefits/);
  assert.equal(p.element('#product-page').hidden,false);
});

test('legacy query links redirect to the product route and unknown products show not found',async () => {
  const old=page([ok()],'/?product=p1'); await settled(old);
  assert.equal(old.context.location.pathname,'/products/groundnut-oil');
  assert.match(old.element('#product-page').innerHTML,/Groundnut Oil/);
  const missing=page([ok()],'/products/not-in-catalog'); await settled(missing);
  assert.match(missing.element('#product-page').innerHTML,/Product not found/);
  assert.doesNotMatch(missing.element('#product-page').innerHTML,/Groundnut Oil/);
});

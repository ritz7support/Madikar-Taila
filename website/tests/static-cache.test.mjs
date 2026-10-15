import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
test('public page cache shares the store shell, supports validators and excludes API responses',async()=>{
 const previous=globalThis.caches,stored=new Map();let reads=0;
 globalThis.caches={get default(){throw Error('default cache forbidden')},open:async name=>{assert.match(name,/^madikar-static-/);return {match:async key=>stored.get(key.url)?.clone(),put:async(key,response)=>{stored.set(key.url,response.clone())}}}};
 const env={ASSETS:{fetch:async request=>{reads++;return new Response('page',{headers:{etag:'"page-v1"'}})}}};
 try{
  assert.equal(await (await worker.fetch(new Request('https://store.test/products/oil'),env)).text(),'page');
  assert.equal(await (await worker.fetch(new Request('https://store.test/'),env)).text(),'page');
  assert.equal(reads,1);assert.equal(stored.size,1);
  const cached=await worker.fetch(new Request('https://store.test/',{headers:{'if-none-match':'"page-v1"'}}),env);
  assert.equal(cached.status,304);assert.match(cached.headers.get('cache-control'),/must-revalidate/);
  await worker.fetch(new Request('https://store.test/api/catalog'),env);
  await worker.fetch(new Request('https://store.test/api/admin/config'),env);
  await worker.fetch(new Request('https://store.test/api/checkout/config'),env);
  assert.equal(stored.size,1);assert.equal(reads,1);
  assert.ok([...stored.keys()][0].includes('/__madikar_static/'));
 }finally{globalThis.caches=previous}
});
test('private or unsuccessful static responses never enter the public cache',async()=>{
 const previous=globalThis.caches;let writes=0;
 globalThis.caches={open:async()=>({match:async()=>null,put:async()=>writes++})};
 try{
  for(const response of [new Response('no',{status:404}),new Response('cookie',{headers:{'set-cookie':'private=1'}}),new Response('private',{headers:{'cache-control':'private, no-store'}})]){
   await worker.fetch(new Request('https://store.test/'),{ASSETS:{fetch:async()=>response}});
  }
  assert.equal(writes,0);
 }finally{globalThis.caches=previous}
});

test('a denied or unavailable cache cannot break a direct product page',async()=>{
 const previous=globalThis.caches;let reads=0;
 const env={ASSETS:{fetch:async request=>{assert.equal(new URL(request.url).pathname,'/');reads++;return new Response('product shell')}}};
 try{
  for(const cache of [{open:async()=>{throw Error('denied')}},{open:async()=>({match:async()=>{throw Error('cache unavailable')}})}]){
   globalThis.caches=cache;const response=await worker.fetch(new Request('https://store.test/products/oil'),env);assert.equal(response.status,200);assert.equal(await response.text(),'product shell');
  }
  assert.equal(reads,2);
 }finally{globalThis.caches=previous}
});

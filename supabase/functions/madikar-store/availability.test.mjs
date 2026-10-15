import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogAvailabilityService} from './availability.ts';
function fixture({missing=false,duplicate=false,failPost=0,mismatch=false}={}){
 const jobs=[{variant_id:1,catalog_id:'100',retailer_id:'pack-500',revision:3,lease_token:'lease-1',desired_availability:'out of stock'},
 {variant_id:2,catalog_id:'100',retailer_id:'pack-1000',revision:2,lease_token:'lease-2',desired_availability:'in stock'}];
 const records=new Map([['200',{id:'200',retailer_id:'pack-500',availability:'in stock'}],['201',{id:'201',retailer_id:'pack-1000',availability:'out of stock'}]]);
 const calls=[],finished=[];
 const service=createCatalogAvailabilityService({env:k=>k==='WHATSAPP_ACCESS_TOKEN'?'fixture-token':null,
 database:async(path,options)=>{
  const body=JSON.parse(options.body);
  if(path.endsWith('store_claim_catalog_availability'))return {payload:jobs};
  if(path.endsWith('store_finish_catalog_availability')){finished.push(body);return {payload:true};}
  throw Error('Unexpected DB operation '+path);
 },fetcher:async(url,options)=>{
  calls.push({url,options});const u=new URL(url);assert.equal(u.origin,'https://graph.facebook.com');
  assert.equal(options.headers.Authorization,'Bearer fixture-token');assert.equal(u.searchParams.has('access_token'),false);
  if(u.pathname.endsWith('/100/products')){
   assert.equal(options.method,undefined);
   if(u.searchParams.has('after')){
    assert.equal(u.searchParams.get('after'),'next');
    return Response.json({data:[records.get(duplicate?'200':'201')]});
   }
   return Response.json({data:missing?[]:[records.get('200')],paging:{next:'https://untrusted.test/?access_token=do-not-follow',cursors:{after:'next'}}});
  }
  const item=records.get(u.pathname.split('/').at(-1));assert.ok(item);
  if(options.method==='POST'){
   const patch=JSON.parse(options.body);assert.deepEqual(Object.keys(patch),['availability']);
   if(failPost)return Response.json({error:{code:failPost===429?4:200}},{status:failPost});
   if(!mismatch)item.availability=patch.availability;
   return Response.json({success:true});
  }
  return Response.json(item);
 }});
 return {service,calls,finished,records};
}
test('stock sync resolves every page, writes only each exact pack availability and confirms it',async()=>{
 const f=fixture();assert.deepEqual(await f.service.work(),{checked:2});
 assert.equal(f.calls.filter(c=>c.url.includes('/products?')).length,2);
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,2);
 assert.equal(f.records.get('200').availability,'out of stock');assert.equal(f.records.get('201').availability,'in stock');
 assert.ok(f.finished.every(r=>r.p_ok));assert.deepEqual(f.finished.map(r=>r.p_revision).sort(),[2,3]);
});
test('a missing pack fails without creating or updating a substitute',async()=>{
 const f=fixture({missing:true});await f.service.work();
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
 assert.equal(f.finished.find(r=>r.p_variant_id===1).p_retryable,false);
 assert.equal(f.records.get('200').availability,'in stock');
});
test('ambiguous catalog identities stop all writes',async()=>{
 const f=fixture({duplicate:true});await f.service.work();
 assert.equal(f.calls.filter(c=>c.options.method==='POST').length,0);
 assert.ok(f.finished.every(r=>!r.p_ok&&!r.p_retryable));
});
test('Meta permission errors need attention, transient errors retry, and neither is marked synced',async()=>{
 for(const status of [403,429]){
  const f=fixture({failPost:status});await f.service.work();
  assert.ok(f.finished.every(r=>!r.p_ok&&r.p_retryable===(status===429)));
  assert.ok(f.finished.every(r=>!r.p_error.includes('fixture-token')));
 }
});
test('a successful HTTP response is not enough without matching read-back availability',async()=>{
 const f=fixture({mismatch:true});await f.service.work();
 assert.ok(f.finished.every(r=>!r.p_ok&&r.p_retryable));
});

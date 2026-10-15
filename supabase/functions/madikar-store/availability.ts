// Only availability is sent to Meta; identities and all other catalog fields are read-only.
export function createCatalogAvailabilityService({database,env,fetcher=fetch}){
  const call=async(name,body)=>{const r=await database('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)});if(r.error)throw new Error('Stock sync tracking unavailable');return r.payload;};
  const failure=(message,retryable=true)=>Object.assign(new Error(message),{retryable});
  async function graph(path,options={}){
    const token=env('WHATSAPP_ACCESS_TOKEN');
    if(!token)throw failure('Meta access is not configured',false);
    let response;
    try{response=await fetcher('https://graph.facebook.com/v25.0/'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});}
    catch{throw failure('Meta could not be reached; retry pending');}
    const data=await response.json().catch(()=>null);
    if(!response.ok||data?.error){
      const code=Number(data?.error?.code);
      const retryable=response.status===429||response.status>=500||data?.error?.is_transient===true||[1,2,4,17,32,613].includes(code);
      throw failure([10,190,200].includes(code)?'Meta permission or access token needs attention':'Meta rejected availability update (HTTP '+response.status+', code '+(code||'unknown')+')',retryable);
    }
    if(!data)throw failure('Meta returned an unreadable response');
    return data;
  }
  async function items(catalogId){
    if(!/^[0-9]+$/.test(catalogId))throw failure('Invalid Meta catalog mapping',false);
    const found=new Map();let after='';
    const cursors=new Set();
    for(let page=0;page<100;page++){
      const query=new URLSearchParams({fields:'id,retailer_id,availability',limit:'100'});
      if(after)query.set('after',after);
      const data=await graph(catalogId+'/products?'+query);
      if(!Array.isArray(data.data))throw failure('Meta catalog could not be read');
      for(const item of data.data){
        if(!/^[0-9]+$/.test(item.id||'')||typeof item.retailer_id!=='string'||found.has(item.retailer_id))throw failure('Meta catalog mapping is ambiguous',false);
        found.set(item.retailer_id,item);
      }
      if(!data.paging?.next)return found;
      after=data.paging?.cursors?.after;
      if(!after||cursors.has(after))throw failure('Meta catalog pagination could not be completed');
      cursors.add(after);
    }
    throw failure('Meta catalog is too large to verify');
  }
  async function work(productId=null){
    const jobs=await call('store_claim_catalog_availability',{p_product_id:productId});
    const catalogs=new Map();
    // Resolve once per catalog. Never follow a Meta URL carrying an access token.
    for(const job of jobs){
      if(!catalogs.has(job.catalog_id))catalogs.set(job.catalog_id,items(job.catalog_id).then(value=>({value}),error=>({error})));
    }
    let cursor=0;
    async function next(){
      while(cursor<jobs.length){
        const job=jobs[cursor++];let item;
        try{
          const catalog=await catalogs.get(job.catalog_id);if(catalog.error)throw catalog.error;
          item=catalog.value.get(job.retailer_id);
          if(!item)throw failure('This pack retailer ID was not found in its Meta catalog',false);
          if(!['in stock','out of stock'].includes(job.desired_availability))throw failure('Invalid stock state',false);
          // An absolute assignment is safe to retry after an uncertain network response.
          await graph(item.id,{method:'POST',body:JSON.stringify({availability:job.desired_availability})});
          const verified=await graph(item.id+'?fields=id,retailer_id,availability');
          if(verified.id!==item.id||verified.retailer_id!==job.retailer_id||verified.availability!==job.desired_availability)throw failure('Meta availability has not been confirmed yet');
          await call('store_finish_catalog_availability',{p_variant_id:job.variant_id,p_revision:job.revision,p_lease_token:job.lease_token,p_ok:true,p_meta_item_id:item.id});
        }catch(error){
          await call('store_finish_catalog_availability',{p_variant_id:job.variant_id,p_revision:job.revision,p_lease_token:job.lease_token,p_ok:false,p_error:String(error.message||'Meta stock sync failed').slice(0,200),p_retryable:error.retryable!==false});
        }
      }
    }
    await Promise.all(Array.from({length:Math.min(3,jobs.length)},next));
    return {checked:jobs.length};
  }
  return {work};
}

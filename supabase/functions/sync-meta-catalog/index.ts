import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACCESS_TOKEN=Deno.env.get("WHATSAPP_ACCESS_TOKEN")??"";
const CATALOG_ID=Deno.env.get("WHATSAPP_CATALOG_ID")??"1515875913870520";
const API_VERSION=Deno.env.get("WHATSAPP_API_VERSION")??"v25.0";

if(!ACCESS_TOKEN) throw new Error("WHATSAPP_ACCESS_TOKEN is not configured");

async function graph(url:string){
  return fetch(url,{headers:{Authorization:`Bearer ${ACCESS_TOKEN}`},redirect:"follow"});
}

async function db(path:string,init:RequestInit={}){
  return fetch(`${SUPABASE_URL}${path}`,{
    ...init,
    headers:{
      apikey:SERVICE_KEY,
      Authorization:`Bearer ${SERVICE_KEY}`,
      "Content-Type":"application/json",
      ...(init.headers??{})
    }
  });
}

// PostgREST requires values containing `,` `.` `:` `(` `)` to be double-quoted
// inside an or=(...) filter expression. Quote defensively for every value,
// escaping any embedded backslash/quote, even though current retailer IDs are
// plain alphanumeric.
function quotePgFilterValue(value:string){
  return `"${value.replace(/\\/g,"\\\\").replace(/"/g,'\\"')}"`;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST"&&req.method!=="GET") return new Response("Method not allowed",{status:405});
  try{
    const products:any[]=[];
    let url=`https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(CATALOG_ID)}/products?fields=retailer_id,name,description,url&limit=100`;
    let pages=0;

    while(url){
      pages++;
      if(pages>1000) throw new Error("Catalog pagination exceeded safety limit");
      const r=await graph(url);
      const body=await r.text();
      if(!r.ok) throw new Error(`Meta Catalog API failed (${r.status}): ${body}`);
      const data=JSON.parse(body);
      for(const p of Array.isArray(data?.data)?data.data:[]){
        const retailerId=String(p?.retailer_id??"").trim();
        if(!retailerId) continue;
        products.push({
          retailer_id:retailerId,
          name:p?.name==null?null:String(p.name),
          description:p?.description==null?null:String(p.description),
          product_link:p?.url==null?null:String(p.url),
          catalog_id:CATALOG_ID,
          updated_at:new Date().toISOString()
        });
      }
      url=String(data?.paging?.next??"").trim();
    }

    for(let i=0;i<products.length;i+=100){
      const batch=products.slice(i,i+100);
      const r=await db(`/rest/v1/Product?on_conflict=catalog_id,retailer_id`,{
        method:"POST",
        headers:{Prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify(batch)
      });
      if(!r.ok) throw new Error(`Supabase Product upsert failed (${r.status}): ${await r.text()}`);
    }

    // Safety guard: if Meta returned zero products (e.g. a transient API
    // issue on an otherwise-good day), do NOT run stale-product cleanup —
    // that would delete every local product for this catalog. Only ever
    // delete stale rows after a retrieval that actually returned products.
    if(products.length===0){
      console.warn(`Meta Catalog API returned zero products for catalog ${CATALOG_ID}; skipping stale-product cleanup to avoid wiping the local catalog.`);
      return Response.json({ok:true,catalog_id:CATALOG_ID,products_synced:0,stale_removed:0,pages,cleanup_skipped:"empty_meta_response"});
    }

    const ids=products.map(p=>p.retailer_id);
    const existingR=await db(`/rest/v1/Product?select=retailer_id&catalog_id=eq.${encodeURIComponent(CATALOG_ID)}&limit=10000`);
    if(!existingR.ok) throw new Error(`Supabase Product verification failed (${existingR.status}): ${await existingR.text()}`);
    const existing=await existingR.json();
    const current=new Set(ids);
    const stale=existing.map((p:any)=>String(p.retailer_id??"")).filter((id:string)=>id&&!current.has(id));
    for(let i=0;i<stale.length;i+=100){
      const batch=stale.slice(i,i+100);
      const or=encodeURIComponent(`(${batch.map(id=>`retailer_id.eq.${quotePgFilterValue(id)}`).join(",")})`);
      const r=await db(`/rest/v1/Product?catalog_id=eq.${encodeURIComponent(CATALOG_ID)}&or=${or}`,{method:"DELETE"});
      if(!r.ok) throw new Error(`Supabase stale Product cleanup failed (${r.status}): ${await r.text()}`);
    }

    return Response.json({ok:true,catalog_id:CATALOG_ID,products_synced:products.length,stale_removed:stale.length,pages});
  }catch(e){
    console.error("Catalog sync error:",e);
    return Response.json({ok:false,error:String(e)},{status:500});
  }
});
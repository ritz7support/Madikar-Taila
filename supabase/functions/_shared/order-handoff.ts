const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_ATTEMPTS=24;
const RETRY_AFTER_MS=4*60*1000;
const REQUEST_TIMEOUT_MS=10000;
const RETRY_BATCH_SIZE=5;

async function db(path:string,options:RequestInit={}){
  return fetch(`${SUPABASE_URL}${path}`,{
    ...options,
    headers:{
      apikey:SERVICE_KEY,
      Authorization:`Bearer ${SERVICE_KEY}`,
      "Content-Type":"application/json",
      ...(options.headers??{})
    }
  });
}

async function selectOne(path:string,label:string){
  const r=await db(path);
  if(!r.ok)throw new Error(`${label} lookup failed: ${await r.text()}`);
  const rows=await r.json();
  return rows[0]??null;
}

// Timestamps contain PostgREST-reserved characters, so they must be double-quoted inside or=(...).
function dueFilter(){
  const cutoff=new Date(Date.now()-RETRY_AFTER_MS).toISOString();
  const or=`(handoff_last_attempt_at.lt."${cutoff}",and(handoff_last_attempt_at.is.null,updated_at.lt."${cutoff}"))`;
  return `status=eq.processing&handoff_sent_at=is.null&handoff_attempts=lt.${MAX_ATTEMPTS}&or=${encodeURIComponent(or)}`;
}

async function claim(orderId:number,retry:boolean){
  const filter=retry?dueFilter():"status=eq.processing&handoff_sent_at=is.null";
  const r=await db(`/rest/v1/orders?id=eq.${orderId}&${filter}&select=id,handoff_attempts`,{
    method:"PATCH",
    headers:{Prefer:"return=representation"},
    body:JSON.stringify({handoff_last_attempt_at:new Date().toISOString()})
  });
  if(!r.ok)throw new Error(`Handoff claim failed: ${await r.text()}`);
  const rows=await r.json();
  return rows[0]??null;
}

async function recordOutcome(orderId:number,attemptsBefore:number,error:string|null){
  const body=error===null
    ?{handoff_sent_at:new Date().toISOString(),handoff_attempts:attemptsBefore+1,handoff_last_error:null}
    :{handoff_attempts:attemptsBefore+1,handoff_last_error:error.slice(0,500)};
  const r=await db(`/rest/v1/orders?id=eq.${orderId}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify(body)});
  if(!r.ok)throw new Error(`Handoff outcome update failed: ${await r.text()}`);
}

async function buildPayload(orderId:number){
  const order=await selectOne(`/rest/v1/orders?select=id,reference_id,profile_id,address_id,total,currency,status,subtotal,shipping,discount,created_at&id=eq.${orderId}&limit=1`,"Order");
  if(!order)throw new Error(`Order ${orderId} not found`);
  const [profile,address,items,payment]=await Promise.all([
    order.profile_id?selectOne(`/rest/v1/Profile?select=id,whatsAppUserId,name,email&id=eq.${encodeURIComponent(String(order.profile_id))}&limit=1`,"Profile"):Promise.resolve(null),
    order.address_id?selectOne(`/rest/v1/addresses?select=id,label,recipient_name,phone,address_line_1,address_line_2,locality,city,state,pincode,country&id=eq.${encodeURIComponent(String(order.address_id))}&limit=1`,"Address"):Promise.resolve(null),
    db(`/rest/v1/order_items?select=product_retailer_id,product_name,quantity,unit_price,currency&order_id=eq.${orderId}&order=id.asc`).then(async r=>{if(!r.ok)throw new Error(`Order items lookup failed: ${await r.text()}`);return await r.json();}),
    selectOne(`/rest/v1/payments?select=paid_at&order_id=eq.${orderId}&status=eq.paid&order=paid_at.desc&limit=1`,"Payment")
  ]);
  if(!profile)throw new Error(`Profile for order ${orderId} not found`);
  if(!address)throw new Error(`Address for order ${orderId} not found`);
  return {
    event:"order.paid",
    order_id:order.id,
    reference_id:order.reference_id,
    order_status:order.status,
    customer:{phone:profile.whatsAppUserId,name:profile.name,email:profile.email},
    address:{id:address.id,label:address.label,recipient_name:address.recipient_name,phone:address.phone,address_line_1:address.address_line_1,address_line_2:address.address_line_2,locality:address.locality,city:address.city,state:address.state,pincode:address.pincode,country:address.country},
    items:items.map((item:any)=>({product_id:item.product_retailer_id,name:item.product_name,quantity:Number(item.quantity),unit_price:Number(item.unit_price),line_total:Number(item.unit_price)*Number(item.quantity),currency:item.currency})),
    subtotal:Number(order.subtotal),
    shipping:Number(order.shipping),
    discount:Number(order.discount),
    total:Number(order.total),
    currency:order.currency,
    order_created_at:order.created_at,
    confirmed_at:payment?.paid_at??new Date().toISOString()
  };
}

async function postToN8N(webhookUrl:string,payload:unknown){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  try{
    const r=await fetch(webhookUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});
    const text=await r.text();
    return r.ok?null:`HTTP ${r.status}: ${text.slice(0,300)}`;
  }finally{
    clearTimeout(timeout);
  }
}

export async function deliverOrderHandoff(orderId:number,{retry}:{retry:boolean}){
  const webhookUrl=Deno.env.get("N8N_WEBHOOK_URL");
  if(!webhookUrl){
    console.error("N8N webhook URL is not configured; order handoff skipped:",JSON.stringify({order_id:orderId}));
    return "skipped";
  }
  const claimed=await claim(orderId,retry);
  if(!claimed)return "not_due";
  const attempt=Number(claimed.handoff_attempts)+1;
  let error:string|null=null;
  try{
    error=await postToN8N(webhookUrl,await buildPayload(orderId));
  }catch(e){
    error=String(e);
  }
  if(error)console.error("n8n order handoff failed:",JSON.stringify({order_id:orderId,attempt,error}));
  else console.log("n8n order handoff succeeded:",JSON.stringify({order_id:orderId,attempt}));
  await recordOutcome(orderId,Number(claimed.handoff_attempts),error);
  return error?"failed":"sent";
}

export async function retryDueOrderHandoffs(){
  const r=await db(`/rest/v1/orders?select=id&${dueFilter()}&order=id.asc&limit=${RETRY_BATCH_SIZE}`);
  if(!r.ok)throw new Error(`Due handoff lookup failed: ${await r.text()}`);
  const due:{id:number}[]=await r.json();
  const counts={due:due.length,sent:0,failed:0,skipped:0};
  for(const {id} of due){
    const outcome=await deliverOrderHandoff(Number(id),{retry:true});
    if(outcome==="sent")counts.sent++;
    else if(outcome==="failed")counts.failed++;
    else counts.skipped++;
  }
  return counts;
}

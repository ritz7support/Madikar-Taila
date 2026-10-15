import { createPaymentConfirmationService } from './confirmation.ts';
// Website-only payment processing. Does not import or modify bot handlers.
const encoder = new TextEncoder();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const tokenPattern = /^[a-f0-9]{64}$/;
const hex = bytes => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const fail = (message,status=400) => { const error=new Error(message);error.status=status;throw error; };
const same = (a,b) => { if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0; };
const digest = async value => hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)));}

export function validateDelivery(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Please enter your delivery details.');
  const limits={name:80,phone:10,email:120,line1:120,line2:120,city:60,state:60,postalCode:6,country:20};
  const a={};
  for(const [key,max] of Object.entries(limits)){
    if(raw[key]!==undefined&&typeof raw[key]!=='string')fail('Please check your delivery details.');
    const value=(raw[key]||'').trim();
    if(value.length>max||/[\x00-\x1f\x7f]/.test(value))fail('Please check your delivery details.');
    a[key]=value;
  }
  if(a.name.length<2||!a.line1||!a.city||!a.state||a.country!=='India'||!/^[6-9][0-9]{9}$/.test(a.phone)||!/^\d{6}$/.test(a.postalCode))fail('Please complete all required delivery fields.');
  if(a.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email))fail('Please enter a valid email address.');
  return a;
}

export function createCheckoutService({database,env,fetch:fetcher=fetch,background=promise=>promise.catch(()=>{})}){
  const confirmations=createPaymentConfirmationService({database,env,fetch:fetcher});
  const db=async(path,options={})=>{const r=await database(path,options);if(r.error)fail(r.error,r.status||502);return r.payload;};
  const rpc=(name,body)=>db('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)});
  const patch=(id,data)=>db('/rest/v1/store_checkout_sessions?id=eq.'+id,{method:'PATCH',body:JSON.stringify(data)});
  function keys(mode){
    if(!['test','live'].includes(mode))fail('Online payment is not available.',503);
    const prefix='RAZORPAY_'+mode.toUpperCase();
    const id=env(prefix+'_KEY_ID'),secret=env(prefix+'_KEY_SECRET');
    if(!id||!secret||!id.startsWith('rzp_'+mode+'_'))fail('Online payment is not available.',503);
    return {id,secret};
  }
  async function config(){
    const mode=(env('RAZORPAY_MODE')||'').trim().toLowerCase();
    const [settings]=await db('/rest/v1/store_checkout_settings?select=enabled,shipping_paise&id=eq.true');
    const shippingPaise=Number.isInteger(settings?.shipping_paise)?settings.shipping_paise:null;
    let configured=false;try{keys(mode);configured=true;}catch{}
    return {ready:configured&&settings?.enabled===true&&shippingPaise!==null,shippingPaise,mode:['test','live'].includes(mode)?mode:null};
  }
  async function razorpay(mode,path,options={}){
    const {id,secret}=keys(mode);
    const response=await fetcher('https://api.razorpay.com/v1'+path,{...options,headers:{Authorization:'Basic '+btoa(id+':'+secret),'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data)fail('The payment service is temporarily unavailable. Please try again.',502);
    return data;
  }
  async function quote(raw){
    if(!Array.isArray(raw)||raw.length<1||raw.length>16)fail('Please select between 1 and 16 different products.');
    const [products,variants]=await Promise.all([
      db('/rest/v1/Product?select=id,store_id,store_name,name,retailer_id,catalog_id&store_active=eq.true&store_id=not.is.null&slug=not.is.null'),
      db('/rest/v1/ProductVariant?select=id,product_id,retailer_id,position,size,price,inventory_quantity,availability_status&order=position.asc,id.asc')
    ]);
    const seen=new Set();let subtotalPaise=0,catalogId=null;
    const items=raw.map(line=>{
      if(!line||typeof line.id!=='string'||!Number.isInteger(line.variant)||line.variant<0||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>20)fail('Your bag contains an invalid item or quantity.');
      const product=products.find(p=>p.store_id===line.id),key=line.id+':'+line.variant;
      if(!product||seen.has(key))fail('Your bag contains an invalid or duplicate item.');seen.add(key);
      const variant=variants.filter(v=>v.product_id===product.id)[line.variant];
      if(!variant||variant.availability_status!=='available'||(variant.inventory_quantity!==null&&variant.inventory_quantity<line.quantity))fail('Please remove an unavailable item from your bag.');
      const price=Number(variant.price)*100,unitPaise=Math.round(price);
      if(!Number.isSafeInteger(unitPaise)||unitPaise<100||Math.abs(price-unitPaise)>0.001)fail('Your bag contains an invalid price.');
      if(catalogId!==null&&catalogId!==product.catalog_id)fail('Your bag contains products from different catalogues.');
      catalogId=product.catalog_id;subtotalPaise+=unitPaise*line.quantity;
      return {productId:product.id,variantId:variant.id,retailerId:variant.retailer_id||product.retailer_id,name:`${product.store_name||product.name} (${variant.size})`,quantity:line.quantity,unitPaise};
    });
    if(!catalogId||subtotalPaise<100||subtotalPaise>10000000)fail('The order amount is outside the supported range.');
    return {items,subtotalPaise,catalogId};
  }
  async function profile(address){
    const phone='91'+address.phone;
    const lookup=async()=>{const rows=await db('/rest/v1/Profile?select=id&whatsAppUserId=eq.'+phone+'&limit=1');return rows[0];};
    const existing=await lookup();if(existing)return existing.id;
    const syntheticEmail=`wa_${phone}@whatsapp.local`;
    let user;
    try{user=await db('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:syntheticEmail,password:crypto.randomUUID()+crypto.randomUUID(),email_confirm:true,user_metadata:{whatsapp_user_id:phone}})});}
    catch(error){
      // Never trust the first list result or an unsupported email filter.
      if(![409,422].includes(error.status))throw error;
      for(let page=1;page<=100&&!user;page++){
        const result=await db(`/auth/v1/admin/users?page=${page}&per_page=1000`);
        user=result.users?.find(u=>u.email===syntheticEmail);
        if((result.users?.length||0)<1000)break;
      }
      if(!user)throw error;
    }
    try{await db('/rest/v1/Profile?on_conflict=whatsAppUserId',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates'},body:JSON.stringify({id:user.id,whatsAppUserId:phone,language:'en',name:address.name,email:address.email||null})});}
    catch(error){if(error.status!==409)throw error;}
    const saved=await lookup();if(!saved)fail('Your checkout could not be prepared. Please try again.',502);
    return saved.id;
  }
  function identity(body){if(!uuid.test(body?.sessionId||'')||!tokenPattern.test(body?.token||''))fail('The checkout session is invalid.');}
  async function session(body){
    identity(body);const [s]=await db('/rest/v1/store_checkout_sessions?select=*&id=eq.'+body.sessionId+'&limit=1');
    if(!s||!same(s.token_hash,await digest(body.token)))fail('The checkout session was not found.',404);
    return s;
  }
  async function create(body){
    identity(body);const a=validateDelivery(body.address),cfg=await config();
    if(!cfg.ready)fail('Online payment is not available yet.',503);
    const requestHash=await digest(JSON.stringify({lines:body.lines,address:a}));
    const existing=await db('/rest/v1/store_checkout_sessions?select=*&id=eq.'+body.sessionId+'&limit=1');
    if(existing[0])return prepared(await session(body),requestHash);
    if(!tokenPattern.test(body.clientHash||''))fail('Checkout could not be prepared.',400);
    const allowed=await rpc('store_allow_checkout',{p_client_hash:body.clientHash,p_phone_hash:await digest('phone:'+a.phone)});
    if(!allowed)fail('Too many checkout attempts. Please try again later.',429);
    const q=await quote(body.lines),total=q.subtotalPaise+cfg.shippingPaise;
    if(total>10000000)fail('The order amount is outside the supported range.');
    const profileId=await profile(a);
    const s={id:body.sessionId,token_hash:await digest(body.token),request_hash:requestHash,mode:cfg.mode,
      profile_id:profileId,phone:'91'+a.phone,customer:a,items:q.items,catalog_id:q.catalogId,
      subtotal_paise:q.subtotalPaise,shipping_paise:cfg.shippingPaise,total_paise:total};
    try{await db('/rest/v1/store_checkout_sessions',{method:'POST',body:JSON.stringify(s)});}
    catch(error){if(error.status===409)return prepared(await session(body),requestHash);throw error;}
    const order=await razorpay(s.mode,'/orders',{method:'POST',body:JSON.stringify({amount:total,currency:'INR',receipt:'WEB'+s.id.replaceAll('-',''),notes:{website_session:s.id,source:'madikar_website'}})});
    if(!/^order_[A-Za-z0-9]+$/.test(order.id||'')||order.amount!==total||order.currency!=='INR')fail('The payment order could not be prepared.',502);
    await patch(s.id,{provider_order_id:order.id,status:'ready'});
    return {sessionId:s.id,orderId:order.id,amountPaise:total,keyId:keys(s.mode).id,mode:s.mode};
  }
  function prepared(s,requestHash){
    if(s.request_hash!==requestHash)fail('Delivery details or bag changed. Please start a new checkout.',409);
    if(s.status==='paid')fail('This checkout has already been paid.',409);
    if(Date.parse(s.expires_at)<Date.now())fail('This checkout expired. Please start a new checkout.',409);
    if(!s.provider_order_id)fail('Payment preparation is still pending. Please try again shortly.',503);
    return {sessionId:s.id,orderId:s.provider_order_id,amountPaise:s.total_paise,keyId:keys(s.mode).id,mode:s.mode};
  }
  async function paidResult(s){
    const [order]=await db('/rest/v1/orders?select=reference_id&id=eq.'+s.order_id+'&source=eq.store&limit=1');
    return {status:'paid',reference:order.reference_id,paymentId:s.provider_payment_id,amountPaise:s.total_paise,mode:s.mode};
  }
  async function capture(s,payment,verifiedOrder=null){
    if(payment.order_id!==s.provider_order_id||payment.amount!==s.total_paise||payment.currency!=='INR')fail('Payment does not match this checkout.');
    if(payment.status!=='captured')return {status:'pending'};
    const order=verifiedOrder || await razorpay(s.mode,'/orders/'+s.provider_order_id);
    if(order.amount!==s.total_paise||order.currency!=='INR'||order.status!=='paid')return {status:'pending'};
    const saved=await rpc('store_finalize_checkout',{p_session_id:s.id,p_provider_order_id:s.provider_order_id,p_payment_id:payment.id,p_amount_paise:payment.amount,p_currency:'INR',p_method:payment.method||null,p_paid_at:new Date((payment.created_at||Math.floor(Date.now()/1000))*1000).toISOString()});
    background(work(s.id));
    return {status:'paid',reference:saved.reference,paymentId:payment.id,amountPaise:s.total_paise,mode:s.mode};
  }
  async function verify(body){
    const s=await session(body);
    if(body.orderId!==s.provider_order_id||!/^pay_[A-Za-z0-9]+$/.test(body.paymentId||'')||!/^[a-f0-9]{64}$/i.test(body.signature||''))fail('The payment response is incomplete.');
    if(!same(await hmac(keys(s.mode).secret,s.provider_order_id+'|'+body.paymentId),body.signature.toLowerCase()))fail('Payment signature could not be verified.');
    if(s.status==='paid'){
      if(s.provider_payment_id!==body.paymentId)fail('Payment does not match this checkout.');
      return paidResult(s);
    }
    // Independent provider reads run together; success still requires both validations
    // and the same transactional order finalization as before.
    const [payment,order]=await Promise.all([
      razorpay(s.mode,'/payments/'+body.paymentId),
      razorpay(s.mode,'/orders/'+s.provider_order_id)
    ]);
    return capture(s,payment,order);
  }
  async function reconcile(s){
    if(!s.provider_order_id)return {status:'pending'};
    const list=await razorpay(s.mode,'/orders/'+s.provider_order_id+'/payments');
    const payment=list.items?.find(p=>p.status==='captured');
    return payment?capture(s,payment):{status:'pending'};
  }
  async function status(body){const s=await session(body);return s.status==='paid'?paidResult(s):reconcile(s);}
  async function handoff(s){
    if(s.handoff_sent_at)return;
    const webhook=env('N8N_WEBHOOK_URL');if(!webhook)fail('Fulfilment is not configured.',503);
    const [order]=await db('/rest/v1/orders?select=id,reference_id,address_id,status,created_at&id=eq.'+s.order_id+'&source=eq.store&limit=1');
    const [address]=await db('/rest/v1/addresses?select=id,label,recipient_name,phone,address_line_1,address_line_2,locality,city,state,pincode,country&id=eq.'+order.address_id+'&limit=1');
    const payload={event:'order.paid',payment_mode:s.mode,is_test:s.mode==='test',order_id:order.id,reference_id:order.reference_id,order_status:'processing',
      customer:{phone:s.phone,name:s.customer.name,email:s.customer.email||null},address,
      items:s.items.map(i=>({product_id:i.retailerId,name:i.name,quantity:i.quantity,unit_price:i.unitPaise/100,line_total:i.unitPaise*i.quantity/100,currency:'INR'})),
      subtotal:s.subtotal_paise/100,shipping:s.shipping_paise/100,discount:0,total:s.total_paise/100,currency:'INR',order_created_at:order.created_at,confirmed_at:s.paid_at};
    const response=await fetcher(webhook,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'website:'+s.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
    if(!response.ok){const detail=(await response.text()).slice(0,180);fail('n8n HTTP '+response.status+': '+detail,502);}
    await rpc('store_complete_handoff',{p_session_id:s.id});
  }
  async function work(id=null){
    // Independent tasks: WhatsApp failure must never prevent the n8n handoff.
    const results=await Promise.allSettled([checkoutWork(id),confirmations.work(id)]);
    if(results[1].status==='rejected')console.error('Website confirmation recovery unavailable.');
    if(results[0].status==='rejected')throw results[0].reason;
    return {...results[0].value,confirmations:results[1].status==='fulfilled'?results[1].value.checked:0};
  }
  async function checkoutWork(id=null){
    const sessions=await rpc('store_claim_checkout_work',{p_session_id:id});
    await Promise.all(sessions.map(async s=>{
      try{if(s.status==='ready')await reconcile(s);else await handoff(s);}
      catch(error){await patch(s.id,{last_error:String(error.message||'Retry pending').slice(0,250)});}
    }));
    return {checked:sessions.length};
  }
  async function authorizeRecovery(token){
    if(!tokenPattern.test(token||''))return false;
    const [settings]=await db('/rest/v1/store_checkout_settings?select=recovery_token&id=eq.true');
    return same(token,settings?.recovery_token);
  }
  async function webhook(raw,signature){
    if(!/^[a-f0-9]{64}$/i.test(signature||''))fail('Invalid signature.',401);
    const modes=[];
    for(const mode of ['test','live']){const secret=env('RAZORPAY_'+mode.toUpperCase()+'_WEBHOOK_SECRET');if(secret&&same(await hmac(secret,raw),signature.toLowerCase()))modes.push(mode);}
    if(!modes.length)fail('Invalid signature.',401);
    let event;try{event=JSON.parse(raw);}catch{fail('Invalid event.');}
    if(!['payment.captured','order.paid'].includes(event.event))return {ok:true,ignored:true};
    const p=event.payload?.payment?.entity,orderId=p?.order_id||event.payload?.order?.entity?.id;
    if(!/^order_[A-Za-z0-9]+$/.test(orderId||''))fail('Invalid event.');
    const [s]=await db('/rest/v1/store_checkout_sessions?select=*&provider_order_id=eq.'+orderId+'&limit=1');
    if(!s)return {ok:true,ignored:true};
    if(!modes.includes(s.mode))fail('Invalid payment mode.',401);
    if(s.status!=='paid'){
      if(p?.id&&/^pay_[A-Za-z0-9]+$/.test(p.id))await capture(s,await razorpay(s.mode,'/payments/'+p.id));
      else await reconcile(s);
    }
    background(work(s.id));return {ok:true};
  }
  return {config,create,verify,status,webhook,work,authorizeRecovery};
}

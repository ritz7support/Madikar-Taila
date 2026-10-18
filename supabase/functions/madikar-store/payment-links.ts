// Only provider reads plus the one explicit create/cancel requested by checkout.
const fail=(message,status=502)=>{throw Object.assign(new Error(message),{status})};
const linkReference=s=>'WEB'+s.id.replaceAll('-','');
export function safePaymentUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['rzp.io','rzp.io.in','razorpay.com'].includes(u.hostname)?u.href:null}catch{return null}
}
export function createWebsitePaymentLinks({razorpay,patch,rpc,background,work}){
  function validate(s,link){
    if(!/^plink_[A-Za-z0-9]+$/.test(link?.id||'')||link.reference_id!==linkReference(s)||link.amount!==s.total_paise||link.currency!=='INR'||link.accept_partial!==false||link.notes?.website_session!==s.id||link.notes?.source!=='madikar_website')fail('Payment link does not match this checkout.');
    if(s.provider_payment_link_id&&s.provider_payment_link_id!==link.id)fail('Payment link does not match this checkout.');
    if(!safePaymentUrl(link.short_url))fail('The payment link could not be verified.');
  }
  async function remember(s,link){
    validate(s,link);
    const fields={provider_payment_link_id:link.id,provider_payment_link_reference_id:link.reference_id,provider_payment_link_url:link.short_url,status:'ready'};
    // Never regress a paid row: callers use a conditional patch for this write.
    await patch(s.id,fields,'&status=eq.preparing');Object.assign(s,fields);return link;
  }
  async function recover(s){
    if(s.provider_payment_link_id){const link=await razorpay(s.mode,'/payment_links/'+s.provider_payment_link_id);validate(s,link);return link;}
    // A timed-out POST is never replayed. Search the unique stored reference.
    const data=await razorpay(s.mode,'/payment_links?reference_id='+encodeURIComponent(linkReference(s)));
    const matches=(data.payment_links||[]).filter(link=>link.reference_id===linkReference(s));
    if(matches.length>1)fail('Payment preparation needs review. Please contact the store.');
    if(!matches.length)return null;
    return remember(s,matches[0]);
  }
  async function create(s){
    const payload={amount:s.total_paise,currency:'INR',accept_partial:false,
      expire_by:Math.floor(Date.parse(s.expires_at)/1000),reference_id:linkReference(s),description:'Madikar Taila website order',
      customer:{name:s.customer.name,contact:'+'+s.phone,...(s.customer.email?{email:s.customer.email}:{})},
      notify:{sms:false,email:false},reminder_enable:false,
      notes:{website_session:s.id,source:'madikar_website'},
      callback_url:'https://madikartaila.com/?payment=return',callback_method:'get',
      options:{checkout:{method:{upi:1,card:0,netbanking:0,wallet:0}}}};
    let link;
    try{link=await razorpay(s.mode,'/payment_links',{method:'POST',body:JSON.stringify(payload)});}
    catch(error){
      if(error.creationRejected===true){
        await patch(s.id,{payment_resolution:'creation_rejected'},'&status=eq.preparing&provider_payment_link_id=is.null');
        fail('Payment link creation was rejected. Please review your details and start a new checkout.',409);
      }
      throw error;
    }
    await remember(s,link);return prepared(s);
  }
  async function prepared(s){
    if(s.payment_resolution==='creation_rejected')fail('Payment link creation was rejected. Please start a new checkout.',409);
    const link=await recover(s);
    if(!link)fail('Payment preparation is still pending. Please try again shortly.',503);
    if(['cancelled','expired'].includes(link.status))fail('This checkout expired. Please start a new checkout.',409);
    if(link.status==='paid')fail('This checkout has already been paid. Check payment status.',409);
    if(Date.parse(s.expires_at)<=Date.now())fail('The payment link is expiring. Check payment status before starting again.',409);
    return {sessionId:s.id,paymentMethod:'payment_link',paymentUrl:link.short_url,amountPaise:s.total_paise,mode:s.mode,expiresAt:s.expires_at};
  }
  async function reconcile(s,providedLink=null){
    if(s.payment_resolution==='creation_rejected')return {status:'failed'};
    const link=providedLink||await recover(s);
    if(!link){
      if(Date.parse(s.expires_at)<Date.now()){
        await patch(s.id,{payment_resolution:'expired'},'&status=neq.paid');return {status:'expired'};
      }
      return {status:'pending'};
    }
    validate(s,link);
    if(link.status!=='paid'){
      const status=['cancelled','expired'].includes(link.status)&&!(link.payments||[]).some(p=>['authorized','captured'].includes(p.status))?link.status:'pending';
      if(status!=='pending')await patch(s.id,{payment_resolution:status},'&status=neq.paid');
      return {status,paymentUrl:link.short_url,expiresAt:s.expires_at};
    }
    if(link.amount_paid!==s.total_paise)fail('Payment amount does not match this checkout.');
    const payments=(link.payments||[]).filter(p=>p.status==='captured'&&p.amount===s.total_paise);
    if(payments.length!==1||!/^pay_[A-Za-z0-9]+$/.test(payments[0].payment_id||''))return {status:'pending'};
    // Standard Payment Links do not guarantee an order_id field. The captured
    // payment listed by this verified link supplies the canonical order ID.
    const payment=await razorpay(s.mode,'/payments/'+payments[0].payment_id);
    if(payment.id!==payments[0].payment_id||!/^order_[A-Za-z0-9]+$/.test(payment.order_id||'')||payment.amount!==s.total_paise||payment.currency!=='INR'||(link.order_id&&link.order_id!==payment.order_id))fail('Payment does not match this checkout.');
    const order=await razorpay(s.mode,'/orders/'+payment.order_id);
    if(order.id!==payment.order_id||order.amount!==s.total_paise||order.currency!=='INR')fail('Payment does not match this checkout.');
    if(payment.status!=='captured'||order.status!=='paid')return {status:'pending'};
    const saved=await rpc('store_finalize_link_checkout',{p_session_id:s.id,p_link_id:link.id,p_reference_id:link.reference_id,p_provider_order_id:payment.order_id,p_payment_id:payment.id,p_amount_paise:payment.amount,p_currency:'INR',p_method:payment.method||null,p_paid_at:new Date((payment.created_at||Math.floor(Date.now()/1000))*1000).toISOString()});
    background(work(s.id));return {status:'paid',reference:saved.reference,paymentId:payment.id,amountPaise:s.total_paise,mode:s.mode};
  }
  async function cancel(s){
    if(s.payment_resolution==='creation_rejected')return {status:'failed'};
    const link=await recover(s);if(!link){if(Date.parse(s.expires_at)<Date.now())return {status:'expired'};fail('Payment preparation is still pending. Check again shortly.',409);}
    const current=await reconcile(s,link);
    if(current.status!=='pending')return current;
    // Razorpay rejects cancellation if payment wins the race. Never clear the
    // browser session until the provider confirms a terminal unpaid state.
    await razorpay(s.mode,'/payment_links/'+link.id+'/cancel',{method:'POST'});
    return reconcile(s);
  }
  return {create,prepared,reconcile,cancel};
}

const checkout=window.MADIKAR_STORE;
const checkoutForm=document.querySelector('#shipping-form'),checkoutStatus=document.querySelector('#checkout-status'),payButton=document.querySelector('#razorpay-pay');
const sessionKey='madikar-checkout-session';
let paymentConfig={ready:false,shippingPaise:null},lastCheckoutFocus=null,busy=false,confirmed=false,lastPaidSessionId=null,quoteRequest=0;
const paidCartUpdates=new Map();
const inr=checkout.money;
const cartLines=()=>checkout.cartEntries().map(({key,qty})=>{const[id,variant]=key.split(':');return{id,variant:Number(variant),quantity:qty}});
const setStatus=(message,tone='note')=>{checkoutStatus.textContent=message;checkoutStatus.dataset.tone=tone;checkoutStatus.hidden=!message};
const addressFromForm=()=>{const data=new FormData(checkoutForm);return Object.fromEntries(['name','phone','email','line1','line2','city','state','postalCode','country'].map(key=>[key,String(data.get(key)||'').trim()]))};
const subtotalPaise=()=>checkout.cartEntries().reduce((sum,{qty,v})=>sum+Math.round(qty*v.price*100),0);
// Keep the checkout capability across closed tabs, just as the bag persists.
// No address, phone, payment URL or provider credentials are stored here.
const readSession=()=>{try{
  const current=localStorage.getItem(sessionKey);
  if(current)return JSON.parse(current);
  const legacy=sessionStorage.getItem(sessionKey);
  if(!legacy)return null;
  localStorage.setItem(sessionKey,legacy);sessionStorage.removeItem(sessionKey);
  return JSON.parse(legacy);
}catch{return null}};
const saveSession=session=>{localStorage.setItem(sessionKey,JSON.stringify(session));sessionStorage.removeItem(sessionKey)};
const clearSession=sessionId=>{if(sessionId&&readSession()?.sessionId!==sessionId)return;localStorage.removeItem(sessionKey);sessionStorage.removeItem(sessionKey)};
const identity=session=>({sessionId:session.sessionId,token:session.token});
function renderCheckoutSummary(){
  const subtotal=subtotalPaise();
  document.querySelector('#checkout-items-total').textContent=inr((paymentConfig.subtotalPaise??subtotal)/100);
  document.querySelector('#checkout-shipping').textContent=paymentConfig.ready?inr(paymentConfig.shippingPaise/100):'Confirmed by seller';
  document.querySelector('#checkout-grand-total').textContent=paymentConfig.ready?inr((paymentConfig.amountPaise??subtotal+paymentConfig.shippingPaise)/100):'Pending';
  payButton.disabled=busy||!paymentConfig.ready||subtotal===0||checkout.cartEntries().some(e=>e.v.orderable===false);
}
async function loadPaymentConfig(){
  const request=++quoteRequest,lines=cartLines();paymentConfig={ready:false,shippingPaise:null};renderCheckoutSummary();
  try{
    const response=await fetch('/api/checkout/config',{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error();const config=await response.json();
    let quote={};
    if(config.ready&&(config.weightShipping||config.paymentMethod==='payment_link'))quote=await jsonPost('/api/checkout/quote',{lines});
    if(request!==quoteRequest||JSON.stringify(lines)!==JSON.stringify(cartLines()))return;
    paymentConfig={ready:config.ready===true&&Number.isInteger(quote.shippingPaise??config.shippingPaise),shippingPaise:quote.shippingPaise??config.shippingPaise,paymentMethod:config.paymentMethod||'order',...quote};
  }catch(error){if(request!==quoteRequest)return;paymentConfig={ready:false,shippingPaise:null};setStatus(error.message||'Shipping could not be calculated. Please try again.','error')}
  renderCheckoutSummary();
}
function showModal(){
  lastCheckoutFocus=document.activeElement;checkout.closeCart();document.querySelector('#checkout-overlay').hidden=false;
  document.querySelector('#checkout-modal').classList.add('open');document.querySelector('#checkout-modal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
function openCheckout(){
  const pending=readSession();if(pending?.confirming||(pending?.paymentMethod==='payment_link'&&pending.requested)){confirmingView();void waitForConfirmation(pending);return}
  if(!checkout.cartEntries().length||checkout.cartEntries().some(e=>e.v.orderable===false))return;
  document.querySelector('#checkout-modal').classList.remove('payment-confirmed','payment-confirming');document.querySelector('#checkout-modal').setAttribute('aria-labelledby','checkout-title');
  showModal();checkoutForm.hidden=false;document.querySelector('#checkout-success').hidden=true;document.querySelector('#checkout-confirming').hidden=true;setStatus('');renderCheckoutSummary();loadPaymentConfig();checkoutForm.elements.name.focus();
}
function closeCheckout(){
  if(confirmed){
    clearSession(lastPaidSessionId);confirmed=false;
    document.querySelector('#checkout-overlay').hidden=true;document.querySelector('#checkout-modal').classList.remove('open');
    document.querySelector('#checkout-modal').setAttribute('aria-hidden','true');document.body.style.overflow='';
    if(checkout.navigate)checkout.navigate('/',{replace:true});else window.location.assign('/');return;
  }
  document.querySelector('#checkout-overlay').hidden=true;document.querySelector('#checkout-modal').classList.remove('open');
  document.querySelector('#checkout-modal').setAttribute('aria-hidden','true');document.body.style.overflow='';if(lastCheckoutFocus?.isConnected)lastCheckoutFocus.focus();
}
let razorpayScriptPromise;
function loadRazorpayScript(){
  if(window.Razorpay)return Promise.resolve();
  if(!razorpayScriptPromise)razorpayScriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';
    script.onload=resolve;script.onerror=()=>{razorpayScriptPromise=null;reject(new Error('Razorpay checkout could not load.'))};document.head.appendChild(script);
  });return razorpayScriptPromise;
}
async function jsonPost(url,body){
  const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(50000)});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||'The checkout request could not be completed.'),{status:response.status});return data;
}
async function prepareSession(lines,address){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({lines,address})));
  const fingerprint=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');let session=readSession();
  if(session?.confirming||(session?.paymentMethod==='payment_link'&&session.requested))throw new Error('Your earlier payment is being confirmed. Please refresh to check it before paying again.');
  if(!session||session.fingerprint!==fingerprint){
    session={sessionId:crypto.randomUUID(),token:[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join(''),fingerprint,lines};
    // Save before any server write; a timeout must reuse the same payment order.
    try{saveSession(session)}catch{throw new Error('Please allow browser storage to continue securely.')}
  }return session;
}
async function showPaid(result,session){
  if(result.status!=='paid')return false;
  // Verification and a reopened status view may finish together. Display and
  // consume each session once, even if those requests hold separate copies.
  if(lastPaidSessionId===session.sessionId)return true;
  const saved=readSession();
  if(saved?.sessionId===session.sessionId&&saved.cartConsumed)session.cartConsumed=true;
  document.querySelector('#checkout-modal').classList.remove('payment-confirming');
  document.querySelector('#checkout-confirming').hidden=true;
  if(!session.cartConsumed){
    if(!paidCartUpdates.has(session.sessionId))paidCartUpdates.set(session.sessionId,Promise.resolve().then(()=>checkout.consumeCart(session.lines,session.sessionId)).catch(error=>{paidCartUpdates.delete(session.sessionId);throw error}));
    await paidCartUpdates.get(session.sessionId);session.cartConsumed=true;
    if(readSession()?.sessionId===session.sessionId)saveSession(session);
  }
  if(lastPaidSessionId===session.sessionId)return true;
  lastPaidSessionId=session.sessionId;confirmed=true;busy=false;showModal();checkoutForm.hidden=true;document.querySelector('#payment-reference').textContent=result.reference+' · '+result.paymentId;
  document.querySelector('#checkout-modal').classList.add('payment-confirmed');document.querySelector('#checkout-modal').setAttribute('aria-labelledby','checkout-success-title');
  document.querySelector('#checkout-success h3').textContent=result.mode==='test'?'Test payment received':'Payment received';
  document.querySelector('#checkout-success p').textContent=result.mode==='test'?'This was a test payment. Your test order has been recorded.':'Thank you! Your payment is confirmed and your order has been recorded. Please save the reference below.';
  document.querySelector('#checkout-success').hidden=false;
  // Display state only: this flag is never accepted as proof of payment.
  history.replaceState(null,'','/?payment=true');document.querySelector('#checkout-done').focus();return true;
}
function paymentLinkControls(result,session){
  const resume=document.querySelector('#payment-resume'),cancel=document.querySelector('#payment-cancel');
  if(!resume||!cancel)return;
  resume.hidden=true;cancel.hidden=true;
  if(session.paymentMethod!=='payment_link'||result.status!=='pending')return;
  let safe=false;try{const u=new URL(result.paymentUrl);safe=u.protocol==='https:'&&!u.username&&!u.password&&['rzp.io','rzp.io.in','razorpay.com'].includes(u.hostname)}catch{}
  if(safe){resume.href=result.paymentUrl;resume.hidden=false;cancel.hidden=false;}
}
async function checkPayment(session){
  let result;
  try{result=await jsonPost('/api/checkout/status',identity(session));}
  catch(error){
    if(error.status!==404||session.paymentMethod!=='payment_link')throw error;
    if(readSession()?.sessionId!==session.sessionId)return true;
    clearSession(session.sessionId);
    busy=false;closeCheckout();openCheckout();setStatus('The earlier checkout was not created. Please review your total and try again.');return true;
  }
  if(readSession()?.sessionId!==session.sessionId)return true;
  if(await showPaid(result,session))return true;
  if(['cancelled','expired','failed'].includes(result.status)){
    clearSession(session.sessionId);
    busy=false;closeCheckout();openCheckout();setStatus('The earlier payment link is '+result.status+'. Review your total before starting a new payment.');return true;
  }
  paymentLinkControls(result,session);return false;
}
let confirmationCheck=null,confirmationSessionId=null;
function confirmingView(message='Please wait while we verify your payment and record your order.'){
  busy=true;showModal();checkoutForm.hidden=true;setStatus('');
  document.querySelector('#checkout-modal').classList.add('payment-confirming');document.querySelector('#checkout-modal').setAttribute('aria-labelledby','confirmation-title');
  document.querySelector('#checkout-success').hidden=true;
  document.querySelector('#checkout-confirming').hidden=false;
  document.querySelector('#confirmation-progress').textContent=message;
  const resume=document.querySelector('#payment-resume'),cancel=document.querySelector('#payment-cancel');
  if(resume)resume.hidden=true;if(cancel)cancel.hidden=true;
}
async function waitForConfirmation(session){
  if(confirmationCheck&&confirmationSessionId===session.sessionId)return confirmationCheck;
  confirmationSessionId=session.sessionId;
  const pendingCheck=(async()=>{
    for(const delay of [0,1000,1500,2500,4000,6000]){
      await new Promise(resolve=>setTimeout(resolve,delay));
      if(readSession()?.sessionId!==session.sessionId)return false;
      try{if(await checkPayment(session))return true}catch{}
    }
    if(readSession()?.sessionId!==session.sessionId)return false;
    document.querySelector('#confirmation-progress').textContent=session.paymentMethod==='payment_link'?'Payment has not been confirmed yet. Resume your payment below, or cancel the link to change your bag. If you have paid, check again shortly.':'Your payment is still being checked. Please refresh shortly before trying another payment, or contact +91 99722 67897 with your payment reference.';
    return false;
  })();
  confirmationCheck=pendingCheck;
  try{return await pendingCheck}finally{if(confirmationCheck===pendingCheck){confirmationCheck=null;confirmationSessionId=null}}
}
checkoutForm.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!checkoutForm.reportValidity())return;
  if(!paymentConfig.ready)return setStatus('Online payment has not been enabled yet.','error');
  const lines=cartLines(),address=addressFromForm();let attemptedSessionId=null;busy=true;renderCheckoutSummary();setStatus('Preparing your secure payment…');
  try{
    const session=await prepareSession(lines,address);
    attemptedSessionId=session.sessionId;
    if(paymentConfig.paymentMethod==='payment_link'){session.paymentMethod='payment_link';session.requested=true;saveSession(session);}
    const expectedAmountPaise=paymentConfig.amountPaise??subtotalPaise()+paymentConfig.shippingPaise;
    const order=await jsonPost('/api/checkout/order',{...identity(session),lines,address,expectedAmountPaise});
    if(order.amountPaise!==expectedAmountPaise)throw new Error('The payment total changed. Please review your bag.');
    if(order.paymentMethod==='payment_link'){
      const u=new URL(order.paymentUrl);
      if(u.protocol!=='https:'||u.username||u.password||!['rzp.io','rzp.io.in','razorpay.com'].includes(u.hostname))throw new Error('The secure payment link is invalid.');
      session.paymentMethod='payment_link';session.confirming=true;saveSession(session);confirmingView('Opening your secure Razorpay payment link…');
      window.location.assign(u.href);return;
    }
    await loadRazorpayScript();
    const razorpay=new window.Razorpay({
      key:order.keyId,order_id:order.orderId,amount:order.amountPaise,currency:'INR',name:'Madikar Taila',description:'Madikar Taila order',
      prefill:{name:address.name,email:address.email,contact:'+91'+address.phone},theme:{color:'#123321'},
      config:{display:{
        blocks:{upi_only:{name:'Pay via UPI',instruments:[{method:'upi'}]}},
        sequence:['block.upi_only'],preferences:{show_default_blocks:false}
      }},
      modal:{ondismiss:async()=>{
        if(session.confirming||confirmed)return;setStatus('Checking payment status…');
        try{if(await checkPayment(session))return}catch{}
        busy=false;renderCheckoutSummary();setStatus('Payment window closed. You can reopen this checkout when ready.');
      }},
      handler:async payment=>{
        session.confirming=true;saveSession(session);confirmingView();
        try{
          const result=await jsonPost('/api/checkout/verify',{...identity(session),orderId:order.orderId,paymentId:payment.razorpay_payment_id,signature:payment.razorpay_signature});
          if(await showPaid(result,session))return;
        }catch{/* Status reconciliation uses the saved session, never a new payment. */}
        await waitForConfirmation(session);
      }
    });
    razorpay.on('payment.failed',response=>setStatus(response.error?.description||'Payment was not completed. You can retry in the payment window.','error'));
    razorpay.open();setStatus('Complete your payment in the secure Razorpay window.');
  }catch(error){
    if(attemptedSessionId&&/checkout expired|Payment link creation was rejected|Your checkout total changed/.test(error.message))clearSession(attemptedSessionId);
    busy=false;renderCheckoutSummary();setStatus(error.message,'error');
    if(/Your checkout total changed/.test(error.message))void loadPaymentConfig();
  }
});
async function restorePayment(){
  const session=readSession(),returning=new URLSearchParams(location.search).has('payment');
  if(returning)history.replaceState(null,'','/');
  if(!session){if(returning)history.replaceState(null,'','/');return}
  try{
    if(await checkPayment(session))return;
    if(session.confirming||session.paymentMethod==='payment_link'){confirmingView();renderCheckoutSummary();void waitForConfirmation(session)}
  }catch{if(session.confirming){confirmingView();renderCheckoutSummary();void waitForConfirmation(session)}}
  if(returning)history.replaceState(null,'','/');
}
document.querySelector('#checkout-open').addEventListener('click',openCheckout);
document.querySelector('#checkout-close').addEventListener('click',closeCheckout);
document.querySelector('#checkout-overlay').addEventListener('click',closeCheckout);
document.querySelector('#checkout-done').addEventListener('click',closeCheckout);
document.querySelector('#payment-check')?.addEventListener('click',()=>{const s=readSession();if(s){confirmingView();void waitForConfirmation(s)}});
document.querySelector('#payment-cancel')?.addEventListener('click',async()=>{
  const s=readSession();if(!s)return;
  const button=document.querySelector('#payment-cancel');button.disabled=true;
  try{
    const result=await jsonPost('/api/checkout/cancel',identity(s));
    if(readSession()?.sessionId!==s.sessionId)return;
    if(await showPaid(result,s))return;
    if(!['cancelled','expired','failed'].includes(result.status))throw new Error('Payment is still being checked. Try again shortly.');
    clearSession(s.sessionId);busy=false;closeCheckout();openCheckout();
  }catch(error){document.querySelector('#confirmation-progress').textContent=error.message}
  finally{button.disabled=false}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeCheckout()});
restorePayment();

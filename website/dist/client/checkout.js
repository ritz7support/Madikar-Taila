const checkout=window.MADIKAR_STORE;
const checkoutForm=document.querySelector('#shipping-form'),checkoutStatus=document.querySelector('#checkout-status'),payButton=document.querySelector('#razorpay-pay');
const sessionKey='madikar-checkout-session';
let paymentConfig={ready:false,shippingPaise:null},lastCheckoutFocus=null,busy=false,confirmed=false;
const inr=checkout.money;
const cartLines=()=>checkout.cartEntries().map(({key,qty})=>{const[id,variant]=key.split(':');return{id,variant:Number(variant),quantity:qty}});
const setStatus=(message,tone='note')=>{checkoutStatus.textContent=message;checkoutStatus.dataset.tone=tone;checkoutStatus.hidden=!message};
const addressFromForm=()=>{const data=new FormData(checkoutForm);return Object.fromEntries(['name','phone','email','line1','line2','city','state','postalCode','country'].map(key=>[key,String(data.get(key)||'').trim()]))};
const subtotalPaise=()=>checkout.cartEntries().reduce((sum,{qty,v})=>sum+Math.round(qty*v.price*100),0);
const readSession=()=>{try{return JSON.parse(sessionStorage.getItem(sessionKey)||'null')}catch{return null}};
const saveSession=session=>sessionStorage.setItem(sessionKey,JSON.stringify(session));
const identity=session=>({sessionId:session.sessionId,token:session.token});
function renderCheckoutSummary(){
  const subtotal=subtotalPaise();
  document.querySelector('#checkout-items-total').textContent=inr(subtotal/100);
  document.querySelector('#checkout-shipping').textContent=paymentConfig.ready?inr(paymentConfig.shippingPaise/100):'Confirmed by seller';
  document.querySelector('#checkout-grand-total').textContent=paymentConfig.ready?inr((subtotal+paymentConfig.shippingPaise)/100):'Pending';
  payButton.disabled=busy||!paymentConfig.ready||subtotal===0;
}
async function loadPaymentConfig(){
  try{
    const response=await fetch('/api/checkout/config',{headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error();const config=await response.json();
    paymentConfig={ready:config.ready===true&&Number.isInteger(config.shippingPaise),shippingPaise:config.shippingPaise};
  }catch{paymentConfig={ready:false,shippingPaise:null}}
  renderCheckoutSummary();
}
function showModal(){
  lastCheckoutFocus=document.activeElement;checkout.closeCart();document.querySelector('#checkout-overlay').hidden=false;
  document.querySelector('#checkout-modal').classList.add('open');document.querySelector('#checkout-modal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
}
function openCheckout(){
  if(!checkout.cartEntries().length)return;
  document.querySelector('#checkout-modal').classList.remove('payment-confirmed');document.querySelector('#checkout-modal').setAttribute('aria-labelledby','checkout-title');
  showModal();checkoutForm.hidden=false;document.querySelector('#checkout-success').hidden=true;setStatus('');renderCheckoutSummary();loadPaymentConfig();checkoutForm.elements.name.focus();
}
function closeCheckout(){
  if(confirmed){sessionStorage.removeItem(sessionKey);window.location.assign('/');return}
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
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'The checkout request could not be completed.');return data;
}
async function prepareSession(lines,address){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({lines,address})));
  const fingerprint=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');let session=readSession();
  if(session?.confirming)throw new Error('Your earlier payment is being confirmed. Please refresh to check it before paying again.');
  if(!session||session.fingerprint!==fingerprint){
    session={sessionId:crypto.randomUUID(),token:[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join(''),fingerprint,lines};
    // Save before any server write; a timeout must reuse the same payment order.
    try{saveSession(session)}catch{throw new Error('Please allow session storage in your browser to continue securely.')}
  }return session;
}
function showPaid(result,session){
  if(result.status!=='paid')return false;
  if(!session.cartConsumed){checkout.consumeCart(session.lines);session.cartConsumed=true;saveSession(session)}
  confirmed=true;busy=false;showModal();checkoutForm.hidden=true;document.querySelector('#payment-reference').textContent=result.reference+' · '+result.paymentId;
  document.querySelector('#checkout-modal').classList.add('payment-confirmed');document.querySelector('#checkout-modal').setAttribute('aria-labelledby','checkout-success-title');
  document.querySelector('#checkout-success h3').textContent=result.mode==='test'?'Test payment received':'Payment received';
  document.querySelector('#checkout-success p').textContent=result.mode==='test'?'This was a test payment. Your test order has been recorded.':'Thank you! Your payment is confirmed and your order has been recorded. Please save the reference below.';
  document.querySelector('#checkout-success').hidden=false;
  // Display state only: this flag is never accepted as proof of payment.
  history.replaceState(null,'','/?payment=true');document.querySelector('#checkout-done').focus();return true;
}
async function checkPayment(session){return showPaid(await jsonPost('/api/checkout/status',identity(session)),session)}
checkoutForm.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!checkoutForm.reportValidity())return;
  if(!paymentConfig.ready)return setStatus('Online payment has not been enabled yet.','error');
  const lines=cartLines(),address=addressFromForm();busy=true;renderCheckoutSummary();setStatus('Preparing your secure payment…');
  try{
    const session=await prepareSession(lines,address),order=await jsonPost('/api/checkout/order',{...identity(session),lines,address});
    if(order.amountPaise!==subtotalPaise()+paymentConfig.shippingPaise)throw new Error('The payment total changed. Please review your bag.');
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
        session.confirming=true;saveSession(session);setStatus('Confirming your payment…');
        try{
          const result=await jsonPost('/api/checkout/verify',{...identity(session),orderId:order.orderId,paymentId:payment.razorpay_payment_id,signature:payment.razorpay_signature});
          if(showPaid(result,session))return;
          setStatus('Your payment is being confirmed. Please refresh to check its status before paying again.','error');
        }catch{setStatus('Payment confirmation is pending. Please refresh to check its status. Payment reference: '+payment.razorpay_payment_id,'error')}
      }
    });
    razorpay.on('payment.failed',response=>setStatus(response.error?.description||'Payment was not completed. You can retry in the payment window.','error'));
    razorpay.open();setStatus('Complete your payment in the secure Razorpay window.');
  }catch(error){if(/checkout expired/.test(error.message))sessionStorage.removeItem(sessionKey);busy=false;renderCheckoutSummary();setStatus(error.message,'error')}
});
async function restorePayment(){
  const session=readSession(),returning=new URLSearchParams(location.search).has('payment');
  if(!session){if(returning)history.replaceState(null,'','/');return}
  try{
    if(await checkPayment(session))return;
    if(session.confirming){showModal();busy=true;renderCheckoutSummary();setStatus('Payment confirmation is pending. Please refresh again shortly, or contact +91 99722 67897 with your payment reference.','error')}
  }catch{if(session.confirming){showModal();busy=true;renderCheckoutSummary();setStatus('Payment confirmation could not be checked. Please refresh before trying another payment.','error')}}
  if(returning)history.replaceState(null,'','/');
}
document.querySelector('#checkout-open').addEventListener('click',openCheckout);
document.querySelector('#checkout-close').addEventListener('click',closeCheckout);
document.querySelector('#checkout-overlay').addEventListener('click',closeCheckout);
document.querySelector('#checkout-done').addEventListener('click',closeCheckout);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeCheckout()});
restorePayment();

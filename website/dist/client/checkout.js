const checkout = window.MADIKAR_STORE;
const checkoutForm = document.querySelector('#shipping-form');
const checkoutStatus = document.querySelector('#checkout-status');
const payButton = document.querySelector('#razorpay-pay');
let paymentConfig = {ready:false, shippingPaise:null};
let lastCheckoutFocus = null;

const inr = checkout.money;
const cartLines = () => checkout.cartEntries().map(({key,qty}) => {
  const [id,variant] = key.split(':');
  return {id,variant:Number(variant),quantity:qty};
});
const setStatus = (message, tone='note') => {
  checkoutStatus.textContent = message;
  checkoutStatus.dataset.tone = tone;
};
const addressFromForm = () => {
  const data = new FormData(checkoutForm);
  return Object.fromEntries(['name','phone','email','line1','line2','city','state','postalCode']
    .map(key => [key, String(data.get(key) || '').trim()]));
};
const subtotalPaise = () => checkout.cartEntries().reduce((sum,{qty,v}) => sum + qty*v.price*100,0);

function renderCheckoutSummary(){
  const subtotal = subtotalPaise();
  document.querySelector('#checkout-items-total').textContent = inr(subtotal/100);
  document.querySelector('#checkout-shipping').textContent = paymentConfig.ready ? inr(paymentConfig.shippingPaise/100) : 'Confirmed by seller';
  document.querySelector('#checkout-grand-total').textContent = paymentConfig.ready ? inr((subtotal+paymentConfig.shippingPaise)/100) : 'Pending';
  payButton.disabled = !paymentConfig.ready || subtotal === 0;
}

async function loadPaymentConfig(){
  let serviceAvailable = false;
  try {
    const response = await fetch('/api/checkout/config',{headers:{Accept:'application/json'},cache:'no-store'});
    if (!response.ok) throw new Error('Checkout configuration unavailable');
    const config = await response.json();
    serviceAvailable = true;
    paymentConfig = {ready:config.ready === true, shippingPaise:Number.isInteger(config.shippingPaise) ? config.shippingPaise : null};
  } catch {
    paymentConfig = {ready:false, shippingPaise:null};
  }
  renderCheckoutSummary();
  setStatus(paymentConfig.ready
    ? 'Your total includes shipping. Payment is handled securely by Razorpay.'
    : serviceAvailable
      ? 'Online payment setup is pending. You can send your order and shipping address to Madikar Taila on WhatsApp.'
      : 'Online checkout is temporarily unavailable. You can send your order and shipping address to Madikar Taila on WhatsApp.');
}

function openCheckout(){
  if (!checkout.cartEntries().length) return;
  lastCheckoutFocus = document.activeElement;
  checkout.closeCart();
  document.querySelector('#checkout-overlay').hidden = false;
  document.querySelector('#checkout-modal').classList.add('open');
  document.querySelector('#checkout-modal').setAttribute('aria-hidden','false');
  document.body.style.overflow = 'hidden';
  checkoutForm.hidden = false;
  document.querySelector('#checkout-success').hidden = true;
  renderCheckoutSummary();
  loadPaymentConfig();
  checkoutForm.elements.name.focus();
}
function closeCheckout(){
  document.querySelector('#checkout-overlay').hidden = true;
  document.querySelector('#checkout-modal').classList.remove('open');
  document.querySelector('#checkout-modal').setAttribute('aria-hidden','true');
  document.body.style.overflow = '';
  if (lastCheckoutFocus?.isConnected) lastCheckoutFocus.focus();
}

let razorpayScriptPromise;
function loadRazorpayScript(){
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) razorpayScriptPromise = new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => {razorpayScriptPromise = null;reject(new Error('Razorpay checkout could not load'))};
    document.head.appendChild(script);
  });
  return razorpayScriptPromise;
}

async function jsonPost(url,body){
  const response = await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The checkout request could not be completed.');
  return data;
}

checkoutForm.addEventListener('submit',async event => {
  event.preventDefault();
  if (!checkoutForm.reportValidity()) return;
  if (!paymentConfig.ready) return setStatus('Online payment has not been enabled yet. Please use the WhatsApp order option.','error');
  const lines = cartLines(), address = addressFromForm();
  payButton.disabled = true;
  setStatus('Preparing your secure payment…');
  try {
    const order = await jsonPost('/api/checkout/order',{lines,address});
    if (order.amountPaise !== subtotalPaise()+paymentConfig.shippingPaise) throw new Error('The payment total changed. Please review your bag.');
    await loadRazorpayScript();
    const razorpay = new window.Razorpay({
      key:order.keyId, order_id:order.orderId, amount:order.amountPaise, currency:'INR',
      name:'Madikar Taila', description:'Order from the Madikar Taila collection',
      prefill:{name:address.name,email:address.email,contact:`+91${address.phone}`},
      theme:{color:'#123321'},
      modal:{ondismiss:() => {renderCheckoutSummary();setStatus('Payment window closed. You can try again when ready.')}},
      handler:async payment => {
        setStatus('Confirming your payment…');
        try {
          const verified = await jsonPost('/api/checkout/verify',{
            orderId:order.orderId,
            paymentId:payment.razorpay_payment_id,
            signature:payment.razorpay_signature
          });
          if (verified.status !== 'paid') {
            setStatus('Your payment is being confirmed. Please contact Madikar Taila with your payment reference before trying again.','error');
            return;
          }
          checkout.clearCart();
          checkoutForm.hidden = true;
          document.querySelector('#payment-reference').textContent = payment.razorpay_payment_id;
          document.querySelector('#checkout-success').hidden = false;
          document.querySelector('#checkout-done').focus();
        } catch (error) {
          setStatus(`Payment confirmation is pending. Reference: ${payment.razorpay_payment_id}. ${error.message}`,'error');
        }
      }
    });
    razorpay.on('payment.failed',response => {
      setStatus(response.error?.description || 'Payment was not completed. Please try again.','error');
      payButton.disabled = false;
    });
    razorpay.open();
    setStatus('Complete your payment in the secure Razorpay window.');
  } catch (error) {
    setStatus(error.message,'error');
    payButton.disabled = !paymentConfig.ready;
  }
});

const whatsappButton = document.querySelector('#whatsapp-order');
whatsappButton.addEventListener('click',async () => {
  if (!checkoutForm.reportValidity()) return;
  const entries = checkout.cartEntries();
  if (!entries.length) return;
  const popup = window.open('about:blank','_blank');
  if (popup) popup.opener = null;
  whatsappButton.disabled = true;
  setStatus('Preparing your WhatsApp message…');
  const a = addressFromForm();
  try {
    const stored = await jsonPost('/api/checkout/whatsapp',{lines:cartLines(),address:a});
    const items = entries.map(({p,v,qty}) => `• ${p.name} (${v.size}) × ${qty} — ${inr(qty*v.price)}`).join('\n');
    const address = [a.line1,a.line2,`${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).join(', ');
    const referenceLine=stored.reference ? `Order reference: ${stored.reference}\n\n` : '';
    const message = `Hello Madikar Taila, I would like to order:\n\n${referenceLine}${items}\n\nEstimated item subtotal: ${inr(stored.subtotalPaise/100)}\nShipping address: ${a.name}, ${address}, India\nMobile: +91${a.phone}${a.email ? `\nEmail: ${a.email}` : ''}\n\nPlease confirm availability, shipping charge and final total.`;
    const url = 'https://wa.me/919972267897?text='+encodeURIComponent(message);
    if (popup) popup.location.href = url;
    else window.location.href = url;
    setStatus(stored.reference ? `Order ${stored.reference} saved. Send the prepared WhatsApp message to Madikar Taila.` : 'WhatsApp message prepared. Send it to Madikar Taila to place your order.');
  } catch (error) {
    if (popup) popup.close();
    setStatus(error.message || 'Your WhatsApp message could not be prepared. Please try again.','error');
  } finally {
    whatsappButton.disabled = false;
  }
});
document.querySelector('#checkout-open').addEventListener('click',openCheckout);
document.querySelector('#checkout-close').addEventListener('click',closeCheckout);
document.querySelector('#checkout-overlay').addEventListener('click',closeCheckout);
document.querySelector('#checkout-done').addEventListener('click',closeCheckout);
document.addEventListener('keydown',event => {if(event.key === 'Escape') closeCheckout()});

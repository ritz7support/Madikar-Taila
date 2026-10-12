const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const money = value => '₹' + Number(value || 0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});
const state = {config:null,token:null,products:[],orders:[],ordersPage:0,hasMore:false,orderLoading:false,ordersLoaded:false,shipment:null,selectedId:null,editing:null};
const accessStorageKey = 'madikar-admin-access';
const validToken = value => /^[A-Za-z0-9_-]{43}$/.test(value || '');
const setStatus = (message,tone='note',target='#dashboard-status') => {
  const node=$(target); node.textContent=message; node.dataset.tone=tone;
};
function saveToken(token){state.token=token;sessionStorage.setItem(accessStorageKey,token)}
function clearToken(){state.token=null;sessionStorage.removeItem(accessStorageKey)}
async function adminApi(action,body={}){
  if(!validToken(state.token))throw new Error('Enter a valid team access code.');
  const response=await fetch('/api/admin',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+state.token},
    body:JSON.stringify({action,...body})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(data.error || 'The dashboard request failed.'),{status:response.status});
  return data;
}
function showDashboard(label){
  $('#login-panel').hidden=true;$('#dashboard').hidden=false;$('#sign-out').hidden=false;$('#copy-admin-link').hidden=false;
  $('#signed-in-email').textContent=label || 'Team access';
}
function showLogin(message=''){
  $('#login-panel').hidden=false;$('#dashboard').hidden=true;$('#sign-out').hidden=true;$('#copy-admin-link').hidden=true;
  $('#signed-in-email').textContent='';
  if(message) setStatus(message,'error','#login-status');
}
async function enterDashboard(){
  const identity=await adminApi('admin_me');
  showDashboard(identity.label);
  await loadProducts();
}
async function loadProducts(selectedId=state.selectedId){
  const data=await adminApi('admin_catalog');
  state.products=data.products || [];
  $('#product-count').textContent=state.products.length;
  state.selectedId=selectedId && state.products.some(p=>String(p.id)===String(selectedId)) ? selectedId : null;
  renderProductList();
  if(state.selectedId) selectProduct(state.selectedId);
}
function imageUrl(url){
  if(/^assets\/[A-Za-z0-9_.-]+$/.test(url || '')) return url;
  try {
    const parsed=new URL(url);
    if(parsed.origin===state.config.url && parsed.pathname.startsWith('/storage/v1/object/public/madikar-product-images/')) return parsed.href;
  } catch {}
  return 'assets/brand-stamp.svg';
}
function renderProductList(){
  const query=$('#product-search').value.trim().toLowerCase();
  const list=state.products.filter(p=>(p.display_name+' '+p.category).toLowerCase().includes(query));
  $('#product-list').innerHTML=list.length?list.map(p=>{
    const lowest=p.variants.length?Math.min(...p.variants.map(v=>Number(v.price))):null;
    return `<button type="button" class="product-row ${String(state.selectedId)===String(p.id)?'selected':''}" data-product-id="${p.id}"><img src="${escapeHtml(imageUrl(p.images?.[0]?.url))}" alt=""><span><strong>${escapeHtml(p.display_name)}</strong><small>${escapeHtml(p.category)} · ${lowest===null?'No pack':money(lowest)} · ${p.store_active?'Listed':'Hidden'}</small></span></button>`;
  }).join(''):'<p class="empty">No matching products.</p>';
}
function selectProduct(id){
  const product=state.products.find(p=>String(p.id)===String(id));
  if(!product)return;
  state.selectedId=product.id;
  state.editing={...product,images:(product.images || []).map(x=>({...x})),
    variants:(product.variants || []).map(x=>({...x}))};
  renderProductList();renderEditor();
}
function editorValues(){
  const editor=$('#product-editor');
  const images=[...editor.querySelectorAll('.image-row')].map(row=>({
    url:row.querySelector('[data-image-url]').value.trim(),
    alt:row.querySelector('[data-image-alt]').value.trim(),
    kind:row.dataset.imageKind === 'illustration' ? 'illustration' : 'product_photo'
  })).filter(image=>image.url);
  return {name:editor.querySelector('#edit-name')?.value.trim() || '',
    category:editor.querySelector('#edit-category')?.value.trim() || '',
    description:editor.querySelector('#edit-description')?.value.trim() || '',
    active:Boolean(editor.querySelector('#edit-active')?.checked),images};
}
function rememberEditor(){
  if(!state.editing)return;
  const values=editorValues();
  Object.assign(state.editing,values,{store_name:values.name,short_description:values.description,store_active:values.active});
}
function renderEditor(){
  const p=state.editing;
  if(!p){$('#product-editor').innerHTML='<p class="empty">Select a product to edit it.</p>';return}
  const images=(p.images || []).map((image,index)=>`<div class="image-row" data-image-index="${index}" data-image-kind="${image.kind==='illustration'?'illustration':'product_photo'}">
    <img src="${escapeHtml(imageUrl(image.url))}" alt="">
    <label class="url-field">Image URL<input data-image-url type="url" value="${escapeHtml(image.url)}" placeholder="Supabase image URL or assets/name.jpg"></label>
    <label>Alt text<input data-image-alt value="${escapeHtml(image.alt || '')}" maxlength="160"></label>
    <div><button type="button" data-remove-image="${index}">Remove</button></div>
  </div>`).join('');
  const packs=(p.variants || []).map(v=>`<tr data-variant-id="${v.id}">
    <td><input data-size value="${escapeHtml(v.size)}" maxlength="40" aria-label="Pack size"></td>
    <td><input data-price type="number" min="1" max="100000" step=".01" value="${escapeHtml(v.price)}" aria-label="Price in rupees"></td>
    <td><input data-stock type="number" min="0" step="1" value="${v.inventory_quantity ?? ''}" placeholder="Unknown" aria-label="Units in stock"></td>
    <td><input data-shipping-weight type="number" min="1" max="2147483647" step="1" value="${escapeHtml(v.shipping_weight_grams ?? '')}" placeholder="Unknown" aria-label="Shipping weight in grams"></td>
    <td><select data-availability aria-label="Availability"><option value="available" ${v.availability_status==='available'?'selected':''}>Available</option><option value="unavailable" ${v.availability_status!=='available'?'selected':''}>Unavailable</option></select></td>
    <td><button type="button" data-save-variant="${v.id}">Save</button></td>
  </tr>`).join('');
  $('#product-editor').innerHTML=`<div class="editor-header"><div><p>${p.meta_linked?'Meta-linked record · store fields only':'Madikar store product'}</p><h2>${p.id?escapeHtml(p.display_name || p.name):'New product'}</h2></div><span class="pill ${p.store_active?'':'off'}">${p.store_active?'Listed':'Hidden'}</span></div>
    <div class="editor-grid"><div class="field"><label for="edit-name">Store name</label><input id="edit-name" maxlength="120" value="${escapeHtml(p.store_name || p.display_name || p.name || '')}"></div>
    <div class="field"><label for="edit-category">Category</label><input id="edit-category" list="store-categories" maxlength="60" value="${escapeHtml(p.category || '')}"><datalist id="store-categories">${[...new Set(state.products.map(x=>x.category))].map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist></div>
    <div class="field wide"><label for="edit-description">Description</label><textarea id="edit-description" maxlength="1000">${escapeHtml(p.short_description || p.description || '')}</textarea></div>
    <div class="field wide"><label><input id="edit-active" type="checkbox" ${p.store_active || p.active?'checked':''} style="width:auto;margin-right:.4rem">Listed on the store</label><small>New products stay hidden until a photo and at least one pack are added.</small></div></div>
    <div class="form-actions"><button type="button" class="primary" id="save-product">${p.id?'Save product details':'Create hidden draft'}</button><span class="help">Pack details are saved separately below.</span></div>
    <h3>Product photos</h3><p class="help">The first image appears in the store. Use Upload photo for a new product image; up to six images per product.</p>
    <div id="image-list">${images || '<p class="empty">No images yet.</p>'}</div>
    <div class="image-actions"><button type="button" id="add-image-url">Add image URL</button><input id="image-upload" class="upload-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose product photo"><button type="button" id="upload-image" ${p.id?'':'disabled'}>Upload photo</button></div>
    <h3>Packs, pricing & weight</h3><p class="help">Save each pack after editing. Leave stock blank when unknown. “Unavailable” prevents new orders for that pack.</p>
    <p class="help">Shipping weight is for one pack in whole grams, including its bottle, jar or wrapper. Exclude the outer delivery box. Leave blank if unknown. Saving weights does not change shipping charges yet.</p>
    <div class="pack-table-scroll"><table class="pack-table"><thead><tr><th>Size</th><th>Price</th><th>Stock</th><th>Shipping weight (g)</th><th>Availability</th><th></th></tr></thead><tbody>${packs || '<tr><td colspan="6">No pack sizes yet.</td></tr>'}</tbody></table></div>
    <div class="new-pack"><h4>Add a pack</h4><p class="help">Create another size for this product.</p><div class="new-pack-fields"><label>Pack size<input id="new-size" placeholder="e.g. 500 ml" aria-label="New pack size"></label><label>Price (₹)<input id="new-price" type="number" min="1" step=".01" placeholder="0.00" aria-label="New pack price"></label><label>Stock<input id="new-stock" type="number" min="0" step="1" placeholder="Unknown" aria-label="New pack stock"></label><label>Weight (g)<input id="new-shipping-weight" type="number" min="1" max="2147483647" step="1" placeholder="Unknown" aria-label="New pack shipping weight in grams"></label><label>Availability<select id="new-availability" aria-label="New pack availability"><option value="unavailable">Unavailable</option><option value="available">Available</option></select></label><button type="button" id="add-pack" ${p.id?'':'disabled'}>Add pack</button></div></div>`;
}
async function saveProduct(){
  const values=editorValues();
  const action=state.editing.id?'admin_save_product':'admin_add_product';
  try{
    const result=await adminApi(action,{...values,...(state.editing.id?{id:state.editing.id}:{})});
    setStatus(action==='admin_add_product'?'Hidden product draft created. Add a pack and image, then list it.':'Product saved.','success');
    await loadProducts(result.product.id);
  }catch(error){setStatus(error.message,'error')}
}
async function saveVariant(row,adding=false){
  if(!state.editing?.id)return setStatus('Create the product draft first.','error');
  const weightInput=adding?$('#new-shipping-weight'):row.querySelector('[data-shipping-weight]');
  if(!weightInput.reportValidity())return;
  const pending=editorValues();
  const fields=adding?{size:$('#new-size').value,price:$('#new-price').value,
      inventoryQuantity:$('#new-stock').value,availabilityStatus:$('#new-availability').value,productId:state.editing.id}
    :{size:row.querySelector('[data-size]').value,price:row.querySelector('[data-price]').value,
      inventoryQuantity:row.querySelector('[data-stock]').value,availabilityStatus:row.querySelector('[data-availability]').value,
      id:row.dataset.variantId};
  fields.shippingWeightGrams=weightInput.value;
  try{
    const productId=state.editing.id;
    await adminApi('admin_save_variant',fields);
    await loadProducts(productId);
    Object.assign(state.editing,{store_name:pending.name,short_description:pending.description,
      category:pending.category,images:pending.images,store_active:pending.active});
    renderEditor();
    setStatus(adding?'Pack added.':'Pack saved.','success');
  }
  catch(error){setStatus(error.message,'error')}
}
async function uploadImage(){
  if(!state.editing?.id)return setStatus('Create the product draft first.','error');
  const file=$('#image-upload').files?.[0];
  if(!file)return setStatus('Choose an image first.','error');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>1500000)return setStatus('Use a JPG, PNG or WebP image under 1.5 MB.','error');
  rememberEditor();
  setStatus('Uploading photo…');
  try{
    const base64=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);
      reader.onerror=()=>reject(new Error('Could not read the image'));reader.readAsDataURL(file);
    });
    const result=await adminApi('admin_upload_image',{productId:state.editing.id,mime:file.type,base64});
    state.editing.images.push({url:result.url,alt:state.editing.name+' product photo',kind:'product_photo'});
    renderEditor();setStatus('Photo uploaded. Save the product to display it.','success');
  }catch(error){setStatus(error.message,'error')}
}
function orderAddress(order){
  const a=order.shipping_address || order.address;
  if(!a)return '';
  return [a.line1 || a.address_line_1,a.line2 || a.address_line_2,a.city,a.state,a.postalCode || a.pincode].filter(Boolean).join(', ');
}
function deliveryEstimate(order){
  const days=order.estimated_delivery_days;
  return Number.isInteger(days)&&days>0?`Estimated delivery: within ${days} ${days===1?'day':'days'} of dispatch`:'';
}
function shipmentMessage(order){
  const note=order.shipment_notification;
  if(!note){
    return order.fulfillment_status==='shipped'&&!order.estimated_delivery_days?
      '<p>Add a delivery estimate to send the shipping message.</p><button type="button" data-edit-shipment="'+order.id+'">Shipment details</button>':'';
  }
  const status=note.status;
  const messages={pending:'Shipping message queued.',sending:'Sending shipping message…',sent:'Shipping message accepted by WhatsApp.',
    failed:[132001,132015,132016].includes(note.error_code)?'The WhatsApp template is not ready. Retry after approval.':'The shipping message could not be sent.',
    uncertain:'Shipping message needs review before retrying.',cancelled:'Shipping message cancelled because the order status changed.'};
  const retry=['failed','cancelled'].includes(status)&&order.fulfillment_status==='shipped'&&note.attempts<8;
  const check=['pending','sending'].includes(status);
  return `<p>${escapeHtml(messages[status] || 'Shipping message status unavailable.')}</p>${retry?`<button type="button" data-retry-shipment="${order.id}">Retry shipping message</button>`:''}${check?`<button type="button" data-check-shipment="${order.id}">Check message status</button>`:''}`;
}
function renderShipmentMessage(order){$(`#shipment-message-${order.id}`).innerHTML=shipmentMessage(order)}
function renderOrders(){
  $('#orders-loading').hidden=!state.orderLoading;
  $('#orders-list').setAttribute('aria-busy',String(state.orderLoading));
  $('#orders-list').innerHTML=state.orders.length?state.orders.map(o=>{
    const customer=o.customer_name || o.profile?.name || o.whatsapp_user_id || 'Customer';
    const phone=o.customer_phone || o.address?.phone || o.whatsapp_user_id || '';
    const date=new Date(o.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
    const items=(o.items || []).map(i=>`<li>${escapeHtml(i.product_name || i.product_retailer_id)}${i.variant_size?' · '+escapeHtml(i.variant_size):''} × ${i.quantity} — ${money(i.unit_price*i.quantity)}</li>`).join('');
    const paymentRows=o.payments || [];
    const paidPayment=paymentRows.find(p=>p.status==='paid');
    const payment=paidPayment || paymentRows[0];
    const paymentLabel=payment?.status || (o.status==='pending_payment'?'Awaiting payment':['paid','processing'].includes(o.status)?'Paid':'No payment recorded');
    const payments=escapeHtml(paymentLabel).replaceAll('_',' ') + (payment?.provider_payment_id?' · '+escapeHtml(payment.provider_payment_id):'');
    const paid=o.status!=='pending_payment';
    const stage=['processing','shipped','completed','cancelled'].includes(o.fulfillment_status)?o.fulfillment_status:'processing';
    const statusControl=`<label class="visually-hidden" for="order-stage-${o.id}">Order status for ${escapeHtml(o.reference_id)}</label><select id="order-stage-${o.id}" data-order-stage="${o.id}" aria-label="Order status for ${escapeHtml(o.reference_id)}" ${paid?'':'disabled'}>${[['processing','Processing'],['shipped','Shipped'],['completed','Completed'],['cancelled','Cancelled']].map(([value,label])=>`<option value="${value}" ${stage===value?'selected':''}>${label}</option>`).join('')}</select>${paid?'':'<small class="pending-payment">Awaiting payment</small>'}`;
    return `<details class="order-card"><summary><span><strong>${escapeHtml(o.reference_id)}</strong><small>${escapeHtml(date)}</small></span><span>${escapeHtml(customer)}</span><span><span class="pill ${o.source==='store'?'pill--store':'pill--whatsapp'}">${o.source==='store'?'Website':'WhatsApp'}</span></span><span class="order-stage">${statusControl}</span><strong>${money(o.total)}</strong></summary>
      <div class="order-detail"><div><h3>Items</h3><ul>${items || '<li>No line items</li>'}</ul><p>Subtotal ${money(o.subtotal)} · Shipping ${money(o.shipping)}</p></div>
      <div><h3>Customer & delivery</h3><p>${escapeHtml(customer)}${phone?' · '+escapeHtml(phone):''}</p><p>${escapeHtml(o.customer_email || o.profile?.email || '')}</p><p>${escapeHtml(orderAddress(o))}</p><p>Payment: ${payments}</p><p id="order-tracking-${o.id}">${o.tracking_id?'Tracking ID: '+escapeHtml(o.tracking_id):''}</p><p id="order-delivery-${o.id}">${deliveryEstimate(o)}</p><div class="shipment-message" id="shipment-message-${o.id}">${shipmentMessage(o)}</div></div></div></details>`;
  }).join(''):state.orderLoading?'':'<p class="panel empty">No orders in this view.</p>';
  $('#orders-page-label').textContent=`Page ${state.ordersPage+1} · up to 20 orders`;
  $('#previous-orders').disabled=state.orderLoading||state.ordersPage===0;
  $('#next-orders').disabled=state.orderLoading||!state.hasMore;
  $('#order-source').disabled=state.orderLoading;
  $('#refresh-orders').disabled=state.orderLoading;
}
async function loadOrders(page=0){
  if(state.orderLoading)return;
  state.orderLoading=true;
  renderOrders();
  try{
    const data=await adminApi('admin_orders',{page,source:$('#order-source').value});
    state.orders=data.orders || [];state.ordersPage=page;state.hasMore=Boolean(data.hasMore);state.ordersLoaded=true;
    setStatus(`${state.orders.length} orders on page ${page+1}.`,'success');
  }catch(error){setStatus(error.message,'error')}
  finally{state.orderLoading=false;renderOrders()}
}

$('#access-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const token=$('#access-code').value.trim();
  if(!validToken(token))return setStatus('The team access code should be 43 characters.','error','#login-status');
  saveToken(token);
  try{await enterDashboard();$('#access-code').value=''}
  catch(error){if(error.status===403)clearToken();showLogin(error.message)}
});
$('#copy-admin-link').addEventListener('click',async()=>{
  try{
    await navigator.clipboard.writeText(location.origin+'/admin.html#access='+state.token);
    setStatus('Team link copied. Share it only with people who should edit the store.','success');
  }catch{setStatus('Could not copy the link. Copy it from the address bar or try again.','error')}
});
$('#sign-out').addEventListener('click',()=>{
  clearToken();showLogin();setStatus('Left the dashboard on this browser.','success','#login-status');
});
$('.tabs').addEventListener('click',event=>{
  const button=event.target.closest('[data-tab]');if(!button)return;
  const tab=button.dataset.tab;
  for(const item of document.querySelectorAll('[data-tab]')){item.classList.toggle('selected',item===button);item.removeAttribute('aria-current')}
  button.setAttribute('aria-current','page');
  $('#products-panel').hidden=tab!=='products';$('#orders-panel').hidden=tab!=='orders';
  if(tab==='orders'&&!state.ordersLoaded)loadOrders(0);
});
$('#product-search').addEventListener('input',renderProductList);
$('#product-list').addEventListener('click',event=>{
  const row=event.target.closest('[data-product-id]');if(row)selectProduct(row.dataset.productId);
});
$('#add-product').addEventListener('click',()=>{
  state.selectedId=null;renderProductList();
  state.editing={id:null,name:'',category:'',short_description:'',images:[],variants:[],store_active:false,meta_linked:false};
  renderEditor();
});
$('#product-editor').addEventListener('click',event=>{
  const target=event.target;
  if(target.id==='save-product')saveProduct();
  if(target.id==='add-image-url'){rememberEditor();state.editing.images.push({url:'',alt:'',kind:'product_photo'});renderEditor()}
  if(target.dataset.removeImage!==undefined){rememberEditor();state.editing.images.splice(Number(target.dataset.removeImage),1);renderEditor()}
  if(target.id==='upload-image')uploadImage();
  if(target.dataset.saveVariant)saveVariant(target.closest('tr'));
  if(target.id==='add-pack')saveVariant(null,true);
});
$('#refresh-orders').addEventListener('click',()=>loadOrders(state.ordersPage));
$('#previous-orders').addEventListener('click',()=>loadOrders(state.ordersPage-1));
$('#next-orders').addEventListener('click',()=>loadOrders(state.ordersPage+1));
$('#order-source').addEventListener('change',()=>loadOrders(0));
$('#orders-list').addEventListener('click',event=>{
  if(event.target.closest('[data-order-stage]'))event.stopPropagation();
  const edit=event.target.closest('[data-edit-shipment]');
  if(edit){const order=state.orders.find(o=>String(o.id)===edit.dataset.editShipment);if(order)openShipmentDialog(order,$(`#order-stage-${order.id}`));return}
  const button=event.target.closest('[data-retry-shipment],[data-check-shipment]');
  if(button){
    const id=button.dataset.retryShipment || button.dataset.checkShipment;
    const order=state.orders.find(o=>String(o.id)===id);if(!order)return;
    button.disabled=true;
    adminApi(button.dataset.retryShipment?'admin_retry_shipment_notification':'admin_shipment_notification',{id:order.id})
      .then(data=>{order.shipment_notification=data.shipmentNotification;renderShipmentMessage(order)})
      .catch(error=>{setStatus(error.message,'error');button.disabled=false});
  }
});
function openShipmentDialog(order,select){
  state.shipment={order,select,saving:false};
  $('#shipping-order-reference').textContent=order.reference_id;
  $('#tracking-id').value=order.tracking_id || '';
  $('#delivery-days').value=order.estimated_delivery_days ?? '';
  $('#shipping-error').textContent='';
  $('#shipping-dialog').showModal();$('#tracking-id').focus();
}
async function updateOrderStage(order,select,stage,trackingId,estimatedDeliveryDays){
  const previous=order.fulfillment_status || 'processing';
  select.disabled=true;
  try{
    const data=await adminApi('admin_update_fulfillment',{id:order.id,status:stage,previousStatus:previous,...(stage==='shipped'?{trackingId,estimatedDeliveryDays}:{})});
    order.fulfillment_status=data.fulfillmentStatus;
    order.tracking_id=data.trackingId ?? order.tracking_id;
    if(Object.hasOwn(data,'estimatedDeliveryDays'))order.estimated_delivery_days=data.estimatedDeliveryDays;
    if(Object.hasOwn(data,'shipmentNotification'))order.shipment_notification=data.shipmentNotification;
    select.value=data.fulfillmentStatus;
    $(`#order-tracking-${order.id}`).textContent=order.tracking_id?'Tracking ID: '+order.tracking_id:'';
    $(`#order-delivery-${order.id}`).textContent=deliveryEstimate(order);
    renderShipmentMessage(order);
    setStatus(`Order ${order.reference_id} marked ${data.fulfillmentStatus}.`,'success');
  }catch(error){select.value=previous;throw error}
  finally{select.disabled=false}
}
$('#orders-list').addEventListener('change',async event=>{
  const select=event.target.closest('[data-order-stage]');if(!select)return;
  const order=state.orders.find(o=>String(o.id)===select.dataset.orderStage);if(!order)return;
  const previous=order.fulfillment_status || 'processing';
  if(select.value==='shipped'){
    select.value=previous;
    openShipmentDialog(order,select);
    return;
  }
  try{await updateOrderStage(order,select,select.value)}catch(error){setStatus(error.message,'error')}
});
$('#shipping-cancel').addEventListener('click',()=>{if(!state.shipment?.saving)$('#shipping-dialog').close()});
$('#shipping-dialog').addEventListener('cancel',event=>{if(state.shipment?.saving)event.preventDefault()});
$('#shipping-dialog').addEventListener('close',()=>{state.shipment=null});
$('#shipping-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const shipment=state.shipment;if(!shipment || shipment.saving)return;
  const trackingId=$('#tracking-id').value.trim();
  if(!trackingId || trackingId.length>120 || /[\x00-\x1f\x7f]/.test(trackingId)){
    $('#shipping-error').textContent='Enter a tracking ID of 1 to 120 characters.';$('#tracking-id').focus();return;
  }
  const rawDays=$('#delivery-days').value.trim();
  const estimatedDeliveryDays=rawDays===''?null:Number(rawDays);
  if(estimatedDeliveryDays!==null&&(!Number.isInteger(estimatedDeliveryDays)||estimatedDeliveryDays<1||estimatedDeliveryDays>2147483647)){
    $('#shipping-error').textContent='Estimated delivery must be a positive whole number of days.';$('#delivery-days').focus();return;
  }
  shipment.saving=true;
  $('#shipping-error').textContent='';
  $('#shipping-save').disabled=true;$('#shipping-cancel').disabled=true;$('#tracking-id').disabled=true;$('#delivery-days').disabled=true;
  try{await updateOrderStage(shipment.order,shipment.select,'shipped',trackingId,estimatedDeliveryDays);$('#shipping-dialog').close()}
  catch(error){$('#shipping-error').textContent=error.message}
  finally{shipment.saving=false;$('#shipping-save').disabled=false;$('#shipping-cancel').disabled=false;$('#tracking-id').disabled=false;$('#delivery-days').disabled=false}
});

async function start(){
  try{
    const response=await fetch('/api/admin/config',{cache:'no-store'});
    state.config=await response.json();
    if(!state.config.ready)throw new Error('The owner dashboard is being connected. Please try again later.');
    const fragment=new URLSearchParams(location.hash.slice(1));
    const linkToken=fragment.get('access');
    if(linkToken){
      history.replaceState(null,'',location.pathname+location.search);
      if(validToken(linkToken))saveToken(linkToken);
    }else state.token=sessionStorage.getItem(accessStorageKey);
    if(state.token){
      try{await enterDashboard();return}catch(error){if(error.status===403)clearToken();showLogin(error.message)}
    }
  }catch(error){showLogin(error.message)}
}
start();

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const money = value => '₹' + Number(value || 0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2});
const state = {config:null,token:null,products:[],orders:[],ordersPage:0,hasMore:false,orderLoading:false,selectedId:null,editing:null};
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
  if(!response.ok) throw new Error(data.error || 'The dashboard request failed.');
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
    kind:row.querySelector('[data-image-kind]').value
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
  const images=(p.images || []).map((image,index)=>`<div class="image-row" data-image-index="${index}">
    <img src="${escapeHtml(imageUrl(image.url))}" alt="">
    <label class="url-field">Image URL<input data-image-url type="url" value="${escapeHtml(image.url)}" placeholder="Supabase image URL or assets/name.jpg"></label>
    <label>Alt text<input data-image-alt value="${escapeHtml(image.alt || '')}" maxlength="160"></label>
    <div><label>Type<select data-image-kind><option value="product_photo" ${image.kind==='product_photo'?'selected':''}>Photo</option><option value="illustration" ${image.kind==='illustration'?'selected':''}>Illustration</option></select></label><button type="button" data-remove-image="${index}">Remove</button></div>
  </div>`).join('');
  const packs=(p.variants || []).map(v=>`<tr data-variant-id="${v.id}">
    <td><input data-size value="${escapeHtml(v.size)}" maxlength="40" aria-label="Pack size"></td>
    <td><input data-price type="number" min="1" max="100000" step=".01" value="${escapeHtml(v.price)}" aria-label="Price in rupees"></td>
    <td><input data-stock type="number" min="0" step="1" value="${v.inventory_quantity ?? ''}" placeholder="Unknown" aria-label="Units in stock"></td>
    <td><select data-availability aria-label="Availability"><option value="unverified" ${v.availability_status==='unverified'?'selected':''}>Confirm first</option><option value="available" ${v.availability_status==='available'?'selected':''}>Available</option><option value="unavailable" ${v.availability_status==='unavailable'?'selected':''}>Unavailable</option></select></td>
    <td><button type="button" data-save-variant="${v.id}">Save</button></td>
  </tr>`).join('');
  $('#product-editor').innerHTML=`<div class="editor-header"><div><p>${p.meta_linked?'Meta-linked record · store fields only':'Madikar store product'}</p><h2>${p.id?escapeHtml(p.display_name || p.name):'New product'}</h2></div><span class="pill ${p.store_active?'':'off'}">${p.store_active?'Listed':'Hidden'}</span></div>
    <div class="editor-grid"><div class="field"><label for="edit-name">Store name</label><input id="edit-name" maxlength="120" value="${escapeHtml(p.store_name || p.display_name || p.name || '')}"></div>
    <div class="field"><label for="edit-category">Category</label><input id="edit-category" list="store-categories" maxlength="60" value="${escapeHtml(p.category || '')}"><datalist id="store-categories">${[...new Set(state.products.map(x=>x.category))].map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist></div>
    <div class="field wide"><label for="edit-description">Description</label><textarea id="edit-description" maxlength="1000">${escapeHtml(p.short_description || p.description || '')}</textarea></div>
    <div class="field wide"><label><input id="edit-active" type="checkbox" ${p.store_active || p.active?'checked':''} style="width:auto;margin-right:.4rem">Listed on the store</label><small>New products stay hidden until a photo and at least one pack are added.</small></div></div>
    <div class="form-actions"><button type="button" class="primary" id="save-product">${p.id?'Save product':'Create hidden draft'}</button></div>
    <h3>Images</h3><p class="help">The first image appears in the store. Use Upload photo for a new product image; up to six images per product.</p>
    <div id="image-list">${images || '<p class="empty">No images yet.</p>'}</div>
    <div class="image-actions"><button type="button" id="add-image-url">Add image URL</button><input id="image-upload" class="upload-input" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose product photo"><button type="button" id="upload-image" ${p.id?'':'disabled'}>Upload photo</button></div>
    <h3>Pack sizes & prices</h3><p class="help">Leave stock blank when the count is unknown. “Unavailable” prevents new orders for that pack.</p>
    <table class="pack-table"><thead><tr><th>Size</th><th>Price</th><th>Stock</th><th>Availability</th><th></th></tr></thead><tbody>${packs || '<tr><td colspan="5">No pack sizes yet.</td></tr>'}</tbody></table>
    <div class="image-actions"><input id="new-size" placeholder="Pack size e.g. 500 ml" aria-label="New pack size"><input id="new-price" type="number" min="1" step=".01" placeholder="Price ₹" aria-label="New pack price"><input id="new-stock" type="number" min="0" step="1" placeholder="Stock optional" aria-label="New pack stock"><select id="new-availability" aria-label="New pack availability"><option value="unverified">Confirm first</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select><button type="button" id="add-pack" ${p.id?'':'disabled'}>Add pack</button></div>`;
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
  const pending=editorValues();
  const fields=adding?{size:$('#new-size').value,price:$('#new-price').value,
      inventoryQuantity:$('#new-stock').value,availabilityStatus:$('#new-availability').value,productId:state.editing.id}
    :{size:row.querySelector('[data-size]').value,price:row.querySelector('[data-price]').value,
      inventoryQuantity:row.querySelector('[data-stock]').value,availabilityStatus:row.querySelector('[data-availability]').value,
      id:row.dataset.variantId};
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
function renderOrders(){
  const source=$('#order-source').value;
  const list=state.orders.filter(o=>source==='all'||o.source===source);
  $('#orders-list').innerHTML=list.length?list.map(o=>{
    const customer=o.customer_name || o.profile?.name || o.whatsapp_user_id || 'Customer';
    const phone=o.customer_phone || o.address?.phone || o.whatsapp_user_id || '';
    const date=new Date(o.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
    const items=(o.items || []).map(i=>`<li>${escapeHtml(i.product_name || i.product_retailer_id)}${i.variant_size?' · '+escapeHtml(i.variant_size):''} × ${i.quantity} — ${money(i.unit_price*i.quantity)}</li>`).join('');
    const payments=(o.payments || []).map(p=>`${escapeHtml(p.status)}${p.provider_payment_id?' · '+escapeHtml(p.provider_payment_id):''}`).join(', ');
    return `<details class="order-card"><summary><span><strong>${escapeHtml(o.reference_id)}</strong><small>${escapeHtml(date)}</small></span><span>${escapeHtml(customer)}</span><span><span class="pill">${o.source==='store'?'Website':'WhatsApp'}</span></span><span>${escapeHtml(o.status)}</span><strong>${money(o.total)}</strong></summary>
      <div class="order-detail"><div><h3>Items</h3><ul>${items || '<li>No line items</li>'}</ul><p>Subtotal ${money(o.subtotal)} · Shipping ${money(o.shipping)}</p></div>
      <div><h3>Customer & delivery</h3><p>${escapeHtml(customer)}${phone?' · '+escapeHtml(phone):''}</p><p>${escapeHtml(o.customer_email || o.profile?.email || '')}</p><p>${escapeHtml(orderAddress(o))}</p><p>${payments?'Payment: '+payments:''}</p></div></div></details>`;
  }).join(''):'<p class="panel empty">No orders in this view.</p>';
  $('#load-more-orders').hidden=!state.hasMore;
}
async function loadOrders(reset=false){
  if(state.orderLoading)return;
  state.orderLoading=true;
  if(reset){state.orders=[];state.ordersPage=0}
  try{
    const data=await adminApi('admin_orders',{page:state.ordersPage});
    state.orders.push(...(data.orders || []));state.ordersPage+=1;state.hasMore=data.hasMore;
    renderOrders();setStatus(`${state.orders.length} orders loaded.`,'success');
  }catch(error){setStatus(error.message,'error')}
  finally{state.orderLoading=false}
}

$('#access-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const token=$('#access-code').value.trim();
  if(!validToken(token))return setStatus('The team access code should be 43 characters.','error','#login-status');
  saveToken(token);
  try{await enterDashboard();$('#access-code').value=''}
  catch(error){clearToken();showLogin(error.message)}
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
  if(tab==='orders'&&!state.orders.length)loadOrders(true);
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
$('#refresh-orders').addEventListener('click',()=>loadOrders(true));
$('#load-more-orders').addEventListener('click',()=>loadOrders());
$('#order-source').addEventListener('change',renderOrders);

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
      try{await enterDashboard();return}catch(error){clearToken();showLogin(error.message)}
    }
  }catch(error){showLogin(error.message)}
}
start();

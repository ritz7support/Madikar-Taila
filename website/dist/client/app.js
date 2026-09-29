const products = [];
const categoryOrder = ['Oils','Pantry','Millets','Chutneys & Spices','Pickles','Ghee','Drinks','Teas','Personal Care','Garden'];
const categories = () => ['All products',...categoryOrder.filter(c => products.some(p => p.category === c)),...new Set(products.map(p => p.category).filter(c => !categoryOrder.includes(c)))];
const palette = {
  'Oils':['#e8dbc2','#bd924b'],'Pantry':['#e8dac7','#b48060'],'Millets':['#e6e1ca','#879461'],
  'Chutneys & Spices':['#ecd8c9','#a86448'],'Pickles':['#e1dfc8','#71834e'],'Ghee':['#f1e1bc','#c89a42'],
  'Drinks':['#e2d6ca','#976e6b'],'Teas':['#dfe4d4','#7c9273'],'Personal Care':['#e8dadd','#ac828e'],'Garden':['#dce2d3','#6c8661']
};
const $ = s => document.querySelector(s);
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const byId = id => products.find(p => p.id === id);
const escapeXml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const productUrl = p => {
  const url = new URL('/', location.origin);
  url.searchParams.set('product',p.id);
  return url.href;
};
const productFromUrl = () => byId(new URLSearchParams(location.search).get('product'));
const storeTitle = document.title;
function titleLines(name){const words=name.split(' '), lines=['']; for(const w of words){let i=lines.length-1;if((lines[i]+' '+w).trim().length>19 && lines.length<3) lines.push(w); else lines[i]=(lines[i]+' '+w).trim()}return lines;}
function brandedImage(p){
  const [bg,accent]=palette[p.category]||palette.Pantry;
  const lines=titleLines(p.name).map((line,i)=>`<text x="54" y="${382+i*54}" font-family="Georgia,serif" font-size="43" fill="#173821">${escapeXml(line)}</text>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#faf8ed"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="662" cy="146" r="174" fill="${accent}" opacity=".17"/><circle cx="741" cy="668" r="284" fill="${accent}" opacity=".11"/><path d="M0 658Q300 515 800 655" fill="none" stroke="${accent}" stroke-width="2" opacity=".44"/><path d="M118 71C87 112 65 145 65 175a53 53 0 0 0 106 0c0-30-22-63-53-104Z" fill="#173821"/><path d="M118 117c-16 22-27 42-27 57a27 27 0 0 0 54 0c0-15-11-35-27-57Z" fill="#d5a445"/><text x="194" y="145" font-family="Georgia,serif" font-size="40" font-weight="bold" fill="#173821">Madikar Taila</text><text x="55" y="295" font-family="Arial,sans-serif" font-size="18" letter-spacing="5" fill="#786943">${escapeXml(p.category.toUpperCase())}</text>${lines}<line x1="55" y1="576" x2="745" y2="576" stroke="${accent}" stroke-width="2"/><text x="55" y="624" font-family="Arial,sans-serif" font-size="15" letter-spacing="4" fill="#5c6c55">PURE BY NATURE · DHARWAD</text><text x="55" y="737" font-family="Arial,sans-serif" font-size="13" letter-spacing="3" fill="#7d806f">ILLUSTRATIVE PRODUCT IMAGE</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function imageFor(p){
  if (/^assets\/[A-Za-z0-9_.-]+$/.test(p.image || '')) return p.image;
  try { const url = new URL(p.image); if (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')) return url.href; } catch {}
  return brandedImage(p);
}
const state={category:'All products',query:'',sort:'featured',cart:{},selection:{},modal:null};
let catalogState = 'loading';
try{state.cart=JSON.parse(localStorage.getItem('madikar-cart')||'{}')||{}}catch{}
const saveCart=()=>{try{localStorage.setItem('madikar-cart',JSON.stringify(state.cart))}catch{}};
const variantsOf=p=>p.variants;
const selectedVariant=p=>variantsOf(p)[state.selection[p.id]||0];
const availabilityLabel=v=>v.orderable===false?'Out of stock':v.available===true?(v.inventoryQuantity==null?'Available':`${v.inventoryQuantity} in stock`):'Confirm availability';

function renderCategories(){
  $('#category-list').innerHTML=categories().map(c=>`<button type="button" data-category="${escapeXml(c)}" class="${state.category===c?'active':''}" aria-pressed="${state.category===c}">${escapeXml(c)} <span>${c==='All products'?products.length:products.filter(p=>p.category===c).length}</span></button>`).join('');
}
function filteredProducts(){
  let list=products.filter(p=>(state.category==='All products'||p.category===state.category)&&(`${p.name} ${p.note} ${p.category}`.toLowerCase().includes(state.query)));
  if(state.sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));
  if(state.sort==='price-low')list.sort((a,b)=>Math.min(...a.variants.map(v=>v.price))-Math.min(...b.variants.map(v=>v.price)));
  if(state.sort==='price-high')list.sort((a,b)=>Math.min(...b.variants.map(v=>v.price))-Math.min(...a.variants.map(v=>v.price)));
  return list;
}
function renderProducts(){
  if (catalogState !== 'ready') {
    $('#result-count').textContent = '…';
    $('#no-results').hidden = true;
    $('#product-grid').innerHTML = `<p class="catalog-message" role="status">${catalogState === 'loading' ? 'Loading the collection…' : 'The collection is temporarily unavailable. Please try again shortly.'}</p>`;
    return;
  }
  const list=filteredProducts(); $('#result-count').textContent=list.length;
  $('#no-results').hidden=list.length>0;
  $('#product-grid').innerHTML=list.map(p=>{
    const selected=state.selection[p.id]||0, v=p.variants[selected];
    const opts=p.variants.map((v,i)=>`<option value="${i}" ${i===selected?'selected':''}>${escapeXml(v.size)}${v.orderable===false?' — out of stock':''}</option>`).join('');
    const link=escapeXml(productUrl(p));
    return `<article class="product-card" data-id="${escapeXml(p.id)}"><a class="product-media" href="${link}" data-action="detail" aria-label="View ${escapeXml(p.name)} details"><img loading="lazy" src="${escapeXml(imageFor(p))}" alt="${escapeXml(p.imageAlt || `Illustrative image for ${p.name}`)}" class="${p.imageAlt ? 'supplied-product-image' : ''}">${p.imageAlt ? '' : '<img class="brand-stamp" src="assets/brand-stamp.svg" alt="" aria-hidden="true"><span class="image-label">Illustrative image</span>'}</a><div class="product-info"><div class="category-kicker">${escapeXml(p.category)}</div><a class="product-title" href="${link}" data-action="detail">${escapeXml(p.name)}</a><p class="product-note">${escapeXml(p.note)}</p><div class="card-bottom"><select class="variant-select" data-action="variant" aria-label="Choose size for ${escapeXml(p.name)}">${opts}</select><div class="availability-label">${availabilityLabel(v)}</div><div class="price-row"><strong class="price">${money(v.price)}</strong><button class="add-button" type="button" data-action="add" aria-label="Add ${escapeXml(p.name)}, ${escapeXml(v.size)}, to bag" ${v.orderable===false?'disabled':''}>+</button></div></div></div></article>`
  }).join('');
}
function cartEntries(){return Object.entries(state.cart).filter(([,q])=>q>0).map(([key,qty])=>{const [id,index]=key.split(':');const p=byId(id),v=p?.variants[Number(index)];return p&&v?{key,qty,p,v}:null}).filter(Boolean)}
function renderCart(){
  const entries=cartEntries(), count=entries.reduce((a,e)=>a+e.qty,0), total=entries.reduce((a,e)=>a+e.qty*e.v.price,0);
  $('#cart-count').textContent=count;$('#cart-total').textContent=money(total);
  $('#cart-items').innerHTML=entries.length?entries.map(e=>`<div class="cart-item" data-key="${escapeXml(e.key)}"><div class="cart-thumb branded-photo"><img src="${escapeXml(imageFor(e.p))}" alt="" class="${e.p.imageAlt ? 'supplied-product-image' : ''}">${e.p.imageAlt ? '' : '<img class="brand-stamp" src="assets/brand-stamp.svg" alt="" aria-hidden="true">'}</div><div><h3>${escapeXml(e.p.name)}</h3><small>${escapeXml(e.v.size)}</small><div class="qty-controls"><button type="button" data-qty="-1" aria-label="Remove one ${escapeXml(e.p.name)}">−</button><span>${e.qty}</span><button type="button" data-qty="1" aria-label="Add one ${escapeXml(e.p.name)}">+</button></div></div><strong>${money(e.qty*e.v.price)}</strong></div>`).join(''):'<div class="cart-empty"><strong>Your bag is waiting.</strong><p>Add something lovely from the collection.</p></div>';
  $('#checkout-open').disabled=!entries.length;
}
function addToCart(p,index){if(p.variants[index]?.orderable===false)return;const key=`${p.id}:${index}`;state.cart[key]=(state.cart[key]||0)+1;saveCart();renderCart();openCart()}
function openCart(){closeModal();$('#drawer-overlay').hidden=false;$('#cart-drawer').classList.add('open');$('#cart-drawer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';$('#cart-close').focus()}
function closeCart(){$('#drawer-overlay').hidden=true;$('#cart-drawer').classList.remove('open');$('#cart-drawer').setAttribute('aria-hidden','true');document.body.style.overflow=''}
function openModal(p,{pushUrl=true}={}){
  closeCart();
  if(pushUrl && new URLSearchParams(location.search).get('product')!==p.id) history.pushState({product:p.id},'',productUrl(p));
  state.modal=p.id;
  document.title=`${p.name} | Madikar Taila`;
  const v=selectedVariant(p),link=escapeXml(productUrl(p));
  $('#modal-content').innerHTML=`<div class="modal-grid"><div class="modal-visual branded-photo"><img src="${escapeXml(imageFor(p))}" alt="${escapeXml(p.imageAlt || `Illustrative image for ${p.name}`)}" class="${p.imageAlt ? 'supplied-product-image' : ''}">${p.imageAlt ? '' : '<img class="brand-stamp" src="assets/brand-stamp.svg" alt="" aria-hidden="true"><span class="illustrative-tag">Illustrative image</span>'}</div><div class="modal-info"><div class="category-kicker">${escapeXml(p.category)}</div><h2 id="modal-title">${escapeXml(p.name)}</h2><p>${escapeXml(p.note)}</p><label for="modal-variant">Choose pack size<select id="modal-variant">${p.variants.map((v,i)=>`<option value="${i}" ${i===(state.selection[p.id]||0)?'selected':''}>${escapeXml(v.size)}${v.orderable===false?' — out of stock':''}</option>`).join('')}</select></label><div class="modal-price" id="modal-price">${money(v.price)}</div><div class="availability-label" id="modal-availability">${availabilityLabel(v)}</div><button type="button" class="modal-add" id="modal-add" ${v.orderable===false?'disabled':''}>Add to bag</button><div class="product-share"><div class="share-label">Product link for WhatsApp</div><div class="product-share-row"><input id="product-share-url" type="url" readonly aria-label="Product link" value="${link}"><button type="button" id="copy-product-link">Copy link</button></div><p id="product-share-status" role="status" aria-live="polite"></p></div><p class="illustrative">${p.imageAlt ? '' : 'Illustrative image. '}Product details and final price should be confirmed with Madikar Taila.</p></div></div>`;
  $('#product-overlay').hidden=false;$('#product-modal').classList.add('open');$('#product-modal').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';$('#modal-close').focus();
}
function closeModal({clearUrl=true}={}){
  const wasOpen=Boolean(state.modal);
  $('#product-overlay').hidden=true;$('#product-modal').classList.remove('open');$('#product-modal').setAttribute('aria-hidden','true');state.modal=null;document.body.style.overflow='';document.title=storeTitle;
  if(clearUrl && wasOpen && new URLSearchParams(location.search).has('product')){
    const url=new URL(location.href);url.searchParams.delete('product');history.replaceState({},'',url);
  }
}
function syncProductFromUrl(){
  const p=productFromUrl();
  if(p && state.modal!==p.id) openModal(p,{pushUrl:false});
  else if(!p && state.modal) closeModal({clearUrl:false});
}

$('#category-list').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;state.category=b.dataset.category;renderCategories();renderProducts()});
$('#product-grid').addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(!target)return;const card=target.closest('[data-id]'),p=byId(card?.dataset.id);if(!p)return;if(target.dataset.action==='detail'){if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();openModal(p)}if(target.dataset.action==='add')addToCart(p,state.selection[p.id]||0)});
$('#product-grid').addEventListener('change',e=>{if(e.target.dataset.action!=='variant')return;const p=byId(e.target.closest('[data-id]')?.dataset.id);if(!p)return;state.selection[p.id]=Number(e.target.value);const card=e.target.closest('.product-card'),v=selectedVariant(p);card.querySelector('.price').textContent=money(v.price);card.querySelector('.availability-label').textContent=availabilityLabel(v);card.querySelector('.add-button').disabled=v.orderable===false;card.querySelector('.add-button').setAttribute('aria-label',`Add ${p.name}, ${v.size}, to bag`)});
$('#search-input').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();renderProducts()});
$('#sort-select').addEventListener('change',e=>{state.sort=e.target.value;renderProducts()});
$('#search-open').addEventListener('click',()=>{location.hash='shop';$('#search-input').focus()});
$('#clear-filters').addEventListener('click',()=>{state.category='All products';state.query='';$('#search-input').value='';renderCategories();renderProducts()});
$('#cart-open').addEventListener('click',openCart);$('#cart-close').addEventListener('click',closeCart);$('#drawer-overlay').addEventListener('click',closeCart);
$('#cart-items').addEventListener('click',e=>{const b=e.target.closest('[data-qty]');if(!b)return;const key=b.closest('[data-key]').dataset.key;state.cart[key]=(state.cart[key]||0)+Number(b.dataset.qty);if(state.cart[key]<=0)delete state.cart[key];saveCart();renderCart()});
$('#product-overlay').addEventListener('click',closeModal);$('#modal-close').addEventListener('click',closeModal);
$('#modal-content').addEventListener('change',e=>{if(e.target.id==='modal-variant'&&state.modal){state.selection[state.modal]=Number(e.target.value);const v=selectedVariant(byId(state.modal));$('#modal-price').textContent=money(v.price);$('#modal-availability').textContent=availabilityLabel(v);$('#modal-add').disabled=v.orderable===false;renderProducts()}});
$('#modal-content').addEventListener('click',async e=>{
  if(e.target.id==='modal-add'&&state.modal){const p=byId(state.modal),i=state.selection[p.id]||0;if(p.variants[i]?.orderable===false)return;closeModal();addToCart(p,i)}
  if(e.target.id==='copy-product-link'&&state.modal){
    const input=$('#product-share-url'),status=$('#product-share-status');
    try{await navigator.clipboard.writeText(input.value);status.textContent='Link copied. Paste it into the WhatsApp catalog or a chat.'}
    catch{input.focus();input.select();status.textContent='Select and copy this link to use it in WhatsApp.'}
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();closeCart()}});
window.addEventListener('popstate',syncProductFromUrl);
window.MADIKAR_STORE={cartEntries,closeCart,clearCart(){state.cart={};saveCart();renderCart()},money};
renderCategories();renderProducts();renderCart();
async function loadCatalog(){
  try {
    const response = await fetch('/api/catalog',{headers:{Accept:'application/json'},cache:'no-store'});
    if (!response.ok) throw new Error('Catalog unavailable');
    const data = await response.json();
    if (!Array.isArray(data.products) || !data.products.length) throw new Error('Catalog unavailable');
    const next = data.products.map(p => ({...p,imageAlt:p.image_alt || '',variants:p.variants}));
    if (next.some(p => !/^p[0-9]+$/.test(p.id) || !Array.isArray(p.variants) || !p.variants.length)) throw new Error('Invalid catalog');
    products.splice(0,products.length,...next);
    catalogState = 'ready';
    if (!categories().includes(state.category)) state.category = 'All products';
  } catch {
    catalogState = 'error';
  }
  renderCategories();renderProducts();renderCart();syncProductFromUrl();
}
loadCatalog();

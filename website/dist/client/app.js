const products = [];
const categoryOrder = ['Oils','Millets','Chutney Powder','Pickles','Ghee','Teas','Soaps','Essentials','Special'];
const categories = () => ['All products',...categoryOrder.filter(c => products.some(p => p.category === c)),...new Set(products.map(p => p.category).filter(c => !categoryOrder.includes(c)))];
const palette = {
  'Oils':['#e8dbc2','#bd924b'],'Pantry':['#e8dac7','#b48060'],'Millets':['#e6e1ca','#879461'],
  'Chutneys & Spices':['#ecd8c9','#a86448'],'Pickles':['#e1dfc8','#71834e'],'Ghee':['#f1e1bc','#c89a42'],
  'Teas':['#dfe4d4','#7c9273'],'Soaps':['#e8dadd','#ac828e'],'Essentials':['#dce2d3','#6c8661'],
  'Special':['#e8dac7','#b48060'],'Chutney Powder':['#ecd8c9','#a86448']
};
const $ = s => document.querySelector(s);
const money = n => '₹' + Number(n).toLocaleString('en-IN');
const byId = id => products.find(p => p.id === id);
const escapeXml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const productUrl = p => `/products/${encodeURIComponent(p.slug)}`;
const slugFromPath = () => location.pathname.match(/^\/products\/([^/]+)\/?$/)?.[1] || null;
const storeTitle = document.title;
function titleLines(name){const words=name.split(' '), lines=['']; for(const w of words){let i=lines.length-1;if((lines[i]+' '+w).trim().length>19 && lines.length<3) lines.push(w); else lines[i]=(lines[i]+' '+w).trim()}return lines;}
function brandedImage(p){
  const [bg,accent]=palette[p.category]||palette.Pantry;
  const lines=titleLines(p.name).map((line,i)=>`<text x="54" y="${382+i*54}" font-family="Georgia,serif" font-size="43" fill="#173821">${escapeXml(line)}</text>`).join('');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#faf8ed"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="662" cy="146" r="174" fill="${accent}" opacity=".17"/><circle cx="741" cy="668" r="284" fill="${accent}" opacity=".11"/><path d="M0 658Q300 515 800 655" fill="none" stroke="${accent}" stroke-width="2" opacity=".44"/><path d="M118 71C87 112 65 145 65 175a53 53 0 0 0 106 0c0-30-22-63-53-104Z" fill="#173821"/><path d="M118 117c-16 22-27 42-27 57a27 27 0 0 0 54 0c0-15-11-35-27-57Z" fill="#d5a445"/><text x="194" y="145" font-family="Georgia,serif" font-size="40" font-weight="bold" fill="#173821">Madikar Taila</text><text x="55" y="295" font-family="Arial,sans-serif" font-size="18" letter-spacing="5" fill="#786943">${escapeXml(p.category.toUpperCase())}</text>${lines}<line x1="55" y1="576" x2="745" y2="576" stroke="${accent}" stroke-width="2"/><text x="55" y="624" font-family="Arial,sans-serif" font-size="15" letter-spacing="4" fill="#5c6c55">PURE BY NATURE · DHARWAD</text><text x="55" y="737" font-family="Arial,sans-serif" font-size="13" letter-spacing="3" fill="#7d806f">ILLUSTRATIVE PRODUCT IMAGE</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
}
function imageFor(p){
  if (/^assets\/[A-Za-z0-9_.-]+$/.test(p.image || '')) return '/' + p.image;
  try { const url = new URL(p.image); if (url.protocol === 'https:' && url.hostname.endsWith('.supabase.co')) return url.href; } catch {}
  return brandedImage(p);
}
const state={category:'All products',query:'',sort:'featured',cart:{},selection:{},detail:null};
let catalogState = 'loading';
let catalogLoading = false;
let catalogVerifiedAt=0;
try{state.cart=JSON.parse(localStorage.getItem('madikar-cart')||'{}')||{}}catch{}
const saveCart=()=>{try{localStorage.setItem('madikar-cart',JSON.stringify(state.cart))}catch{}};
const variantsOf=p=>p.variants;
const selectedVariant=p=>variantsOf(p)[state.selection[p.id]||0];
const availabilityLabel=v=>v.orderable===false?'Out of stock':v.available===true?'In stock':'Confirm availability';

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
    $('#result-count').textContent = catalogState === 'loading' ? '…' : '—';
    $('#no-results').hidden = true;
    $('#product-grid').innerHTML = `<div class="catalog-message"><p role="status">${catalogState === 'loading' ? 'Loading the collection…' : 'We couldn’t load the collection. Please try again.'}</p>${catalogState === 'error' ? '<button type="button" class="catalog-retry" data-action="retry-catalog">Try again</button>' : ''}</div>`;
    return;
  }
  const list=filteredProducts(); $('#result-count').textContent=list.length;
  $('#no-results').hidden=list.length>0;
  $('#product-grid').innerHTML=list.map(p=>{
    const selected=state.selection[p.id]||0, v=p.variants[selected];
    const opts=p.variants.map((v,i)=>`<option value="${i}" ${i===selected?'selected':''}>${escapeXml(v.size)}${v.orderable===false?' — out of stock':''}</option>`).join('');
    const link=escapeXml(productUrl(p));
    return `<article class="product-card" data-id="${escapeXml(p.id)}"><a class="product-media" href="${link}" data-action="detail" aria-label="View ${escapeXml(p.name)} details"><img loading="lazy" decoding="async" width="640" height="640" src="${escapeXml(imageFor(p))}" alt="${escapeXml(p.imageAlt || `Illustrative image for ${p.name}`)}" class="${p.imageAlt ? 'supplied-product-image' : ''}">${p.imageAlt ? '' : '<img class="brand-stamp" src="/assets/brand-stamp.svg" alt="" aria-hidden="true"><span class="image-label">Illustrative image</span>'}</a><div class="product-info"><div class="category-kicker">${escapeXml(p.category)}</div><a class="product-title" href="${link}" data-action="detail">${escapeXml(p.name)}</a><p class="product-note">${escapeXml(p.note)}</p><div class="card-bottom"><select class="variant-select" data-action="variant" aria-label="Choose size for ${escapeXml(p.name)}">${opts}</select><div class="availability-label">${availabilityLabel(v)}</div><div class="price-row"><strong class="price">${money(v.price)}</strong><button class="add-button" type="button" data-action="add" aria-label="Add ${escapeXml(p.name)}, ${escapeXml(v.size)}, to bag" ${v.orderable===false?'disabled':''}>+</button></div></div></div></article>`
  }).join('');
}
function cartEntries(){return Object.entries(state.cart).filter(([,q])=>q>0).map(([key,qty])=>{const [id,index]=key.split(':');const p=byId(id),v=p?.variants[Number(index)];return p&&v?{key,qty,p,v}:null}).filter(Boolean)}
function renderCart(){
  const entries=cartEntries(), count=entries.reduce((a,e)=>a+e.qty,0), total=entries.reduce((a,e)=>a+e.qty*e.v.price,0);
  $('#cart-count').textContent=count;$('#cart-total').textContent=money(total);
  $('#cart-items').innerHTML=entries.length?entries.map(e=>`<div class="cart-item" data-key="${escapeXml(e.key)}"><div class="cart-thumb branded-photo"><img src="${escapeXml(imageFor(e.p))}" alt="" class="${e.p.imageAlt ? 'supplied-product-image' : ''}">${e.p.imageAlt ? '' : '<img class="brand-stamp" src="/assets/brand-stamp.svg" alt="" aria-hidden="true">'}</div><div><h3>${escapeXml(e.p.name)}</h3><small>${escapeXml(e.v.size)}${e.v.orderable===false?' · Out of stock':''}</small><div class="qty-controls"><button type="button" data-qty="-1" aria-label="Remove one ${escapeXml(e.p.name)}">−</button><span>${e.qty}</span><button type="button" data-qty="1" aria-label="Add one ${escapeXml(e.p.name)}" ${e.v.orderable===false?'disabled':''}>+</button></div></div><strong>${money(e.qty*e.v.price)}</strong></div>`).join(''):'<div class="cart-empty"><strong>Your bag is waiting.</strong><p>Add something lovely from the collection.</p></div>';
  $('#checkout-open').disabled=!entries.length||entries.some(e=>e.v.orderable===false)||catalogState!=='ready';
}
async function addToCart(p,index){if(Date.now()-catalogVerifiedAt>30000)await loadCatalog(true);p=products.find(item=>item.id===p.id);if(catalogState!=='ready'||!p?.variants[index]||p.variants[index].orderable===false)return;const key=`${p.id}:${index}`;state.cart[key]=(state.cart[key]||0)+1;saveCart();renderCart();openCart()}
function openCart(){$('#drawer-overlay').hidden=false;$('#cart-drawer').classList.add('open');$('#cart-drawer').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';$('#cart-close').focus()}
function closeCart(){$('#drawer-overlay').hidden=true;$('#cart-drawer').classList.remove('open');$('#cart-drawer').setAttribute('aria-hidden','true');document.body.style.overflow=''}
const detailText = text => escapeXml(text).replaceAll('\n','<br>');
function renderRoute(){
  const legacyId=location.pathname==='/' ? new URLSearchParams(location.search).get('product') : null;
  if(legacyId && catalogState==='ready'){
    const legacy=byId(legacyId);
    if(legacy) history.replaceState({},'',productUrl(legacy));
  }
  const slug=slugFromPath();
  const isDetail=Boolean(slug || (legacyId && catalogState==='ready'));
  document.body.classList.toggle('product-route',isDetail);
  document.documentElement?.classList.toggle('product-route',isDetail);
  $('#product-page').hidden=!isDetail;
  if(!isDetail){state.detail=null;document.title=storeTitle;return}
  if(catalogState!=='ready'){
    $('#product-page').innerHTML=`<div class="detail-state" role="status"><p>${catalogState==='loading'?'Loading product…':'We couldn’t load this product. Please try again.'}</p>${catalogState==='error'?'<button type="button" class="catalog-retry" data-action="retry-catalog">Try again</button>':''}</div>`;
    return;
  }
  let decodedSlug=null;
  try { if(slug) decodedSlug=decodeURIComponent(slug); } catch {}
  const p=decodedSlug ? products.find(item=>item.slug===decodedSlug) : null;
  if(!p){
    state.detail=null;
    document.title='Product not found | Madikar Taila';
    $('#product-page').innerHTML='<div class="detail-state"><h1>Product not found</h1><p>This product is not in the current collection.</p><a class="outline-button" href="/#shop">Shop all products</a></div>';
    return;
  }
  state.detail=p.id;
  document.title=`${p.name} | Madikar Taila`;
  const v=selectedVariant(p);
  const section=(title,value)=>value?.trim()?`<section class="detail-section"><h2>${title}</h2><p>${detailText(value)}</p></section>`:'';
  $('#product-page').innerHTML=`<a class="detail-back" href="/#shop">← All products</a><div class="detail-grid"><div class="detail-visual"><img fetchpriority="high" decoding="async" width="800" height="800" src="${escapeXml(imageFor(p))}" alt="${escapeXml(p.imageAlt || `Illustrative image for ${p.name}`)}" class="${p.imageAlt?'supplied-product-image':''}"></div><div class="detail-info"><div class="category-kicker">${escapeXml(p.category)}</div><h1>${escapeXml(p.name)}</h1><p class="detail-note">${detailText(p.note)}</p><label for="detail-variant">Choose pack size</label><select id="detail-variant">${p.variants.map((variant,i)=>`<option value="${i}" ${i===(state.selection[p.id]||0)?'selected':''}>${escapeXml(variant.size)}${variant.orderable===false?' — out of stock':''}</option>`).join('')}</select><div class="detail-price" id="detail-price">${money(v.price)}</div><div class="availability-label" id="detail-availability">${availabilityLabel(v)}</div><button type="button" class="detail-add" id="detail-add" ${v.orderable===false?'disabled':''}>Add to bag</button><div class="product-share"><button type="button" id="copy-product-link">Copy product link</button><p id="product-share-status" role="status" aria-live="polite"></p></div></div></div><div class="detail-sections">${section('Traditional benefits',p.traditional_benefits)}${section('Extraction & craft',p.extraction_craft)}${section('Ingredients & more',p.ingredients_and_more)}</div>`;
}

$('#category-list').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;state.category=b.dataset.category;renderCategories();renderProducts()});
$('#product-grid').addEventListener('click',e=>{if(e.target.closest('[data-action="retry-catalog"]')) void loadCatalog()});
$('#product-grid').addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(!target)return;const card=target.closest('[data-id]'),p=byId(card?.dataset.id);if(!p)return;if(target.dataset.action==='detail'){if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigateStore(productUrl(p))}if(target.dataset.action==='add')addToCart(p,state.selection[p.id]||0)});
$('#product-grid').addEventListener('change',e=>{if(e.target.dataset.action!=='variant')return;const p=byId(e.target.closest('[data-id]')?.dataset.id);if(!p)return;state.selection[p.id]=Number(e.target.value);const card=e.target.closest('.product-card'),v=selectedVariant(p);card.querySelector('.price').textContent=money(v.price);card.querySelector('.availability-label').textContent=availabilityLabel(v);card.querySelector('.add-button').disabled=v.orderable===false;card.querySelector('.add-button').setAttribute('aria-label',`Add ${p.name}, ${v.size}, to bag`)});
$('#search-input').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();renderProducts()});
$('#sort-select').addEventListener('change',e=>{state.sort=e.target.value;renderProducts()});
$('#search-open').addEventListener('click',()=>{navigateStore('/#shop');$('#search-input').focus()});
$('#clear-filters').addEventListener('click',()=>{state.category='All products';state.query='';$('#search-input').value='';renderCategories();renderProducts()});
$('#cart-open').addEventListener('click',openCart);$('#cart-close').addEventListener('click',closeCart);$('#drawer-overlay').addEventListener('click',closeCart);
$('#cart-items').addEventListener('click',e=>{const b=e.target.closest('[data-qty]');if(!b)return;const key=b.closest('[data-key]').dataset.key;if(Number(b.dataset.qty)>0&&cartEntries().find(e=>e.key===key)?.v.orderable===false)return;state.cart[key]=(state.cart[key]||0)+Number(b.dataset.qty);if(state.cart[key]<=0)delete state.cart[key];saveCart();renderCart()});
$('#product-page').addEventListener('change',e=>{if(e.target.id==='detail-variant'&&state.detail){state.selection[state.detail]=Number(e.target.value);const v=selectedVariant(byId(state.detail));$('#detail-price').textContent=money(v.price);$('#detail-availability').textContent=availabilityLabel(v);$('#detail-add').disabled=v.orderable===false;renderProducts()}});
$('#product-page').addEventListener('click',async e=>{
  if(e.target.closest('[data-action="retry-catalog"]')) void loadCatalog();
  if(e.target.id==='detail-add'&&state.detail){const p=byId(state.detail),i=state.selection[p.id]||0;if(p.variants[i]?.orderable===false)return;addToCart(p,i)}
  if(e.target.id==='copy-product-link'&&state.detail){
    const status=$('#product-share-status'),link=new URL(productUrl(byId(state.detail)),location.origin).href;
    try{await navigator.clipboard.writeText(link);status.textContent='Product link copied.'}
    catch{status.textContent='Copy this product link: '+link;}
  }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart()});
function navigateStore(path,{replace=false}={}){
  const url=new URL(path,location.origin);
  history[replace?'replaceState':'pushState']({},'',url.pathname+url.search+url.hash);
  renderRoute();
  const target=url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if(target)target.scrollIntoView({behavior:'instant',block:'start'});else window.scrollTo({top:0,left:0,behavior:'instant'});
}
document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest('a[href]');
  if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
  const url=new URL(link.href,location.origin);
  if(url.origin!==location.origin || !(url.pathname==='/'||/^\/products\/[^/]+\/?$/.test(url.pathname)) || url.search)return;
  event.preventDefault();
  navigateStore(url.href);
});
window.addEventListener('popstate',renderRoute);
window.addEventListener('storage',event=>{if(event.key==='madikar-catalog-changed')void loadCatalog(true)});
window.addEventListener('focus',()=>{if(Date.now()-catalogVerifiedAt>30000)void loadCatalog(true)});
window.MADIKAR_STORE={cartEntries,closeCart,navigate:navigateStore,consumeCart(lines){for(const line of lines||[]){const key=line.id+":"+line.variant;const remaining=(state.cart[key]||0)-line.quantity;if(remaining>0)state.cart[key]=remaining;else delete state.cart[key]}saveCart();renderCart()},clearCart(){state.cart={};saveCart();renderCart()},money};
renderCategories();renderProducts();renderCart();renderRoute();
async function requestCatalog(){
  // Only retry the read-only catalog request; never replay checkout operations.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('/api/catalog',{
        headers:{Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)
      });
      if (response.ok) return await response.json();
      const error = new Error('Catalog unavailable');
      error.retryable = [408,429,500,502,503,504].includes(response.status);
      throw error;
    } catch (error) {
      const retryable = error.retryable || ['TypeError','AbortError','TimeoutError'].includes(error.name);
      if (!retryable || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve,1000 * (attempt + 1)));
    }
  }
}
async function loadCatalog(background=false){
  if (catalogLoading) return;
  catalogLoading = true;
  if(!background || catalogState!=='ready'){catalogState = 'loading';renderProducts();}
  try {
    const data = await requestCatalog();
    if (!Array.isArray(data.products) || !data.products.length) throw new Error('Catalog unavailable');
    const next = data.products.map(p => ({...p,imageAlt:p.image_alt || '',variants:p.variants}));
    if (next.some(p => !/^p[0-9]+$/.test(p.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || !Array.isArray(p.variants) || !p.variants.length)) throw new Error('Invalid catalog');
    products.splice(0,products.length,...next);
    catalogState = 'ready';
    catalogVerifiedAt=Date.now();
    if (!categories().includes(state.category)) state.category = 'All products';
  } catch {
    catalogState = 'error';
  } finally {
    catalogLoading = false;
  }
  renderCategories();renderProducts();renderCart();renderRoute();
}
loadCatalog();

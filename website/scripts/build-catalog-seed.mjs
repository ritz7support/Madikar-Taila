import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync('db/catalog-source.js','utf8'),sandbox);
const products = sandbox.window.PRODUCTS;
if (!Array.isArray(products) || products.length !== 84) throw new Error('Expected 84 catalog products');
const photoNames = new Set(['Groundnut Oil','Coconut Oil','Shenga Chutney']);
const rows = products.map((p,index) => ({
  store_id:p.id, category:p.category, name:p.name, short_description:p.note,
  images:[{url:p.image, alt:p.imageAlt || `${p.name} product image`,kind:photoNames.has(p.name) ? 'product_photo' : 'illustration'}],
  variants:p.variants.map(v => ({...v, available:null, stock_quantity:null})),
  store_sort_order:index+1
}));
if (rows.some(p => !p.images[0].url || !p.variants.length || p.variants.some(v => !Number.isInteger(v.price) || v.price < 1))) {
  throw new Error('Invalid catalog variant price');
}
const data = JSON.stringify(rows);
const delimiter = '$madikar_seed_2026$';
if (data.includes(delimiter) || data.includes('$seed_block$')) throw new Error('SQL seed delimiter collision');
const records = `jsonb_to_recordset(catalog_data) ` +
  `as item(store_id text, category text, name text, short_description text, images jsonb, variants jsonb, store_sort_order integer)`;
fs.writeFileSync('db/product_catalog_seed.sql',
  `do $seed_block$\ndeclare catalog_data jsonb := ${delimiter}${data}${delimiter}::jsonb;\nbegin\n` +
  `-- Enrich the seven existing Meta products; preserve their Meta IDs, links and descriptions.\n` +
  `update public."Product" as product set\n` +
  `  store_id=item.store_id, category=item.category, short_description=item.short_description,\n` +
  `  images=item.images, store_sort_order=item.store_sort_order, store_active=true\n` +
  `from ${records}\n` +
  `where lower(product.name)=lower(item.name) and product.catalog_id='1515875913870520';\n\n` +
  `-- Add only products missing from the existing Product table.\n` +
  `insert into public."Product" (name, retailer_id, catalog_id, description, store_id, category, short_description, images, store_sort_order, store_active)\n` +
  `select item.name, item.store_id, 'madikar-store', item.short_description, item.store_id,\n` +
  `  item.category, item.short_description, item.images, item.store_sort_order, true\n` +
  `from ${records}\n` +
  `where not exists (select 1 from public."Product" p where lower(p.name)=lower(item.name));\n\n` +
  `-- Pack sizes are distinct variants linked to those same Product records.\n` +
  `insert into public."ProductVariant" (product_id, position, size, price)\n` +
  `select product.id, (variant.ordinality-1)::integer, variant.value->>'size', (variant.value->>'price')::numeric\n` +
  `from ${records}\n` +
  `join public."Product" product on product.store_id=item.store_id\n` +
  `cross join lateral jsonb_array_elements(item.variants) with ordinality as variant(value, ordinality)\n` +
  `on conflict (product_id, position) do nothing;\nend;\n$seed_block$;\n`
);
console.log(`Prepared ${rows.length} products and ${rows.reduce((count,p) => count+p.variants.length,0)} variants.`);

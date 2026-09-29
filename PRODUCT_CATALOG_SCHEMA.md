# Product catalog schema — 30 September 2026

## Decisions and current data

The owner chose to keep the manually added products hidden for now. No products or variants were deleted.

Live review found 84 products and 115 variants:
- Seven Meta-linked products, IDs 1–7, catalog `1515875913870520`. All seven have order-item references and must be retained.
- Four manually added products currently listed on the website: Black Sesame Oil (15), Flaxseed Oil (16), Niger / Huchellu Oil (17), Castor Oil (18).
- Seventy-three manually added products remain hidden, IDs 19–91, catalog `madikar-store`. They have 87 variant rows and had no order-item references at review time.
- Eight products are visible overall: four Meta-linked oils and the four manual oils above. Coconut, Almond and Sesame Oil are currently hidden.

Future product pages will use `https://madikartaila.com/products/groundnut-oil`. The database stores only `groundnut-oil`. Page routing and replacement of the popup are future UI work; these URLs are not implemented by this database migration.

## Added fields

Migration `20260929191323_add_product_website_content.sql` was applied to live project `faoomjgkofqrdajaftjd`.

| Column | Purpose |
| --- | --- |
| `slug` | Unique lowercase URL segment. Backfilled from the current display name for all 84 rows. It is stable when the Meta name changes. |
| `website_description` | Short website description, initially copied from `short_description`. |
| `traditional_benefits` | Owner-authored plain text for the product detail page. |
| `extraction_craft` | Owner-authored extraction or preparation details. |
| `ingredients_and_more` | Owner-authored ingredients and additional information. |

The three new detail columns are nullable and were left empty. No benefits or ingredient information was invented. `slug` permits null for newly synced Meta products so importing a product does not depend on publishing its website page. Assign a unique lowercase slug before publishing those products.

The current `madikar-store` v3 API and admin UI use `short_description`. A new trigger, `sync_product_website_description`, keeps it synchronized with `website_description` in either direction, including clearing a value. Conflicting simultaneous writes are rejected. After the API/admin switch to the new name, the legacy column and compatibility trigger can be removed together in a separate reviewed migration.

Meta `description` remains the combined text imported from Meta. Sync does not parse it into the website fields, and no automatic composition back to Meta was added.

## Fields still used by the current integration

| Column | Current use |
| --- | --- |
| `product_link` | Meta URL imported by `sync-meta-catalog`. The bot explicitly selects it during Product lookup. Dropping it would break the existing REST select and sync writes. |
| `store_id` | Stable website identifier such as `p1`, used in carts, API product IDs, current query-string links, and image paths. |
| `store_name` | Website display-name override; prevents Meta sync from overwriting a website-specific name. |
| `store_active` | Whether the public catalog lists a product. Also used by the existing Meta cleanup protection trigger. |
| `store_sort_order` | Website catalog ordering. |
| `store_product_link` | Generated legacy link to the current query-string product popup. Revisit when real product routes and old-link redirects are implemented. |

`store_id` and `slug` have different jobs: existing cart identity and future human-readable routing. Do not remove or rename these fields until their current consumers have been migrated.

The bot's lookup selects `retailer_id, name, description, product_link, catalog_id`, filters by retailer ID and catalog ID, and uses the cached name in order items. The bot takes transaction prices from the incoming WhatsApp order; website prices do not change bot checkout prices.

## Variants

The public storefront starts with an empty product list and loads catalog data through the Sites Worker and `madikar-store`. Sizes and prices come from `public."ProductVariant"`; they are not hardcoded in the storefront.

Each variant belongs to one `Product.id` and stores size, price, position, inventory quantity and availability. Shared descriptions, images and the new detail content belong on Product once.

Groundnut Oil currently has:

| Size | Price (INR) |
| --- | --- |
| 500 ml | 175 |
| 1 L | 345 |
| 2 L | 690 |
| 5 L | 1725 |

The existing Meta sync only imports retailer ID, name, description, URL, catalog ID and update time. It does not import variant sizes or prices. Newly synced products therefore need website setup and ProductVariant records before listing.

When a manual product is later added to Meta, match it deliberately to its existing row before/with sync. Sync matches `(catalog_id, retailer_id)`, not product names; an uncoordinated sync would create a separate Meta row for the same product. Preserve the existing Product ID, website ID, slug, images and variant records when linking it. If the Meta catalog will contain one item per pack size, design the variant-to-retailer-ID mapping before changing the sync.

## Verification and boundaries

- Deployed `whatsapp-webhook` v92, `sync-meta-catalog` v9 and `madikar-store` v3 matched their tracked source at review time.
- Ran the schema and compatibility checks in a transaction and rolled back before the final migration.
- Re-ran `supabase/tests/product_website_content.sql` against the applied schema; all fixture changes were rolled back.
- Checked description writes through either field, null clearing, conflicting writes, invalid/duplicate slugs, future Meta insertion with null slug, stable slugs after name edits, and public-role permissions.
- Existing Product fields and all ProductVariant rows had identical before/after fingerprints; 84 products, 115 variants and 8 visible products remained.
- RLS and table grants were preserved. Security advisor findings were unchanged.
- No Edge Function, bot configuration, old migration, website UI, or Sites deployment was changed in this update.

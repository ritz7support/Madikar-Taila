# Product catalog schema — current checkpoint 13 October 2026

## Variant retailer IDs — planned, not implemented

The owner selected nullable text ProductVariant.retailer_id, populated with each verified Meta item/pack ID. Read docs/plans/VARIANT_RETAILER_IDS.md for mapping, constraints, compatibility and continuation. No column or backfill has been applied. The previous 14-hidden-row insertion proposal is superseded. Preserve Product.retailer_id and all existing lookup rows; Phase 1 changes only variant metadata and leaves runtime consumers unchanged. Bot/website/sync adoption is a separate Phase 2.

Live read on 13 October: 76 Product records, 59 website parents, 17 lookup rows without store_id and 94 variants. Sixteen lookup rows are flagged active, but store_id filtering still excludes them from website/admin listings. Four new variants are Sesame 500 ml/200 ml, Flax seed 200 ml and Niger/Huchellu 200 ml. Preserve team-entered values and refresh both systems before mapping; the 12 October Meta audit counts are historical.

## Shipping weights — 5 October 2026

The additive migration `20261005172819_add_variant_shipping_weight_grams.sql` adds nullable integer `ProductVariant.shipping_weight_grams`, constrained to positive values when set. It means the weight of one sellable pack in whole grams, including its bottle/jar/wrapper, excluding outer shipping packaging. No values were inferred from volume or backfilled; all 90 variants were NULL at publication.

The existing admin variant editor and Add pack form now accept Shipping weight (g). `admin_catalog` returns the column; `admin_save_variant` accepts optional `shippingWeightGrams`. Blank/null explicitly clears it. An omitted field preserves an existing value, so older admin clients remain compatible. Invalid values return HTTP 400 without a database write. Existing RLS/grants are unchanged.

This is metadata entry only: website and WhatsApp shipping remain zero, and public catalog, checkout, payments, bot handlers and Meta sync are unchanged. Courier rules and the runtime Meta retailer-ID-to-variant mapping remain a later phase. Historical reconciliation mappings are evidence to verify, not an active database relationship. Latest publication: Sites version 25 and madikar-store v11. The older checkpoints below remain historical.

**Current:** 59 website parents, 94 variants and 17 extra Meta lookup rows without store_id. ProductVariant.product_name follows its parent; inventory remains untracked. Latest checkpoint and retailer-ID plan are above and in PROJECT_HANDOFF.md. The dated September/October release counts below are history; statements that only eight products are visible or product pages are pending are superseded.

**30 September continuation checkpoint (history):** All 59 canonical website groups were made visible across the nine categories below; the then-current 90 variants and 59 bucket image links were served through `madikar-store` v5. The 17 additional Meta lookup rows remained hidden. Sites version 15 introduced `/products/<slug>` pages and browser redirects for old `/?product=<store_id>` links. The three optional detail fields were left empty and hidden by owner choice. Use the 13 October checkpoint above and `WEBSITE_HANDOFF.md` for current counts and versions.

## Decisions and current data

The owner's later cleanup instruction superseded the initial decision to keep all manual products. On 30 September, the catalog was reconciled against batch 1 (18 rows), batch 2 (48 rows), and the owner's updated batch 3 (3 rows), preserving the seven original oils and Mango pickle as explicitly confirmed.

Current live state:
- 76 Product rows: seven original oils plus one lookup row for each of the 69 CSV retailer IDs, all under catalog `1515875913870520`.
- 59 website product groups with `store_id`: the seven original oils plus 52 CSV groups. Their 90 ProductVariant rows comprise 21 unchanged original-oil variants and 69 CSV variants.
- 17 additional Meta lookup rows have `store_id = null`, `slug = null`, and `store_active = false`. They let the unmodified bot resolve additional pack-size retailer IDs without duplicate website listings. Sixteen rows were inserted; the existing four-pack soap row (81) became the seventeenth.
- Deleted 24 products and 25 variants absent from the approved inputs. None had order references.
- Eight products remain visible: Mustard, Sunflower, Safflower and Groundnut oils, plus Black Sesame (15), Flaxseed (16), Niger / Huchellu (17), and Castor (18). Coconut, Almond and Sesame remain hidden, as do the other retained products.
- Every Product image now points to the existing public `madikar-product-images` bucket. Uploaded 55 files and retained four existing bucket URLs; all 59 distinct linked images were publicly fetched and decoded successfully. No bucket named `products` was created.

No columns, constraints, triggers, table grants, Edge Functions or website code were changed by this reconciliation. Full backups, copied input CSVs, applied SQL, image inventory, exact retailer/variant mapping and verification are in `outputs/catalog-reconciliation-20260930/`; start with `REPORT.md`.

Future product pages will use `https://madikartaila.com/products/groundnut-oil`. The database stores only `groundnut-oil`. Page routing and replacement of the popup are future UI work; these URLs are not implemented by this database migration.

## Category inventory for the next website phase

From the saved post-reconciliation snapshot, 30 September 2026, 08:08:48 UTC. Recheck live data before changing visibility.

| Current category | Website groups | Listed | Hidden |
| --- | ---: | ---: | ---: |
| Oils | 14 | 8 | 6 |
| Special | 12 | 0 | 12 |
| Chutney Powder | 9 | 0 | 9 |
| Millets | 6 | 0 | 6 |
| Pickles | 5 | 0 | 5 |
| Soaps | 5 | 0 | 5 |
| Teas | 4 | 0 | 4 |
| Essentials | 3 | 0 | 3 |
| Ghee | 1 | 0 | 1 |
| **Total** | **59** | **8** | **51** |

The owner's next requested phase is to display the other retained categories/products and implement separate product pages. Visibility changes have not yet been made. Category counts exclude all 17 bot-only lookup rows. All 59 website groups have short `website_description` text; all three detail columns are empty. Render source-backed descriptions, hide empty sections, and request missing content instead of inventing it.

The current public API returns legacy display fields and variants, not the new slug/detail fields. Exposing those fields and implementing `/products/<slug>` routes is still pending. Preserve existing `/?product=<store_id>` links and cart identity. Sites version 14 adds catalog retries and a Try again button, but does not implement product pages or solve the underlying intermittent database authentication failure.

## Fields added by the earlier content migration

Migration `20260929191323_add_product_website_content.sql` was applied to live project `faoomjgkofqrdajaftjd`.

| Column | Purpose |
| --- | --- |
| `slug` | Unique lowercase URL segment. Backfilled from the current display name for all 84 rows. It is stable when the Meta name changes. |
| `website_description` | Short website description, initially copied from `short_description`. |
| `traditional_benefits` | Owner-authored plain text for the product detail page. |
| `extraction_craft` | Owner-authored extraction or preparation details. |
| `ingredients_and_more` | Owner-authored ingredients and additional information. |

The three new detail columns are nullable and were left empty. No benefits or ingredient information was invented. `slug` permits null for newly synced Meta products so importing a product does not depend on publishing its website page. Assign a unique lowercase slug before publishing those products.

The current `madikar-store` v4 API and admin UI use `short_description`; its deployed source matched the tracked file at the last inspection. The trigger `sync_product_website_description` keeps it synchronized with `website_description` in either direction, including clearing a value. Conflicting simultaneous writes are rejected. After the API/admin switch to the new name, the legacy column and compatibility trigger can be removed together in a separate reviewed migration.

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

Each CSV item now has a real Meta retailer ID lookup in Product. For a multi-size group, the first item uses the existing website parent; extra items use hidden Product rows. ProductVariant records remain together on the website parent. The exact mapping is saved in `outputs/catalog-reconciliation-20260930/retailer-variant-mapping.json`; there is no new database mapping column or automatic variant synchronization. Do not add website IDs or activate the hidden lookup rows.

Panchagavya's single bar and four-pack share website parent Product 80. Variant 105 moved from Product 81 to 80; Product 81 retains the four-pack retailer ID solely for bot lookup. Batch 3 Rose and Mango pickle are also retained.

Before a future sync, ensure Meta has accepted every intended batch item. This reconciliation did not upload to Meta or invoke `sync-meta-catalog`. Sync removes stale rows: its existing protection covers only `store_active` website rows, so a missing hidden website parent can be deleted along with its variants. Do not run sync while a batch is incomplete. Future linking must deliberately preserve parent Product IDs, website IDs, image fields and grouped variants.

CSV descriptions, categories, links, retailer IDs, pack sizes, prices and available status were applied. Existing website short descriptions and detail fields were retained. Feed-only metadata with no existing column (such as brand or origin country) was not added to the database.

## Earlier content-migration verification

- Deployed `whatsapp-webhook` v92, `sync-meta-catalog` v9 and `madikar-store` v3 matched their tracked source at review time.
- Ran the schema and compatibility checks in a transaction and rolled back before the final migration.
- Re-ran `supabase/tests/product_website_content.sql` against the applied schema; all fixture changes were rolled back.
- Checked description writes through either field, null clearing, conflicting writes, invalid/duplicate slugs, future Meta insertion with null slug, stable slugs after name edits, and public-role permissions.
- Existing Product fields and all ProductVariant rows had identical before/after fingerprints; 84 products, 115 variants and 8 visible products remained.
- RLS and table grants were preserved. Security advisor findings were unchanged.
- No Edge Function, bot configuration, old migration, website UI, or Sites deployment was changed in this update.

## Catalog reconciliation verification

- Inspected live `madikar-store` v4 and `sync-meta-catalog` v10 and confirmed their source matches the tracked functions after line-ending normalization. Inspected the live `whatsapp-webhook` v93 product lookup contract.
- Rehearsed the entire data transaction with a rollback, then applied it with snapshot guards, table locks, exact row-count checks and original-oil/order-reference assertions.
- Compared the final live snapshot against all 69 input rows and the planned variants. Verified 76 Product rows, 90 variants, 59 website groups and 17 hidden lookup rows.
- Compared before/after columns, constraints, triggers, grants and bucket settings: unchanged. Original oil fields are unchanged except image locations and update timestamps; all 21 original oil variants are identical.
- Fetched `https://madikartaila.com/api/catalog`: HTTP 200, eight expected visible products with matching variants, prices and bucket image links.
- No bot or website function was edited/deployed. No Meta sync was invoked. No order or payment action was performed.


## Variant names and stock — 1 October 2026

ProductVariant.product_name mirrors Product.store_name (falling back to Product.name). Backfilled all 90 variants; website-only trigger functions keep new/reassigned variants and parent renames synchronized without changing bot handlers. All 90 variants are available, including the previously unavailable Coconut Oil (200 ml, 500 ml, 1 L), Sesame Oil (1 L), and Almond Oil (100 ml, 200 ml). Quantities remain NULL (untracked); no stock counts were invented. Product visibility, IDs, prices, names, sizes and bot RPCs are preserved. Migration: 20261001044758_variant_product_names_and_availability.

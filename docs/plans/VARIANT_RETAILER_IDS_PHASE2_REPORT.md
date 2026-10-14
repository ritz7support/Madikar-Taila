# Variant order identity and Meta export — 14 October 2026

The owner requested a complete current Meta CSV, a separate ₹1 price checklist, and verification that each pack's retailer ID and price reach order/payment preparation correctly. After reviewing the tested patch, the owner explicitly authorized deployment: “Deploy the tested patch.” Only `whatsapp-webhook` and `madikar-store` were deployed. Meta was read only; no real order, payment or customer message was created by this work.

## Fresh catalog and deliverables

Meta catalog `1515875913870520` was fetched at **17:09:34 UTC / 22:39:34 IST**, across all three pages. Before/after counts were both **95**, with 95 unique retailer IDs. All 94 current Supabase variants have unique populated IDs matching Meta and their existing parent/catalog. Database totals are 75 Product rows: 59 website parents and 16 legacy lookup rows. The earlier owner-authorized four-pack deletion is recorded separately in PROJECT_HANDOFF.md; no database records were changed during this compatibility work.

The owner-assigned Mango 300 g, Rose Bar, Sesame 500/200 ml, Flax seed 200 ml, Niger/Huchellu 200 ml and Jaggery powder 500 gms mappings are present. Every populated Meta size agrees after unit normalization; 13 Meta items omit size. Already verified historical/owner assignments were retained for those items. All mapped website URLs match the canonical product slugs, including the owner's 23 URL corrections.

One Meta item remains unassigned: **Panchagavya soap `dg4i4tvblo`, ₹60, no size**. It is included in the complete CSV. It is not identified as the deleted four-pack; the owner will handle any Meta removal manually. The existing single-bar variant 104 and its parent remain intact.

Files under `docs/catalog/`:

- `Meta_Catalog_2026-10-14.csv`: all 95 current Meta items, including manual and feed items; 15 feed columns; UTF-8 BOM and RFC 4180 quoting. Exact retailer IDs, current descriptions, prices, sizes/groups, stock, links and image URLs are preserved.
- `One_Rupee_Test_Prices.md`: five Meta ₹1 items, four of which also cost ₹1 on the website; intended live-price and restoration checkboxes are left for the owner.
- `Catalog_Guide_and_Mapping_Audit.md`: import guidance and all 95 item mappings.

The CSV is a snapshot/editing base, **not a verified blanket replacement import**. Twenty-six items lack brand/GTIN/MPN; do not invent those values. Current image URLs are signed Meta CDN URLs and may expire. Refresh them or supply approved persistent image URLs before a later upload. Manual/feed ownership must be checked in Commerce Manager. No import, ownership transfer or deletion mode was exercised. Forty-seven API fields were requested; raw API/system metadata and empty/default attributes are retained in the local JSON evidence rather than misrepresented as feed columns.

## Deployed behavior

`whatsapp-webhook` **v95** resolves an incoming retailer ID through ProductVariant joined to its parent Product, scoped to the incoming catalog. It checks for ambiguous or mismatched results, records the exact retailer ID, and includes the pack size in the resolved product name. Legacy Product lookup and incoming-metadata fallbacks remain. No Meta request is made per checkout item. A database lookup error stops before order creation.

`madikar-store` **v16** records the selected variant's retailer ID in newly quoted session items, with the parent ID as a fallback for future unmapped variants. The server still reads that selected variant's price; browser-supplied prices and retailer IDs are ignored. Existing sessions/orders retain their stored identities and amounts.

WhatsApp still uses the incoming transaction's `item_price`; website checkout still uses Supabase ProductVariant.price. Neither price source was changed. Two current differences remain:

| Pack | Retailer ID | Meta | Website |
|---|---|---:|---:|
| Mustard oil 200 ml | rihd1eocew | ₹1 | ₹90 |
| Jaggery 1 kg | mt-jaggery-1000g | ₹70 | ₹85 |

Only the bot lookup/helper call and website item selection changed. Registration, addresses, amount calculation, payment-link creation, signatures, payment verification, order transitions, n8n handoffs, confirmation/shipment messages, recovery, admin behavior and shipping are preserved. Shipping is zero. Live checkout configuration reports mode `live`; this was observed, not changed. No genuine payment was attempted.

## Verification

- All **56 automated tests passed**, with external requests mocked. New cases cover exact packs, catalog scope, legacy/unmapped fallback, ambiguous and failed lookups, and punctuation-bearing IDs. A mixed pack cart retained ₹1 × 2 + ₹345 × 3 = ₹1,037 through the order RPC, 103,700-paise payment-link request and WhatsApp order-details payload. Duplicate order-message handling was retained.
- All **94 actual mapped variants** passed bot lookup and mocked website payment preparation using the fresh catalog snapshot, including ID, selected pack and server price. No Meta group crossed website parents. Forged browser price/ID values were ignored.
- The authenticated temporary GET-only probe verified the actual PostgREST join/filter against **all 94 live variants**, an exact pack, a wrong catalog and legacy lookup. This caught quoted scalar filters returning zero results; filters were corrected to URL-encoded raw equality values before deployment, and tests were rerun. The probe was deleted and returned 404.
- Both complete functions passed esbuild bundling. All five deployed source files were retrieved and matched the local files after line-ending normalization. Function IDs and JWT settings were retained; the other four functions' full inventory records, versions and hashes were unchanged. Only the original six functions remain.
- Before/after database snapshots and hashes match for every Product/ProductVariant field, orders, order_items, payments, table RLS/grants, policies and the four protected order/payment/checkout RPC definitions and grants.
- Live catalog/config returned HTTP 200 with **59 parents / 94 packs**, matching prices, sizes and availability; checkout ready and zero shipping. Unsigned requests to both deployed functions returned 401. Independent Python CSV parsing matched all 95 IDs and all 15 exported fields to the fresh Meta snapshot.

The full real payment/customer-message path was deliberately not exercised. Automated payment tests use mocks; live checks cover identity queries, source parity, public reads and authentication rejection.

## Remaining separate work

The order-identity portion of Phase 2 is now deployed. **Manual catalog sync compatibility remains deferred**: current `sync-meta-catalog` upserts one Product per Meta item and can delete stale parents. Do not invoke it until it has a separately reviewed variant-aware matching policy that preserves website parents, variants and legacy lookup rows. Do not recreate the superseded 14 hidden Product rows or replay Phase 1 backfill.

Restore intentional test prices deliberately before launch; resolve channel price differences with the owner. An admin retailer-ID editor, feed ownership migration, unresolved Meta-item identity/removal, content/metadata reconciliation, shipping calculations and broader production/payment checks remain separate. No cleanup of the remaining 16 lookup rows is authorized by this patch.

Evidence is in ignored `outputs/catalog-export-20261014/`: full Meta/DB snapshots, mapping audit, all-variant tests, live PostgREST proof, downloaded before/after source, deployment inventory and preservation fingerprints. Do not commit that directory wholesale. Work branch: `codex/catalog-export-variant-compatibility`, based on `be60d37` and preserving the existing admin/shipment work; main was older.

References: [Meta catalog feed reference](https://developers.facebook.com/documentation/ads-commerce/catalog/reference), [WhatsApp order webhook](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/order/), [Supabase joins and nesting](https://supabase.com/docs/guides/database/joins-and-nesting).

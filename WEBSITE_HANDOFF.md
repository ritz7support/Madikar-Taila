# Madikar Taila website handoff — 17 October 2026

## Current publication — 17 October

Continue from codex/payment-links-shipping-delivery (base f6a5e04). Same public Site, version 35, Sites source a18d8236ea143242d704fd7e45b9395ac3b5bc93, deployment appgdep_6ad35e594508819192b9eebb4de5090b, at https://madikartaila.com. Read docs/plans/PAYMENT_LINKS_SHIPPING_DELIVERY_2026-10-17.md and PROJECT_HANDOFF.md first. Website checkout now uses Standard Payment Links with server-quoted weight/box shipping; existing sessions retain compatibility. Admin Delivered sends order_delivered through a private queue; shipment Save does not wait for Meta. Supabase madikar-store v19, whatsapp-webhook v96 and razorpay-webhook v35 match local; the other functions remain unchanged. Settings activate payment_link and courier-2026-10-17 without changing live mode or keys. 98 tests, SQL fixtures, all-pack quote comparisons and browser/live read-only checks pass. Mustard 1 L still needs its weight. No real payment/message was performed. Older sections below describe historical checkpoints where superseded.

## Previous publication — 15 October

Continue from codex/store-speed-stock-sync (base b3d894a), preserving all earlier admin/shipment/variant work. Site 34 is published on the same public project at https://madikartaila.com, from Sites commit 3346982dbe2d15662f9cd3d25ec8be81a67dc1f4; deployment appgdep_6ad0a7c4f9208191838f6cc33084dc8b. The website backend is madikar-store v17 with index, checkout, confirmation, shipment and availability modules; all five match local. Other bot functions are unchanged. Do not deploy Site 32: its default-cache assumption was corrected in Site 33 with named-cache/fallback coverage.

Read PROJECT_HANDOFF.md and docs/plans/STORE_SPEED_AND_STOCK_2026-10-15.md first. Home/product routing now reuses the catalog, All products returns without reloading, and Copy product link replaces the WhatsApp field. Payment progress and session polling improve feedback; parallel provider reads retain all payment checks. Stock is an availability choice per pack or across a product, with exact-pack Meta availability sync, status and retries. No numeric stock entry, historical data change, actual Meta toggle, payment or customer message was used in implementation tests. All 76 automated tests, SQL rollback assertions and desktop/mobile browser checks pass.

Current catalog: 75 Product rows (59 website parents, 16 lookups), 94 variants and 94 Meta items; all mapped, all prices matching, four intentional ₹1 packs. Every existing variant remains available with untracked stock. CSV image links alone now use Supabase. Full sync, non-default-pack live payment testing and courier calculations remain deferred. The following checkpoints are historical where superseded above.

Start with PROJECT_HANDOFF.md, docs/plans/VARIANT_RETAILER_IDS.md and its Phase 2 report. Canonical source is website/ in samskruthrml21-eng/Madikar-Taila. Latest branch: codex/catalog-export-variant-compatibility, based on be60d37 and preserving ae53bb4. Last fetched origin/main was older at 4769c08. Preserve the admin/shipment baseline. The version-15 handoff in docs/history/ is history.

## Current scope and boundaries

The owner-approved identity patch is deployed: madikar-store v16 quotes each selected variant's retailer ID with parent fallback; whatsapp-webhook v95 resolves exact catalog-scoped packs with legacy/incoming fallbacks. All 94 existing variants are mapped to 94 of 95 current Meta items. Current database: 59 parents and 16 legacy lookups; no data/price/security changes in this patch. All 56 tests and 94 live identity checks passed. The complete CSV, ₹1 checklist and mapping audit are in docs/catalog/. Do not insert superseded rows, replace parent IDs, delete remaining lookups, replay backfill or invoke current full sync. Manual sync redesign, price/content reconciliation and courier calculations remain deferred. Site 31 is unchanged.

## Published state

The same public Site appgprj_6ab742ddf3e48191911b4bb531bb0ca8 serves https://madikartaila.com. Latest recorded publication is version 31 from Sites commit acedd13d7cd3acce09e18d800f402b46b30a4fbf, deployment appgdep_6acc89887b50819191bc7e10a47deb69 (12 October shipment messages). No publication occurred during the 13 October planning chat. Do not create a replacement Site; reconcile live source before edits.

The 14 October read found 59 parents and 95 variants, including five added packs. Mango pickle is now 300 g; all current team values were preserved. Direct /products/<slug> routes, legacy query redirects, database-driven prices, catalog retries and Try again remain. Seventeen additional lookup rows lack store_id and are excluded from product listings regardless of their active flags. ProductVariant.product_name follows its parent; stock quantities remain untracked.

Five policy/help pages are linked in the footer: privacy-policy, terms-and-conditions, shipping-policy, cancellation-refund-policy and faq. Their cross-page option bar and breadcrumbs were removed. Footer branding/contact was simplified, Our roots removed, and provisional price-sheet/imagery copy removed as requested. The panoramic hero shows the complete bottle with a continuous photographic background and uses responsive framing.

Checkout is enabled with zero shipping and UPI-only payment choices. Supabase selects test/live keys using RAZORPAY_MODE. Verified captured payment creates order records atomically; both modes trigger n8n and website_payment_confirmation (en). Success shows Payment received (or Test payment received), references and Continue shopping; the delivery heading is hidden and closing returns home. See website/PAYMENTS.md for data flow and unresolved operational checks.

## Backend and boundaries

Live madikar-store inventory is v16, preserving the shipment update and adding variant quote IDs; canonical source is supabase/functions/madikar-store/{index,checkout,confirmation,shipment}.ts. Preserve both public signing keys. Never deploy historical website/server/supabase-store-function.js. Bot boundaries remain in BOT_BACKEND_DO_NOT_TOUCH.md; Phase 1 changed no runtime or secrets and published no Site. Preserve the bot payment help-line and approved order_shipped flow.

The published runtime files match website/dist/client/, website/server/worker-template.js and its built Worker. Documentation and tests can advance independently of publication. Use website/README.md for publishing and tests. Current migrations are in supabase/migrations/ with their recorded Supabase timestamps; do not apply draft copies from local outputs or the older worktree.

## Evidence and limits

All six function sources were compared to live, and local tests/build are recorded in docs/CONSOLIDATION_2026-10-01.md. No real payment/message or new deployment is part of repository consolidation. The intermittent upstream catalog authentication issue, separate webhook registration, n8n deduplication, live-payment/recovery and handset-delivery checks remain analysis items in PROJECT_HANDOFF.md.

Local backups and outputs are preserved but excluded from Git; PROJECT_HANDOFF.md lists their locations. Earlier snapshots contain historical counts and instructions; use this checkpoint first.

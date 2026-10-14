# Madikar Taila website handoff — 14 October 2026

Start with PROJECT_HANDOFF.md, docs/plans/VARIANT_RETAILER_IDS.md and its Phase 1 report. Canonical source is website/ in samskruthrml21-eng/Madikar-Taila. Latest branch: codex/variant-retailer-id-phase1, based on b1d0ad7 and preserving ae53bb4. Freshly fetched origin/main remains older at 4769c08. Preserve the admin/shipment baseline. The version-15 handoff in docs/history/ is history.

## Current scope and boundaries

Phase 1 is applied: 87 verified variant retailer IDs, eight NULLs, 95 existing variants preserved; all prior fields and runtime unchanged. Fresh Meta read found 90 items; the owner deferred its three generated IDs. Do not insert the superseded hidden rows, replace parent IDs, delete lookups, replay the guarded backfill or invoke current full sync. Bot and website checkout still use Product retailer IDs; adoption is separate Phase 2. Forty-nine mocked tests and rollback-only SQL checks passed. Price/content/metadata reconciliation and courier calculations remain deferred.

## Published state

The same public Site appgprj_6ab742ddf3e48191911b4bb531bb0ca8 serves https://madikartaila.com. Latest recorded publication is version 31 from Sites commit acedd13d7cd3acce09e18d800f402b46b30a4fbf, deployment appgdep_6acc89887b50819191bc7e10a47deb69 (12 October shipment messages). No publication occurred during the 13 October planning chat. Do not create a replacement Site; reconcile live source before edits.

The 14 October read found 59 parents and 95 variants, including five added packs. Mango pickle is now 300 g; all current team values were preserved. Direct /products/<slug> routes, legacy query redirects, database-driven prices, catalog retries and Try again remain. Seventeen additional lookup rows lack store_id and are excluded from product listings regardless of their active flags. ProductVariant.product_name follows its parent; stock quantities remain untracked.

Five policy/help pages are linked in the footer: privacy-policy, terms-and-conditions, shipping-policy, cancellation-refund-policy and faq. Their cross-page option bar and breadcrumbs were removed. Footer branding/contact was simplified, Our roots removed, and provisional price-sheet/imagery copy removed as requested. The panoramic hero shows the complete bottle with a continuous photographic background and uses responsive framing.

Checkout is enabled with zero shipping and UPI-only payment choices. Supabase selects test/live keys using RAZORPAY_MODE. Verified captured payment creates order records atomically; both modes trigger n8n and website_payment_confirmation (en). Success shows Payment received (or Test payment received), references and Continue shopping; the delivery heading is hidden and closing returns home. See website/PAYMENTS.md for data flow and unresolved operational checks.

## Backend and boundaries

Live madikar-store inventory remains v15, including the shipment update; canonical source is supabase/functions/madikar-store/{index,checkout,confirmation,shipment}.ts. Preserve both public signing keys. Never deploy historical website/server/supabase-store-function.js. Bot boundaries remain in BOT_BACKEND_DO_NOT_TOUCH.md; Phase 1 changed no runtime or secrets and published no Site. Preserve the bot payment help-line and approved order_shipped flow.

The published runtime files match website/dist/client/, website/server/worker-template.js and its built Worker. Documentation and tests can advance independently of publication. Use website/README.md for publishing and tests. Current migrations are in supabase/migrations/ with their recorded Supabase timestamps; do not apply draft copies from local outputs or the older worktree.

## Evidence and limits

All six function sources were compared to live, and local tests/build are recorded in docs/CONSOLIDATION_2026-10-01.md. No real payment/message or new deployment is part of repository consolidation. The intermittent upstream catalog authentication issue, separate webhook registration, n8n deduplication, live-payment/recovery and handset-delivery checks remain analysis items in PROJECT_HANDOFF.md.

Local backups and outputs are preserved but excluded from Git; PROJECT_HANDOFF.md lists their locations. Earlier snapshots contain historical counts and instructions; use this checkpoint first.

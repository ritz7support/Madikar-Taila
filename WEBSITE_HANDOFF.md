# Madikar Taila website handoff — 13 October 2026

Start with PROJECT_HANDOFF.md and docs/plans/VARIANT_RETAILER_IDS.md. Canonical source is website/ in samskruthrml21-eng/Madikar-Taila. The latest handoff is codex/variant-retailer-id-plan, based on ae53bb4; main was still older when inspected. Preserve current admin/shipment work when branching. The previous version-15 handoff in docs/history/WEBSITE_HANDOFF_2026-09-30.md is history.

## Next-chat task and boundaries

Plan only: add/backfill verified Meta retailer IDs on existing ProductVariant rows, leaving existing runtime behavior unchanged. Do not add the superseded 14 hidden Product rows, overwrite parent IDs or delete legacy lookups. The bot and website checkout still use Product retailer IDs; adopting variant IDs is a separate Phase 2. Freshly inspect current Meta items and all 94 variants; do not replay snapshots over team-entered weights/prices. Content/metadata reconciliation and courier calculations remain deferred.

## Published state

The same public Site appgprj_6ab742ddf3e48191911b4bb531bb0ca8 serves https://madikartaila.com. Latest recorded publication is version 31 from Sites commit acedd13d7cd3acce09e18d800f402b46b30a4fbf, deployment appgdep_6acc89887b50819191bc7e10a47deb69 (12 October shipment messages). No publication occurred during the 13 October planning chat. Do not create a replacement Site; reconcile live source before edits.

The 13 October read found 59 canonical parents and 94 variants, including four team-added packs. Direct /products/<slug> routes, legacy query redirects, database-driven prices, catalog retries and Try again remain. Seventeen additional lookup rows lack store_id and are excluded from product listings regardless of their active flags. ProductVariant.product_name follows its parent; stock quantities remain untracked.

Five policy/help pages are linked in the footer: privacy-policy, terms-and-conditions, shipping-policy, cancellation-refund-policy and faq. Their cross-page option bar and breadcrumbs were removed. Footer branding/contact was simplified, Our roots removed, and provisional price-sheet/imagery copy removed as requested. The panoramic hero shows the complete bottle with a continuous photographic background and uses responsive framing.

Checkout is enabled with zero shipping and UPI-only payment choices. Supabase selects test/live keys using RAZORPAY_MODE. Verified captured payment creates order records atomically; both modes trigger n8n and website_payment_confirmation (en). Success shows Payment received (or Test payment received), references and Continue shopping; the delivery heading is hidden and closing returns home. See website/PAYMENTS.md for data flow and unresolved operational checks.

## Backend and boundaries

Live madikar-store inventory remains v15, including the shipment update; canonical source is supabase/functions/madikar-store/{index,checkout,confirmation,shipment}.ts. Preserve both public signing keys. Never deploy historical website/server/supabase-store-function.js. Bot boundaries remain in BOT_BACKEND_DO_NOT_TOUCH.md; the planning chat changes no runtime or secrets. Preserve the bot payment help-line and approved order_shipped flow.

The published runtime files match website/dist/client/, website/server/worker-template.js and its built Worker. Documentation and tests can advance independently of publication. Use website/README.md for publishing and tests. Current migrations are in supabase/migrations/ with their recorded Supabase timestamps; do not apply draft copies from local outputs or the older worktree.

## Evidence and limits

All six function sources were compared to live, and local tests/build are recorded in docs/CONSOLIDATION_2026-10-01.md. No real payment/message or new deployment is part of repository consolidation. The intermittent upstream catalog authentication issue, separate webhook registration, n8n deduplication, live-payment/recovery and handset-delivery checks remain analysis items in PROJECT_HANDOFF.md.

Local backups and outputs are preserved but excluded from Git; PROJECT_HANDOFF.md lists their locations. Earlier snapshots contain historical counts and instructions; use this checkpoint first.

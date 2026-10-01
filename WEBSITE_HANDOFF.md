# Madikar Taila website handoff — 1 October 2026

Start with PROJECT_HANDOFF.md for the whole-project checkpoint, analysis priorities and source map. Canonical development source is website/ in the main branch of samskruthrml21-eng/Madikar-Taila; create future work branches from main. The previous version-15 handoff is preserved as dated history in docs/history/WEBSITE_HANDOFF_2026-09-30.md and is not current instruction.

## Published state

The same public Site appgprj_6ab742ddf3e48191911b4bb531bb0ca8 serves https://madikartaila.com. Version 24 is published from Sites commit 311b7409b42c5e9370a9b01ccbf7e02658111b11, deployment appgdep_6abe3d502ff88191aa71dddc752f570a. Do not create a replacement Site. Reconcile current Site source before future edits; another chat may have published changes.

All 59 canonical products and 90 variants are available across nine categories. Direct /products/<slug> routes, legacy query redirects, database-driven prices, catalog retries and Try again remain. Seventeen bot lookup rows stay hidden. ProductVariant.product_name now follows the parent display name; stock quantities remain untracked.

Five policy/help pages are linked in the footer: privacy-policy, terms-and-conditions, shipping-policy, cancellation-refund-policy and faq. Their cross-page option bar and breadcrumbs were removed. Footer branding/contact was simplified, Our roots removed, and provisional price-sheet/imagery copy removed as requested. The panoramic hero shows the complete bottle with a continuous photographic background and uses responsive framing.

Checkout is enabled with zero shipping and UPI-only payment choices. Supabase selects test/live keys using RAZORPAY_MODE. Verified captured payment creates order records atomically; both modes trigger n8n and website_payment_confirmation (en). Success shows Payment received (or Test payment received), references and Continue shopping; the delivery heading is hidden and closing returns home. See website/PAYMENTS.md for data flow and unresolved operational checks.

## Backend and boundaries

Website function madikar-store v10 source matches supabase/functions/madikar-store/{index,checkout,confirmation}.ts as of 1 October. Its current two public signing keys are preserved. Never deploy the historical website/server/supabase-store-function.js. The shared bot is protected by BOT_BACKEND_DO_NOT_TOUCH.md; consolidation does not change deployments or secrets. The owner's bot payment confirmation help-line is preserved.

The published runtime files match website/dist/client/, website/server/worker-template.js and its built Worker. Documentation and tests can advance independently of publication. Use website/README.md for publishing and tests. Current migrations are in supabase/migrations/ with their recorded Supabase timestamps; do not apply draft copies from local outputs or the older worktree.

## Evidence and limits

All six function sources were compared to live, and local tests/build are recorded in docs/CONSOLIDATION_2026-10-01.md. No real payment/message or new deployment is part of repository consolidation. The intermittent upstream catalog authentication issue, separate webhook registration, n8n deduplication, live-payment/recovery and handset-delivery checks remain analysis items in PROJECT_HANDOFF.md.

Local backups and outputs are preserved but excluded from Git; PROJECT_HANDOFF.md lists their locations. Earlier snapshots contain historical counts and instructions; use this checkpoint first.

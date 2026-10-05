# Madikar Taila — project analysis starting point

Updated 5 October 2026. The consolidated main baseline has a follow-up on codex/variant-shipping-weights for optional admin shipping weights. Repository: https://github.com/samskruthrml21-eng/Madikar-Taila. Canonical checkout: D:/cursor projects/Madikar taila. Start with git status and git log -1; preserve any newer work. The older codex/website and cursor/production-hardening branches remain as history.

## Read first

1. Project_Instructions.md — repository workflow and boundaries.
2. BOT_BACKEND_DO_NOT_TOUCH.md — live bot protection rules.
3. WEBSITE_HANDOFF.md and website/README.md — current storefront and publication.
4. website/PAYMENTS.md — payment verification, recovery, messaging and known gaps.
5. PRODUCT_CATALOG_SCHEMA.md — catalog identities, variants and stock rules; dated history is marked.
6. WhatsApp_Flow_Project_Handoff.md, WhatsApp_Outbound_Message_JSON_Reference.md and WhatsApp_Flow_Error_Prevention_Guide.md — bot architecture and contracts.

## Verified checkpoint

- Site appgprj_6ab742ddf3e48191911b4bb531bb0ca8, public at https://madikartaila.com, version 25. Sites commit ca3c17acc2da0804e25dc6d6d4eff4ca6b111edd; deployment appgdep_6ac3df18d3608191a6a5308d18340664 succeeded. GitHub and Sites commit IDs are separate.
- website/dist/client and the Worker source/build match the version-25 publishing mirror. GitHub documentation may be newer than the published Site.
- Supabase faoomjgkofqrdajaftjd (ap-south-1): madikar-store v11 (5 October, source parity verified), whatsapp-webhook v94, whatsapp-flow v50, razorpay-webhook v33, sync-meta-catalog v11, retry-order-handoffs v6 (bot counters last inspected 1 October). Bot functions and shared code were not changed or deployed for weights. Counters can drift without source changes.
- Preserve the current website backend's two public signing keys (commented as Sites and Vercel). Vercel deployment/source was not independently reviewed in this consolidation; do not remove the second key or assume it is unused.
- 59 website products / 90 variants across nine categories; all variants made available on 1 October. Inventory counts are NULL (untracked), not invented quantities. ProductVariant.product_name mirrors the parent display name. Seventeen additional Meta lookup rows stay hidden.
- ProductVariant.shipping_weight_grams is now nullable positive integer metadata, editable in the existing admin pack table and Add pack form. All 90 weights remain NULL for the team to enter. No outer delivery packaging allowance. Migration 20261005172819_add_variant_shipping_weight_grams is applied; do not replay it.
- Checkout: UPI-only display, zero shipping, mode selected by the shared RAZORPAY_MODE secret. All delivery fields mandatory except email and landmark. Orders/items/payment/address are recorded atomically after verified capture. Website address source is website_checkout and does not replace saved bot addresses.
- Both test and live payments trigger n8n and the approved website_payment_confirmation WhatsApp template (en; no buttons/placeholders), plus the on-screen confirmation. The delivery header is hidden in the success popup; close and Continue shopping return home.
- The owner's earlier bot Razorpay help-line text is included. Consolidation does not deploy functions, change database state/secrets, send messages or process payments.

## Source map and checks

- website/dist/client/: editable storefront source despite its dist name. website/server/worker-template.js: Sites request signing and routing; build with node website/scripts/build-worker.mjs (run from website).
- supabase/functions/madikar-store/: current website backend (index.ts, checkout.ts, confirmation.ts). Bot functions remain in their own directories.
- supabase/migrations/: recorded migrations. Three missing 26 September migrations were recovered verbatim from Supabase migration history during consolidation; they were not reapplied. Historical website/db SQL is reference material, not a deployment script. A fresh-database reconstruction has not been tested; existing baseline tables and data imports may need separate reconstruction.
- Run npm test from website for frontend, Worker, auth/catalog and website checkout/confirmation tests. Run npm run build there to regenerate the Worker. Tests use mocks and do not make real charges or messages.

## Analysis priorities and remaining uncertainty

- The wider project audit is deferred at the owner's request. Current shipping work only adds weight entry. Courier rates/rounding will be supplied later; neither checkout uses weights yet. Before connecting the bot, verify catalog/retailer-ID-to-variant mappings (the historical 69-item mapping is under outputs/catalog-reconciliation-20260930/) rather than guessing from names or sizes. Preserve the original oil variants and hidden Meta lookup rows. Compute shipping before creating a payment link once this later phase is approved and specified.
- Weight verification: 36 automated tests passed, including authenticated save/clear/add, invalid input rejection, old admin clients preserving saved weights, and unchanged public catalog/checkout behavior. Local browser tests used mocked APIs and passed save/reload/clear/add, orders-tab access and 390px layout. Database constraint tests used a temporary table and rolled back. Existing Product and ProductVariant data hashes (excluding the new column), RLS and public grants were unchanged. No real order, payment or customer message was generated; authenticated live admin save was not exercised with a real staff code.

- Diagnose the intermittent catalog PGRST303 authentication error; bounded retries mitigate it but do not prove it fixed.
- Verify the separate website Razorpay webhook registration, live capture, recovery after browser closure, trusted edge client-IP header and downstream n8n idempotency. A timed-out n8n request may have been accepted; deduplicate by order_id. User reported successful test payment; no live payment was made during consolidation.
- Meta acceptance (wamid) is not handset delivery. Confirmation outbox uncertain states need manual review; avoid blind resends. Refund/dispute automation and abandoned-session retention cleanup are not implemented.
- Check policy wording against current zero-shipping/payment behavior and confirm the business's cancellation/address details. No new policy commitments were made during consolidation.
- Bot payment-link expiry/cancellation remains an outstanding end-to-end check. Account MFA and production operating/back-up readiness need owner review; historical plan/version facts should be rechecked.
- Admin sign-in using the rotated code has not been independently tested here. Plaintext codes and private keys are not in Git.

## Local evidence retained outside Git

outputs/ contains backups, customer/data snapshots, source downloads and generated artifacts. It is deliberately ignored and remains on disk; do not upload it wholesale. Main-checkout evidence lives under D:/cursor projects/Madikar taila/outputs/. Additional website checkout, template, hero and publication artifacts remain at C:/Users/ciphe/.codex/worktrees/2d55/Madikar taila/outputs/. Temporary Sites repositories and tar archives remain local and are not canonical source. Do not delete/archive that worktree before preserving any evidence needed for analysis. Do not copy its older website/ or draft migration timestamps over main.

## Suggested next-chat request

Analyze the entire Madikar Taila project in D:/cursor projects/Madikar taila on main. Read PROJECT_HANDOFF.md and its Read first files. Inspect current Git status and deployed state where needed. Produce a prioritized architecture, correctness, security, payment reliability and maintainability assessment with evidence. Do not make changes, deploy, send messages or process payments unless I ask. Always preserve bot functioning and all existing local work.

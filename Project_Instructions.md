# Madikar Taila — Project Instructions

Last updated: 14 October 2026.

## Variant retailer IDs — Phase 1 complete, Phase 2 separate

Read PROJECT_HANDOFF.md, docs/plans/VARIANT_RETAILER_IDS.md and its Phase 1 report first. Migration 20261014120349_add_verified_variant_retailer_ids is applied: 87 verified IDs, eight NULLs and 95 existing variants preserved. Fresh Meta read found 90 items; the owner deferred three newly generated IDs. The superseded 14-hidden-row insertion was never applied. Do not delete lookups, overwrite parent IDs, replay the guarded production backfill or invoke current full sync. Runtime is unchanged; bot lookup, website item IDs and sync adoption are separate Phase 2.

Latest branch codex/variant-retailer-id-phase1 extends b1d0ad7 and preserves ae53bb4's admin/shipment work. Freshly fetched origin/main remains at older 4769c08. Latest recorded Site is 31 and madikar-store v15; no existing function or Site deployment occurred in Phase 1. Older sections below are dated history; PROJECT_HANDOFF.md governs current work.

Start with PROJECT_HANDOFF.md for the latest checkpoint. Preserve both public signing keys, the bot help-line update and all local outputs.

These instructions are for any coding agent or editor working in this repo (Cursor, Claude Code, Codex, and others). Nothing here depends on a particular tool. Create new `codex/` work branches from the latest verified baseline identified in PROJECT_HANDOFF.md after inspecting current history; do not lose newer work by assuming main is up to date. The older `cursor/production-hardening` branch is retained as bot work history.

## Monorepo boundary

The owner chose one local/GitHub monorepo for the bot and website: `D:\cursor projects\Madikar taila` / `samskruthrml21-eng/Madikar-Taila`. The current ChatGPT Sites source is already in `website/`. Migration was published as version 13; the latest publication is version 24, including payments, policies, catalog availability and visual fixes. Sites retains a managed publishing repository; use `website/scripts/sync-to-sites.mjs` to mirror this source to a separate Sites checkout. Do not create a second GitHub repo or a replacement Site. Keep website changes scoped to `website/` and website-specific Supabase objects. Read `WEBSITE_HANDOFF.md` and `BOT_BACKEND_DO_NOT_TOUCH.md` first. The handoff records current state and local evidence that must be preserved.

The existing bot function directories under `supabase/functions/` are protected. The separate website function `madikar-store` v10 matches its local index.ts, checkout.ts and confirmation.ts (1 October). The copy at `website/server/supabase-store-function.js` is historical. Never run an all-functions deploy for website work.

## Runtime source of truth
The GitHub repo (`https://github.com/samskruthrml21-eng/Madikar-Taila.git`) and the live Supabase Edge Functions/database are both source of truth for the bot. The completed bot work is on `main`, and its function source was confirmed identical to the deployed source after the latest bot change. Treat a mismatch as a bug to investigate, not something to silently paper over.

Last inspected bot versions (see `WhatsApp_Flow_Project_Handoff.md` §5 for deployment history):
- whatsapp-webhook v94 (1 Oct)
- whatsapp-flow v50 (1 Oct)
- razorpay-webhook v33 (1 Oct; owner's message-text update preserved)
- sync-meta-catalog v11 (1 Oct)
- retry-order-handoffs v6 (1 Oct)

(Platform version counters drift upward without content changes on some of these — confirmed via `download` + `git diff` showing zero diff. Content parity is the signal that matters, not the raw number.)

On 30 Sep the owner explicitly requested synchronization of a manual live `razorpay-webhook` edit. The local file now matches the deployed v32 source, which appends the help phone line `Need help with your order? Contact us at 99722 67897.` to the payment-confirmation message. The shared module matched and was not edited. No deployment occurred. This change is included in the 1 October main consolidation; all deployed bot sources were rechecked against local files.

Order creation (`whatsapp-webhook`) and payment→order advancement (`razorpay-webhook`) are atomic via three Postgres RPC functions added in migration `20260924155516_add_transactional_order_and_payment_rpcs.sql` (`create_order_with_items`, `advance_order_to_processing`, `mark_payment_paid_and_advance_order`) — **live-tested successfully** on a real test order (24 Sep night), clean end-to-end.

Payment link + `order_details` expiry is now ~16 minutes (was 24h), matching Razorpay's 15-minute floor with a small margin; `razorpay-webhook` now handles `payment_link.expired`/`cancelled` (migration `20260924181608_add_expired_at_to_payments.sql`). **The expired/cancelled path has not yet been exercised by a real link.** This remains an outstanding bot test when bot work resumes.

The main menu includes `Note: You can always type "Hi" for the main menu`. After an address is selected, the bot sends `review_and_pay`, then the approved `change_address` (`en`) Flow template. A replacement address is accepted only for an order still in `pending_payment`; the selected address must be active and belong to that order's profile. Live order 135 confirmed address replacement, a subsequent live-mode payment, the `processing` transition, the payment-confirmation message, and the n8n handoff. See `WEBSITE_HANDOFF.md` for the current website handoff.

`meta-catalog-webhook` has been deleted (catalog sync is now manual-only).

## Before making bot changes
1. Inspect the current deployed Edge Function source (or the git copy — confirm they match with `supabase functions download --use-api` + `git diff` if in doubt).
2. Inspect the relevant live Supabase schema/data when applicable.
3. For WhatsApp Flow or WhatsApp Cloud API changes, consult the latest Meta documentation first.
4. Make one focused change at a time.
5. `esbuild`-bundle-check the edit, then deploy the complete function via the Supabase CLI (`--use-api`, no Docker on this machine), then verify the active version.
6. Re-download and `git diff` to confirm the repo still matches, then commit and push.
7. Test the real runtime path.

This development machine has no Docker and no `gh` CLI. Use `npx supabase ...` and plain `git`. Other machines may differ; don't assume those tools are missing everywhere, and don't assume they are installed here.

## Protected paths
Do not modify the working Address Flow JSON (`Latest Address Flow JSON_7.3.md`) unless a specific Flow-layer problem is demonstrated.
Protect:
- registration
- registration → main menu
- cart → address Flow → address attachment → review_and_pay → change_address → replacement address (while pending_payment)
- Razorpay Payment Link → review_and_pay
- Razorpay payment_link.paid → order/payment status
- Settings → Update Personal Information

## Current catalog architecture (manual sync only)
Meta Commerce Manager change → manually invoke `sync-meta-catalog` → `public.Product`.

The automatic webhook chain (`meta-catalog-webhook`) has been retired and the function deleted. Do not reintroduce automatic catalog webhook handling into `whatsapp-webhook` if this is ever revisited — it should stay a dedicated endpoint.

`sync-meta-catalog`:
- Uses Meta fields `retailer_id`, `name`, `description`, `url`. Maps `url` → `Product.product_link`.
- Upserts by `(catalog_id, retailer_id)`.
- Removes stale products after a successful full sync; skips stale deletion when Meta returns zero products.
- `verify_jwt=true` — only we call it, never Meta.

## Current Product schema
The Meta/bot fields are `id, created_at, name, retailer_id, description, product_link, catalog_id, updated_at`. The bot selects `retailer_id,name,description,product_link,catalog_id`, so keeping only `retailer_id` would break its lookup. Do not drop `product_link` while the current bot and sync still select/write it.

The website also uses `store_id, category, short_description, images, store_sort_order, store_active, store_name, store_product_link`. On 30 Sep, an additive migration added `slug, website_description, traditional_benefits, extraction_craft, ingredients_and_more`. A compatibility trigger synchronizes `website_description` and `short_description` until the website API/admin are updated. Existing slugs are unique lowercase URL segments; new Meta rows may leave slug null until website setup.

Website pack sizes and prices live in `ProductVariant`, linked to `Product.id`. The bot still uses the incoming WhatsApp order-item price. The current Meta sync does not populate website variants or prices.

The owner's later cleanup instruction superseded the initial decision to retain all hidden manual products. On 30 Sep, batch 1 + batch 2 + the owner's updated batch 3 were applied: 24 products and 25 variants absent from those files were deleted. The original seven oils and their 21 variants were explicitly retained, as was Mango pickle. Current totals are 76 Product rows, 90 variants, 59 website groups and eight visible products. There are 17 hidden Product lookup rows for extra Meta pack-size IDs; they have no `store_id` or slug and must not be activated as website products. The 69 CSV retailer IDs all resolve under catalog `1515875913870520`. No new columns were added during reconciliation.

All Product images use the existing `madikar-product-images` bucket. Full before/after snapshots, copied batch files, applied transaction, image inventory and the exact retailer-to-parent/variant mapping are in `outputs/catalog-reconciliation-20260930/`; start with `REPORT.md`. Live `madikar-store` v4 and `sync-meta-catalog` v10 matched tracked source during this review; `whatsapp-webhook` v93's lookup contract was inspected. Catalog reconciliation involved no Edge Function or website deployment. The later frontend recovery fix was published as Sites version 14.

Ensure all intended batch items are accepted in Meta before the next manual sync. Stale cleanup protects only `store_active` rows; missing hidden parent products can be deleted with their website variants. Do not automatically regroup or activate the separate Meta lookup rows. Future detail pages will use `/products/<slug>`; page routing is not implemented yet. See `PRODUCT_CATALOG_SCHEMA.md` for field purposes and the current mapping.

## Next website scope

The owner will continue in a new chat to display more retained products/categories and build separate `/products/<slug>` pages. There are 59 website groups across nine current categories, with 51 groups still hidden. Publish canonical website parents only, keeping the 17 bot lookup rows hidden. Reuse existing content columns and database variants; do not add columns, restore deleted seed products or break existing `/?product=<store_id>` links. Read the detailed continuation plan in `WEBSITE_HANDOFF.md` before editing.

Sites version 14 adds at most three attempts for transient catalog failures and a Try again button. Five tests in `website/tests/catalog-loading.test.mjs` passed; the live page displayed all eight currently listed products. The underlying intermittent Supabase database authentication failure (`401 PGRST303`, leading to website 503) is unresolved. Preserve the recovery behavior; investigate current logs before changing authentication. Website order RPCs were absent at the last schema inspection, so product-page work must not enable checkout incidentally.

## Current main menu (bot)
Only:
- Place a new order
- Settings

Do not reintroduce Order history unless explicitly requested.

## Current Supabase security posture
- `public.payments`: RLS **enabled** (fixed 23 Sep). `anon`/`authenticated` have **zero** privileges on any `public` table, including future ones (default privileges revoked too).
- `Product`/`Profile`/`orders`/`order_items`/`addresses`: RLS enabled, no policies (correct while only the service-role key touches these tables).
- Function search_path fixed on the two `updated_at` trigger functions.
- `whatsapp-flow` checks Meta's request signature on Flow endpoint calls (`FLOW_SIGNATURE_MODE=enforce` as of 24 Sep evening — rejects invalid signatures with HTTP 432; flipped after confirming `valid:true` on 50 consecutive real requests).
- Leaked-password protection is disabled — irrelevant until a staff front-end with real logins exists.
- Flow tokens are now HMAC-signed and verified (`FLOW_TOKEN_SECRET`) — see handoff doc §9/§14.

## n8n order handoff
`razorpay-webhook` sends the paid-order payload to `N8N_WEBHOOK_URL` inline; on failure, a `pg_cron` job (`retry-order-handoffs`, every 5 minutes) retries via the `retry-order-handoffs` Edge Function, up to 24 attempts. Tracked on `orders.handoff_sent_at`/`handoff_attempts`/`handoff_last_attempt_at`/`handoff_last_error`. n8n appends rows to a Google Sheet — this is a temporary Phase 1 measure until a staff front-end is built; keep the n8n workflow itself simple (no shared secret yet, by design).

## Region pinning
`whatsapp-webhook` and `whatsapp-flow` endpoint URLs (configured in the Meta App Dashboard) include `?forceFunctionRegion=ap-south-1` so they run next to the `ap-south-1` database instead of near Meta's US-based callers. Don't remove this without re-measuring latency.

## Test-only functions
None remain — `whatsapp-flow-key-register-test` and `test-order-status` (mentioned in older docs) no longer exist.

## Documents
Use these project sources together:
- `BOT_BACKEND_DO_NOT_TOUCH.md` — files, functions, and schema the WhatsApp bot depends on. Read this before any website or shared-backend work.
- `WEBSITE_HANDOFF.md` — current website work boundary, starting point, and verified bot state.
- `PRODUCT_CATALOG_SCHEMA.md` — current product fields, variants, visibility, slug decisions, and website content compatibility.
- `WhatsApp_Flow_Project_Handoff.md` — full current-state handoff, outstanding-work list, continuation prompt.
- `WhatsApp_Outbound_Message_JSON_Reference.md` — every outbound WhatsApp message contract, reconstructed from the current deployed source.
- `WhatsApp_Flow_Error_Prevention_Guide.md` — lessons learned, regression checklist, hard-coded values to confirm before launch.
- `Latest Address Flow JSON_7.3.md` — protected Flow JSON, do not edit casually.

`.cursor/` holds editor settings for Cursor only. Other tools can ignore it. It is not part of the bot runtime.

(The three `.docx` files previously listed here have been deleted — they were stale as of 23 Sep and are fully superseded by the three `.md` files above.)

Do not assume any document is newer than the live deployment. If they conflict, inspect the live deployment and treat it as authoritative, then update the doc.


## Standing checkout constraint — 30 September 2026

The owner explicitly requires that website work must never affect the working WhatsApp bot. Preserve bot handlers, shared code, secrets, configuration, RPCs, privileges and existing scheduled jobs. Website checkout has its own authenticated recovery and fulfilment path. Existing profiles and saved/default addresses must not be overwritten by guest checkout. Additive shared-schema changes require compatibility checks and regression verification before application. See `website/PAYMENTS.md` for the isolated website implementation and outstanding activation checks.

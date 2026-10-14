# WhatsApp bot backend — do not change these for website work

Last reviewed: 15 October 2026.

## Explicitly authorized Razorpay order-ID prefix — 15 October 2026

The owner requested the `order_` prefix for WhatsApp provider order IDs after the live-payment audit. Only razorpay-webhook v34 was deployed: it prefers payment.entity.order_id and normalizes a bare fallback. The complete deployed function/shared module match local source; only the ID extraction changed. Fourteen historical IDs were individually verified with Razorpay and corrected in a guarded one-column transaction. All other payment fields, orders/items, catalog data, RPCs/security and five other functions are unchanged. All 61 mocked tests and bundle/source/auth checks passed. No live payment/message was triggered. Read docs/plans/CATALOG_REFRESH_AND_ORDER_PREFIX_2026-10-15.md. User-facing ORD references and payment-method metadata are unchanged; further live pack testing is owner-deferred.

## Explicitly authorized variant lookup — 14 October 2026

The owner requested exact pack/payment mapping and explicitly approved deployment of the tested patch. whatsapp-webhook v95 changes only catalog-scoped ProductVariant/parent lookup and its call, retaining legacy Product and incoming metadata fallbacks. Incoming order prices, registration, address flows, payment links, messages and protected RPCs are unchanged. madikar-store v16 separately records variant retailer IDs in new website quotes with parent fallback. Full deployed source parity, 56 mocked tests, 94 live identity checks and unchanged database/security fingerprints are recorded in docs/plans/VARIANT_RETAILER_IDS_PHASE2_REPORT.md. Current counts: 94 mapped variants, 59 parents, 16 remaining lookup rows. This narrow authorization does not authorize other bot edits or the current full sync.

## Applied Phase 1 variant identity metadata (history)

ProductVariant.retailer_id is applied with 87 verified IDs and eight NULLs across 95 preserved variants; see docs/plans/VARIANT_RETAILER_IDS.md and its Phase 1 report. The owner deferred three newly generated Meta IDs. The superseded 14-hidden-row insertion was not applied. The bot still reads Product by retailer_id/catalog_id and falls back to incoming metadata; Phase 1 leaves that behavior unchanged.

Phase 1 verified unchanged parent retailer IDs, 17 lookup rows, all prior variant fields, orders/payments, protected RPCs, RLS/grants, settings/jobs and six existing functions. No existing function was deployed. Variant-aware lookup/manual sync is separate Phase 2 with legacy fallbacks and regression tests; it is not permission to rewrite checkout, payments, registration, address flows or messages. No per-item synchronous Meta requests or current full sync.

The Supabase project `faoomjgkofqrdajaftjd` (name `Whatsapp`, region `ap-south-1`) runs the Madikar Taila WhatsApp ordering bot. The Sites website also uses this Supabase project through its separate `madikar-store` function. Website work must add or change its own functions, tables, and policies. It must not edit, redeploy, rename, or "clean up" the bot pieces below.

The owner chose one local/GitHub monorepo for bot and website work. The existing Sites source has been migrated into `website/` and published back to the same Site; the latest website publication is version 24. That shared repository does not make the bot files below part of website work. The live madikar-store v10 source matches its own supabase/functions/madikar-store/ directory (1 October). See PROJECT_HANDOFF.md and WEBSITE_HANDOFF.md for the consolidated checkpoint.

The bot is live. A small edit can break registration, checkout, payment, or the order handoff. The repo copy of these functions is kept identical to what is deployed. Redeploying one of them from a partial or rewritten file has broken production before.

**Explicit owner-requested source synchronization, 30 Sep:** the owner manually edited live `razorpay-webhook` (reported v32) to append `Need help with your order? Contact us at 99722 67897.` to the payment-confirmation message. That full deployed source has been copied into the local repository; the shared module is unchanged. This was a download/parity update, not a deployment or authorization for further bot edits. Preserve it. The change is included in the main consolidation; live source parity was rechecked on 1 October. See PROJECT_HANDOFF.md.

## Edge Functions — bot only

| Function | What breaks if you change it |
|---|---|
| `supabase/functions/whatsapp-webhook/` | Incoming WhatsApp messages: registration, menu, catalogue, cart, address checkout, payment message |
| `supabase/functions/whatsapp-flow/` | Address Flow and the Settings pre-fill. Meta calls this directly |
| `supabase/functions/razorpay-webhook/` | Paid, expired, and cancelled payment links. This is the only proof of payment |
| `supabase/functions/sync-meta-catalog/` | Manual copy of the Meta catalogue into `public.Product` |
| `supabase/functions/retry-order-handoffs/` | Retries the paid-order handoff to n8n. Called by `pg_cron` every 5 minutes |
| `supabase/functions/_shared/order-handoff.ts` | Shared by `razorpay-webhook` and `retry-order-handoffs`. Changing it changes both |

`supabase/config.toml` sets `verify_jwt` for each of these. Meta, Razorpay, and `pg_cron` cannot send a Supabase JWT, so `whatsapp-webhook`, `whatsapp-flow`, `razorpay-webhook`, and `retry-order-handoffs` have `verify_jwt = false` and check the caller themselves. `sync-meta-catalog` has `verify_jwt = true` because only we call it. Do not flip these.

Do not add catalogue-webhook handling back into `whatsapp-webhook`. That path was removed on purpose.

`madikar-store` is not one of these bot functions. Its last-verified v4 source is in this repo under its own function directory. Re-inspect live source before editing it, and leave the five functions above alone.

## Other files

- `Latest Address Flow JSON_7.3.md` — the working WhatsApp Address Flow. Do not edit it unless a Flow-screen bug is demonstrated. The JSON deployed in Meta Business Manager is separate from this file; changing one without the other will not fix the live Flow.
- `supabase/migrations/*.sql` — already applied to the live database. Do not edit or reorder them. New website schema goes in a new migration.
- Postgres functions from those migrations, especially `create_order_with_items`, `advance_order_to_processing`, and `mark_payment_paid_and_advance_order`. Checkout and the payment webhook call them. They are granted to `service_role` only.
- `pg_cron` jobs `retry-order-handoffs` and `prune-cron-run-history`.

## Tables the bot writes

`public.Product`, `public.Profile`, `public.orders`, `public.order_items`, `public.addresses`, `public.payments`.

Row level security is on, and `anon` and `authenticated` have no privileges on these tables (including tables created later under the current defaults). The bot uses the service-role key inside Edge Functions. Do not add a permissive policy or grant so a website can read them with the anon key. That would expose customer orders, addresses, and payments. A website that needs this data should get its own access path, reviewed on its own, not a shortcut through these tables.

`public.Profile.id` references `auth.users`. The bot creates a hidden Auth user per WhatsApp customer. Do not delete those users or detach that foreign key as part of website setup.

`public.Product` is a catalogue cache. It does not store the price charged at checkout. Checkout uses the price on the WhatsApp order.

The live bot selects `retailer_id,name,description,product_link,catalog_id` from Product, and the sync writes those fields plus `updated_at`. Do not drop `product_link` or the other selected columns during website cleanup. Website-only content fields added on 30 Sep coexist with this contract. The `website_description`/`short_description` compatibility trigger preserves today's admin behavior. See `PRODUCT_CATALOG_SCHEMA.md` for the field map and variants.

After the owner-approved catalog reconciliation, Product has 59 canonical website groups and 17 additional hidden rows for variant-specific Meta retailer IDs. The latter have null `store_id`/slug and no standalone website variants. Keep them hidden when enabling other categories. Preserve the exact retailer-to-parent/variant mapping in `outputs/catalog-reconciliation-20260930/retailer-variant-mapping.json`. Future manual sync deletes missing Meta items and protects only active website parents, so inspect the accepted Meta catalog before invoking it.

## Secrets and URLs

Do not rotate, rename, or clear these as part of website work: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_FLOW_PRIVATE_KEY`, `FLOW_TOKEN_SECRET`, `FLOW_SIGNATURE_MODE`, `RAZORPAY_MODE`, the Razorpay test and live key and webhook secrets, `N8N_WEBHOOK_URL`.

`RAZORPAY_MODE` must stay exactly `test` or `live`. Any other value stops new payment links and makes `razorpay-webhook` return 500.

The Meta App Dashboard URLs for `whatsapp-webhook` and `whatsapp-flow` include `?forceFunctionRegion=ap-south-1`. Do not drop that query parameter.

## What website work can do

Add website source under `website/`, website Edge Functions under their own function directories, and new website migrations when needed. Do not deploy the bot functions while doing that. `npx supabase functions deploy` without a function name can publish every function in the repo; deploy only the intended website function by name.

Read `Project_Instructions.md`, `WhatsApp_Flow_Project_Handoff.md`, and `WhatsApp_Flow_Error_Prevention_Guide.md` before changing anything that is shared with the bot.


## Standing checkout constraint — 30 September 2026

The owner explicitly requires that website work must never affect the working WhatsApp bot. Preserve bot handlers, shared code, secrets, configuration, RPCs, privileges and existing scheduled jobs. Website checkout has its own authenticated recovery and fulfilment path. Existing profiles and saved/default addresses must not be overwritten by guest checkout. Additive shared-schema changes require compatibility checks and regression verification before application. See `website/PAYMENTS.md` for the isolated website implementation and outstanding activation checks.

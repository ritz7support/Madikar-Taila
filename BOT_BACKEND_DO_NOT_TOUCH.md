# WhatsApp bot backend — do not change these for website work

Last reviewed: 29 September 2026.

The Supabase project `faoomjgkofqrdajaftjd` (name `Whatsapp`, region `ap-south-1`) runs the Madikar Taila WhatsApp ordering bot. The Sites website also uses this Supabase project through its separate `madikar-store` function. Website work must add or change its own functions, tables, and policies. It must not edit, redeploy, rename, or "clean up" the bot pieces below.

The owner chose one local/GitHub monorepo for bot and website work. The existing Sites source has been migrated into `website/` and published back to the same Site. That shared repository does not make the bot files below part of website work. The live `madikar-store` v3 source has been retrieved and verified in its own `supabase/functions/madikar-store/` directory; it was not redeployed. See `WEBSITE_HANDOFF.md` for the migration state.

The bot is live. A small edit can break registration, checkout, payment, or the order handoff. The repo copy of these functions is kept identical to what is deployed. Redeploying one of them from a partial or rewritten file has broken production before.

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

`madikar-store` is not one of these bot functions. Its live v3 source is in this repo under its own function directory. Leave the five functions above alone when working on it.

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

## Secrets and URLs

Do not rotate, rename, or clear these as part of website work: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_FLOW_PRIVATE_KEY`, `FLOW_TOKEN_SECRET`, `FLOW_SIGNATURE_MODE`, `RAZORPAY_MODE`, the Razorpay test and live key and webhook secrets, `N8N_WEBHOOK_URL`.

`RAZORPAY_MODE` must stay exactly `test` or `live`. Any other value stops new payment links and makes `razorpay-webhook` return 500.

The Meta App Dashboard URLs for `whatsapp-webhook` and `whatsapp-flow` include `?forceFunctionRegion=ap-south-1`. Do not drop that query parameter.

## What website work can do

Add website source under `website/`, website Edge Functions under their own function directories, and new website migrations when needed. Do not deploy the bot functions while doing that. `npx supabase functions deploy` without a function name can publish every function in the repo; deploy only the intended website function by name.

Read `Project_Instructions.md`, `WhatsApp_Flow_Project_Handoff.md`, and `WhatsApp_Flow_Error_Prevention_Guide.md` before changing anything that is shared with the bot.

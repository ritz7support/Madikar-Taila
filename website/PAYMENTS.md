# Website checkout — updated 10 October 2026

Website checkout is enabled with **zero shipping**, approved by the owner on 30 September 2026. `public.store_checkout_settings.enabled=true` and `shipping_paise=0`; customers pay only the selected product total. The last verified Supabase RAZORPAY_MODE was test; read the current configuration before payment analysis. Repository consolidation does not change it. Real-money collection remains subject to the shared mode and live-payment verification. Bot functions, settings and secrets remain untouched.

## Payment flow

The website offers UPI only through Razorpay display configuration (Site version 21 onward). Shipping is zero. Version 24 hides the delivery-details header on verified success while retaining close/Continue shopping.

- Required fields: name, Indian mobile number, house/street, city, state, PIN and country (India). Email and area/landmark are optional. Both browser and server validate.
- Sites signs checkout requests with its existing private signing key. `madikar-store/checkout.ts` reads Supabase's `RAZORPAY_MODE` and corresponding `RAZORPAY_TEST_KEY_ID/KEY_SECRET` or `RAZORPAY_LIVE_KEY_ID/KEY_SECRET`. No Razorpay secrets belong in Sites or browser code. A session retains its original mode for verification after a mode change.
- The server calculates prices from canonical active Product/ProductVariant rows. Browser totals and supplied mode are never trusted. Each session uses a random UUID and 256-bit bearer token; only its hash is stored in the database. Customer details are kept in Supabase, not Razorpay notes.
- Match `Profile.whatsAppUserId` with `91` plus the entered mobile. Reuse existing profiles without updating their name/email. New customers get the bot-compatible hidden Auth identity and Profile. This is a guest lookup, not proof of phone ownership; no saved information is returned to the browser.
- A Razorpay order and a temporary checkout session exist before payment. Supabase `orders`, `order_items`, `payments` and the order-specific address are inserted together only after server verification of a captured Razorpay payment, matching order, amount and currency. The transactional RPC locks the session; repeated callbacks/webhooks return the same order.
- New website order references in both modes follow the existing WhatsApp pattern: `ORD-<Unix milliseconds>-<six uppercase hexadecimal characters>`, for example `ORD-1790878290172-9F6732`. Migration `20261008160704_unify_website_order_references.sql` changes only reference generation in `store_finalize_checkout`. Existing references are retained, including on repeated payment callbacks. The rollback-only SQL regression fixture is `supabase/tests/unified-order-references.sql`.
- `addresses.source='website_checkout'` identifies the submitted address. It is inactive and nondefault, so it does not replace or appear among the customer's bot-saved addresses. Existing and future bot inserts retain `source='whatsapp'` by default.
- The browser shows a verified payment popup with order/payment references, removes only purchased cart quantities, and returns home on close. `/?payment=true` is display state, never proof of payment. A browser refresh checks the saved session with the server. An uncertain payment blocks another payment until confirmed.
- Per-phone and per-edge-client limits protect profile/payment-order creation (10 new sessions/hour each). The Worker hashes the trusted `CF-Connecting-IP` header with its signing secret; missing edge IP uses a shared fallback limit. Verify this header is supplied by the hosting runtime during production readiness review.

## Confirmation and fulfilment

The website sends the approved WhatsApp template website_payment_confirmation (language en, no parameters or buttons) to the checkout phone number after a newly verified captured payment, in both test and live modes. The on-screen popup is retained. The bot's separate interactive order_status flow is unchanged.

Both test and live captured website payments send the existing n8n `order.paid` payload through `N8N_WEBHOOK_URL`, using the submitted customer/address and price snapshot. Website orders remain `paid` until the website handoff succeeds, then switch to `processing` together with `handoff_sent_at`. This prevents the existing bot retry job from claiming website work. Test-mode payments also trigger n8n and advance to `processing` after a successful handoff. Payloads include `payment_mode` and `is_test`; use those fields or `store_checkout_sessions.mode` to distinguish modes, not the order reference. Historical test references may start with `WEB-TEST-`; new references use `ORD-` in both modes. Both modes also queue the standalone website confirmation independently of n8n.

`store-checkout-recovery` is a separate five-minute database cron job. It authenticates to the website recovery endpoint with a private website token and atomically leases up to five sessions. It reconciles captured payments if the browser disappears and retries pending handoffs for both modes, with at most 288 attempts per stage. It does not change the bot's cron jobs. n8n receives a stable `Idempotency-Key`, but the existing workflow's handling of that header has not been confirmed; a network timeout after acceptance can still cause duplicate downstream rows. Monitor/deduplicate by `order_id`; checkout is already enabled. No n8n workflow was edited.

## Before real-money collection

1. Shipping is zero until the owner requests otherwise. Checkout is now enabled in the existing test mode. Confirm delivery coverage and complete the remaining live-payment checks.
2. In Razorpay, add the separate website webhook for `payment.captured` and `order.paid`: `https://faoomjgkofqrdajaftjd.supabase.co/functions/v1/madikar-store/razorpay-webhook`. Use the existing matching mode's webhook secret; do not replace the bot webhook or rotate shared secrets. Registration of this new endpoint has **not** been verified.
3. Verify automatic payment capture, hosting client-IP header, n8n deduplication and recovery with an approved end-to-end payment. No live charge or real customer message was made in implementation tests. Do not switch the shared `RAZORPAY_MODE` without considering the running bot.
4. Website settings are enabled. Do not change the shared payment mode without the owner’s direction and consideration for the bot. Razorpay refunds/disputes and automatic abandoned-session retention cleanup are not implemented in this phase.

## Protected bot boundary

Admin order stages are separate from `orders.status`: staff edit `fulfillment_status` only. As of 10 October, selecting Shipped requires a courier tracking ID, saved atomically in `orders.tracking_id` and displayed in order details. The database also requires tracking when setting Shipped manually. Tracking is retained on later stage changes; shipping this way sends no customer message. Admin payment labels use payment state and do not label processing orders as processing payments. `store_admin_orders_page` returns each 20-order page and its related records through the authenticated admin backend in one database request; it is executable by service_role only.

Always preserve bot functioning. Never redeploy the five bot functions, edit `_shared/order-handoff.ts`, alter bot RPCs/grants/jobs, rotate secrets or overwrite existing customer/default-address data as part of website checkout. Deploy only `madikar-store` by name. The old `website/server/supabase-store-function.js` and `website/db/orders_integration.sql` are historical and must not be deployed/applied.

Backend: supabase/functions/madikar-store/index.ts, checkout.ts and confirmation.ts. Migration: `20260930152024_website_checkout_sessions.sql` (Supabase-recorded version). Website-only function v10 (source parity checked 1 October), including the second public signing key from parallel work. Tests: `node --test supabase/functions/madikar-store/checkout.test.mjs` from the repo root; `node --test tests/*.test.mjs` from `website/`. The SQL verification fixture is in `outputs/website-checkout-20260930/verify-database.sql`; it rolls back all test rows and makes no external calls.


## Website WhatsApp confirmation

The private store_payment_confirmations outbox is populated only when a website session first becomes paid; no historical backfill is performed. Concurrent workers claim with row locks and a lease. Meta acceptance is recorded with its wamid (acceptance is not proof of handset delivery). Accepted messages are not resent. Explicit transient rejections retry via the website recovery job, up to eight attempts. Permanent failures stop. Network timeouts, inconclusive responses, expired worker leases, or failure to record acceptance are held as uncertain for manual review to avoid duplicate messages. These failures never block n8n or the payment popup. No bot functions, shared secrets, or bot jobs are changed.

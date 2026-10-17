# Payment Links, courier shipping and delivery notifications — 17 October 2026

Implemented on `codex/payment-links-shipping-delivery`, from `f6a5e04`, preserving the existing admin, variant identity, stock, routing and payment work. The owner requested these changes and edge-case testing; the scope includes the narrow bot changes recorded in `BOT_BACKEND_DO_NOT_TOUCH.md`.

## Published result

- Website: https://madikartaila.com, same public Site `appgprj_6ab742ddf3e48191911b4bb531bb0ca8`, version **35**. Sites source `a18d8236ea143242d704fd7e45b9395ac3b5bc93`; deployment `appgdep_6ad35e594508819192b9eebb4de5090b` succeeded. Canonical `website/` source was copied and verified into a freshly opened Sites checkout before packaging/push. GitHub and Sites commits are separate.
- Supabase `faoomjgkofqrdajaftjd`: `madikar-store` **v19**, `whatsapp-webhook` **v96**, `razorpay-webhook` **v35**, all retaining `verify_jwt=false` and their application authentication. Complete deployed sources match local, including relative modules.
- Applied migrations `20261017112915_website_payment_links` and `20261017112925_admin_delivery_notifications`. After website publication, activated `payment_method=payment_link` and `shipping_policy=courier-2026-10-17`. `enabled=true`, legacy `shipping_paise=0`, existing recovery credentials and shared `RAZORPAY_MODE=live` remain unchanged. The zero legacy field is not the new order's shipping charge; the server quote supplies that charge.
- `whatsapp-flow` v50, `sync-meta-catalog` v11 and `retry-order-handoffs` v6 retain their previous complete source hashes and authentication. `_shared/order-handoff.ts` is unchanged.

## Payment behavior

New website purchases use the same Razorpay **Standard Payment Links** API and UPI-only method options as WhatsApp. The browser shows a server-priced total, sends that accepted total, then opens the hosted payment link. Link creation rejects a changed total before profile/session/provider creation. Provider SMS/email notifications and reminders are disabled.

The browser's return URL and callback parameters are never payment proof. Reconciliation fetches the stored link, checks its unique reference, session/source metadata, INR amount and partial-payment setting, then fetches its captured payment and corresponding order. The captured payment supplies the canonical `order_` ID; if the link also supplies an order ID it must match. Amount/currency/identity and captured/paid state must agree before the existing atomic website finalizer is called through a new private wrapper. No test/live credentials or webhook signature checks were relaxed.

A checkout creates at most one link. An ambiguous create timeout is recovered by the unique `WEB<session UUID without hyphens>` reference; it is never resolved by blindly creating another link. Pending links can be resumed or explicitly cancelled. Cancellation requires a provider-confirmed unpaid terminal state; a payment winning the race is reconciled. The bag is consumed once only after verified payment. Legacy Orders API sessions retain their existing verification and recovery path.

Website payment confirmation and n8n handoff remain on the existing website path. The bot Razorpay webhook now restricts payment lookups to orders with `source=whatsapp`, preventing website link events from generating a second bot confirmation or handoff. No Razorpay dashboard webhook configuration was changed. The website endpoint supports `payment_link.paid` plus its older events; browser status checks verify directly, and the existing five-minute recovery job also reconciles new link sessions when the browser is closed.

## Courier rule and pack mapping

Both channels use the exact selected variant's `shipping_weight_grams`; the order retains the variant/retailer ID, quantity, weight and quote snapshot. Product prices, Meta IDs, weights and availability are not rewritten. WhatsApp retains the incoming Meta transaction price; website prices remain server-side variant prices.

| Maximum product load per box | Empty box weight |
| --- | --- |
| 1,000 g | 100 g |
| 4,000 g | 336 g |
| 6,000 g | 403 g |

Packs are kept intact, sorted heaviest first, and assigned to the first box load that can hold them within 6 kg. Each resulting load uses the smallest suitable 1/4/6 kg box. This deterministic packing rule supports multiple boxes; it does not model physical dimensions. Product and packaging weights are summed across the consignment before billing.

Shipping is ₹40 per billed kilogram, minimum ₹40. The inclusive cutoff is 200 g beyond a whole kilogram: **1,100 g and 1,199 g cost ₹40; 1,200 g costs ₹80**. Equivalently, billed kg = max(1, floor((packed grams + 800) / 1,000)). Examples: 4 kg product + 336 g box = ₹200; 6 kg + 403 g = ₹280; 7 kg across a 6 kg box and a 1 kg box = 7,503 g = ₹320.

This rule applies to new website and WhatsApp orders, including local orders. The website shipping policy was updated to remove the superseded local free/zero-shipping text. Existing orders and already-prepared checkout sessions keep their stored amounts. Missing/nonpositive/fractional weights, oversized individual packs and invalid quantities fail before a new payable order is created. A single pack over 6 kg requires store assistance.

**Owner action:** Mustard oil **1 L**, variant **18**, still has no weight. The owner will fill this through the admin panel. Until then, both paths block a new shipping quote containing that pack. All other **93 of 94** current variants have usable weights. A newly added Meta item must also have a verified variant mapping and weight before the bot can quote shipping.

## Admin fulfillment and messaging

The displayed final stage is **Delivered**, retaining the existing database value `completed`. Only a new `shipped → completed` transition queues the approved English `order_delivered` template, with named body parameter `order_number` containing the stored order reference. The recipient is the order's buyer phone, for either source. There is no historical message backfill.

A private RLS-protected outbox allows one delivery notification per order. Leases prevent concurrent claims; explicit transient rejections retry with a bounded attempt limit. Ambiguous network responses or expired send leases are held as uncertain for review instead of automatically sending duplicates. Meta acceptance is recorded with its message ID. Admin can check delivery-notification state and retry only a safe rejected/cancelled attempt.

The shipment Save operation uses one private RPC to update fulfillment and return the durable order plus notification state. The popup closes after that database save; Meta sending runs in the background. Failed saves leave the dialog open. Tracking validation, estimated days, optimistic concurrent-edit checks and payment-status separation remain.

## Verification

- **98 automated tests passed**, including shipping capacities/cutoffs, mixed boxes/indivisible packs, missing weights, exact retailer identities, invalid quantities, changed totals, link timeout recovery without duplicate creation, provider amount/currency/identity mismatches, partial/unconfirmed payments, duplicate events, cancellation/payment races, unsupported payment URLs, legacy checkout compatibility, signature/authentication checks, message payloads and notification failure handling.
- Fresh current database variants exercised through both actual checkout quote code and actual bot cart code with external calls mocked: **94 tested, 93 matching successful shipping totals and exact retailer IDs, Mustard 1 L rejected in both**. No provider/payment/message calls were made by this catalog-wide test.
- Three rollback-only SQL fixture suites passed against the live database: `payment-links-shipping-delivery.sql`, `unified-order-references.sql`, `shipment-notifications.sql`. They cover both payment modes, exact amounts/identities, atomicity, idempotency, shipping snapshots, correct delivery transition/buyer/reference, duplicate claims, accepted-message no-resend and private grants. Fixtures were rolled back; no network sends were invoked.
- Headless Edge browser checks used mocked payment/admin operations: quote and hosted-link redirect, forged return URL not treated as paid, verified confirmation consumes the bag once, cancellation retains the bag, shipment/delivery modal waits for the durable save but not message sending. No JavaScript errors or horizontal overflow at 320/390/768/1440 px; mobile screenshots inspected.
- All three changed functions bundle successfully. Final deployed source parity includes all imports. The other three Edge Functions and their auth settings match the baseline.
- Live read-only checks after activation: checkout ready/live/payment_link/weightShipping; catalog still 59 parents and 94 variants; all Safflower and Mustard packs plus Panchagavya quoted correctly, including the expected missing-weight 400. Invalid/empty quote rejected; cross-origin quote rejected with 403; unsigned backend, payment webhook and recovery requests rejected with 401. Home, product, admin, policy and checkout asset routes return 200.
- Post-deployment log window 11:29–11:43 UTC has no observed function HTTP 5xx. The two application errors correspond to the deliberate missing-weight and empty-bag rejection tests. Logs can lag; this is not a substitute for a real transaction.
- Before/after fingerprints match all existing Product, ProductVariant, orders, order_items, payments and pre-existing settings fields. Existing table RLS/grants and policies match. Only the intended existing routines (`store_claim_checkout_work`, `store_admin_orders_page`) and checkout recovery job changed; new private objects were added. No new link sessions, delivery notifications or shipping orders existed at the final verification snapshot.
- Security advisor reports the expected private RLS tables without public policies and the pre-existing leaked-password-protection warning. No authentication settings were changed; see [Supabase password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Ignored local evidence: `outputs/payment-links-shipping-20261017/` (fresh catalog, fingerprints, tests, browser screenshots, live checks and opened Sites source). Credentials remained in memory; no customer data or credential exports are committed.

## Verification limits and follow-up

No real payment, customer message or production fulfillment transition was initiated for this implementation. The owner's earlier ₹1 payments tested the older checkout, not this newly deployed payment/shipping path. Actual handset receipt of `order_delivered`, hosted UPI return behavior and a real purchase of a pack with a retailer ID different from its parent still need owner testing. Shipping is now charged in addition to any intentional ₹1 item price.

The packing calculation assumes combined consignment billing and uses weight rather than dimensions. Carrier volume constraints or separate per-parcel billing would require a new policy; do not silently alter the confirmed rule. The 93 known weights are owner-entered and preserved, not independently weighed.

Catalog sync remains deferred and must not be invoked. No Meta catalog field, CSV image, product price, historical order or customer default address was changed here. Mustard 1 L weight remains the immediate owner follow-up.

Official references reviewed: [Standard Payment Links create](https://razorpay.com/docs/api/payments/payment-links/create-standard/), [fetch by ID](https://razorpay.com/docs/api/payments/payment-links/fetch-id-standard/), [fetch all](https://razorpay.com/docs/api/payments/payment-links/fetch-all-standard/), and [Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks).

# Owner testing and admin feedback — 18 October 2026

This follows PHASE_ONE_REVIEW_FIXES_2026-10-18.md. Work started from main 901563b on codex/customer-test-polish. The owner requested verification of their live tests, payment-button alignment, a styled Delivered dialog, removal of one unused test identity, and toast feedback for admin saves. Real hosted-link payment tests 1–3 remain owner-deferred.

## Owner test verification

Read-only inspection covered the current database and function logs for 18 October 10:50–11:46 UTC (16:20–17:16 IST). The four new WhatsApp carts submitted at 17:01–17:06 IST all have exact variant retailer IDs, quantities, current prices, shipping weight snapshots and one matching pending payment record. No paid result was inferred from creating these links.

| Order ID | Items subtotal | Product grams | Box grams | Packed grams | Billed kg | Shipping | Link total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 203 | ₹2,622 | 6,380 | 503 | 6,883 | 7 | ₹280 | ₹2,902 |
| 204 | ₹1,975 | 4,550 | 403 | 4,953 | 5 | ₹200 | ₹2,175 |
| 205 | ₹1,726 | 5,010 | 403 | 5,413 | 6 | ₹240 | ₹1,966 |
| 206 | ₹3,700 | 9,100 | 806 | 9,906 | 10 | ₹400 | ₹4,100 |

Order 203 uses a 6 kg and a 1 kg box; order 206 uses two 6 kg boxes, with intact packs. Calculations independently checked line totals, pack identities, summed weights, packaging, the inclusive 200 g cutoff and ₹40/kg against saved quotes and logged Razorpay creation amounts. The previous-night WhatsApp order 192 (₹2 items + ₹40 shipping = ₹42, 1,020 g packed) also passes; its unpaid link expired normally. The observed older website order 191 (₹3,895 + ₹320 = ₹4,215, 8,057 g packed) passes stored-data reconciliation; this is not a claim that the newly requested browser/handset tests were completed.

- Website cancellation: the owner's 16:33 IST checkout is terminal `payment_resolution=cancelled`, total ₹41 including ₹40 shipping, with no order/payment IDs. The provider cancellation webhook was received; the bot endpoint safely leaves website sessions to the website flow. We did not reopen a real payment link or create/pay/cancel any additional link.
- Delivered: order 147, reference ORD-1790823412567-7BD24F, is Completed. Its one delivery outbox row is Sent, first attempt, accepted by Meta at 16:42:57 IST. The owner confirmed Cancel sent nothing and accepting sent the message. Production has no audit row for cancelling a browser dialog; no-write cancellation is also verified with mocks.
- Stock: Groundnut 1 L / variant 2 has revision 2, synced revision 2, status Synced, desired and read-back availability both In stock at 16:47:16 IST, no error. The owner confirmed unavailable blocking/restoration. The queue retains the current revision, not a permanent event history for the earlier out-of-stock revision.
- Personal details: the owner's existing WhatsApp profile contains the current name and email, and a new active address was saved at 17:07:43 IST. Signed Flow requests and bot responses succeed. The profile updater does not advance `Profile.updated_at`; the timestamp cannot prove the exact time or before/after values of the personal-details edit. No extra personal details are copied into this report.
- Logs: 113 function HTTP requests in 11:00–11:46 UTC returned 200; in the wider window there were 23 valid Flow signature checks, 17 successful bot sends and zero error/failed/mismatch/rejected application-log markers. This is evidence for the inspected window, not a guarantee about unexercised scenarios.

## Requested test-number reset

The exact owner-named phone had a separate unused Profile and matching hidden `wa_…@whatsapp.local` Auth identity, with zero orders, saved addresses, checkout sessions, active Auth sessions or Storage objects. A guarded transaction removed that Auth identity and its cascading Profile only. Exact UUID, phone and synthetic-email guards were checked again in the transaction; other catalog/profile/order/item/payment/address/session row fingerprints remained identical. A subsequent read confirms both target records are absent. No customer's order/payment history was deleted, and no WhatsApp message was sent by the agent. The owner can now use this number for the website-first/new-number registration test.

## Website changes

- Resume secure payment is vertically/horizontally centred with a 49 px minimum height and wrapping-safe padding.
- Delivered uses the same styled HTML dialog treatment as Shipment details, with the order reference, Cancel and Mark Delivered. It focuses Cancel initially, supports Escape, leaves the previous status unchanged until success, prevents double submissions and closing while saving, and displays save failures inside the dialog. Backend notification scheduling and deduplication are unchanged.
- Admin writes show a dismissible toast only after successful JSON/server responses. Product/draft/pack/photo/stock/order updates and notification/sync retry requests are covered. Read-only navigation/polling does not produce save toasts. Failed/ambiguous responses show error or “Save not confirmed” feedback, preserving existing inline errors. Toasts use textContent, a polite live region, and a seven-second dismissal timer paused by focus/hover.
- Notification copy distinguishes saved/queued work from Meta acceptance; acceptance does not claim handset delivery. Stock copy points staff to the actual Meta sync result; image upload reminds staff to save the product.

## Verification and boundaries

122 automated tests pass, including dialog cancel/Escape, rapid cancel/reopen, one request on repeated submissions, stale-save failure, server-confirmed toasts, rejected/network/malformed responses, queued/accepted/uncertain notification wording and timer dismissal. Desktop 1366 px and mobile 390 px mocked browser checks verify alignment, bag preservation on cancellation, dialog behaviour, toast placement/dismissal and no browser alerts or page errors. Worker build passes. Evidence is in ignored outputs/customer-tests-20261018/.

No Edge Function, shipping policy, price, retailer mapping, Meta catalog item, payment rule, security setting or customer message was changed by this work. The only production database mutation is the expressly requested unused test-identity removal. Existing payments and orders remain preserved. Admin shared-code authentication remains owner-deferred. Full catalog sync remains prohibited.

First three real-payment tests and the reset-number registration test remain pending. Website webhook dashboard registration/event subscriptions remain unverified. Combined-parcel courier billing still needs carrier confirmation; no packing-policy change was made.

## Publication

Published on the same public Site at https://madikartaila.com: version 39, Sites source 2e1091a80e32da5421fb2c76bb20d9ce153b706f, saved version appgprj_6ab742ddf3e48191911b4bb531bb0ca8~appgver_b4ff20da1b048191aa8f9301dd491448, deployment appgdep_6ad4b5af9f6881918c93177dc6d92662 succeeded. Runtime assets match the verified local source. Publication metadata is recorded in GitHub after packaging; runtime source is identical.

All six Supabase function versions, bundle hashes and JWT settings remain the prior checkpoint: madikar-store 21, whatsapp-webhook 97, whatsapp-flow 51, razorpay-webhook 36, retired retry-order-handoffs 7 and sync-meta-catalog 11.

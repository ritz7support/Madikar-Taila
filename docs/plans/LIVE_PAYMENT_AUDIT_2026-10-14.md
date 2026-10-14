# Live payment verification — 14 October 2026

**Subsequent owner-requested work, 15 October:** the CSV has now been refreshed from all 94 items at 23:57 IST, and razorpay-webhook v34 plus a provider-verified 14-row historical correction fixes the missing `order_` prefix. Missing payment-method metadata remains separate. The additional live pack test is owner-deferred. See [the follow-up report](CATALOG_REFRESH_AND_ORDER_PREFIX_2026-10-15.md). The findings below preserve the original audit window.

Both owner-performed ₹1 purchases completed successfully. This audit correlated Supabase records and runtime logs with read-only Razorpay payment/link/order responses. No customer message, order, payment, refund, price change or existing function deployment was triggered by the audit.

Log window: **23:25–23:42 IST** (17:55–18:12 UTC). Fresh Meta/Razorpay snapshot: **23:43:29 IST**. The findings below apply to these two purchases and this inspected window.

## Verified transactions

| Channel | Order | Exact pack / retailer ID | Amount | Result |
|---|---|---|---:|---|
| WhatsApp | 169 / ORD-1792000717696-FD6AE6 | Safflower Oil 500 ml / adk09bs27q | ₹1 / 100 paise | Razorpay captured, database paid, order processing |
| Website | 170 / ORD-1792001181671-188CD7 | Coconut Oil 200 ml / 7bcdpj5v7b | ₹1 / 100 paise | Razorpay captured, database paid, order processing |

Both provider payments are UPI, INR 100 paise, captured=true, with zero refunded amount and no provider error. Both orders have one item at quantity one and one matching paid payment record. Item totals, subtotal and total agree; shipping and discount are zero. No duplicate database records were found for either provider payment ID.

### WhatsApp order 169

- The deployed v95 bot performed the ProductVariant lookup, then the atomic order/items RPC. The stored name is Safflower Oil (500 ml), with exact retailer ID adk09bs27q.
- The review-and-pay payload uses that same retailer ID, size, quantity one and 100-paise item/total amounts. The live payment-link creation request was 100 paise. Razorpay reports that link paid for 100 paise with the matching order reference.
- The signed `payment_link.paid` event was handled in live mode. Payment 57 is paid, and the order advanced to processing. The paid webhook returned HTTP 200.
- The payment-received/order-status message was accepted by Meta with HTTP 200 and a message ID on attempt one, at approximately 23:29:49 IST. The stored sent marker is present.
- n8n returned success on attempt one; the handoff timestamp is present and last error is null.
- The selected saved address exists, belongs to the order's profile, and remains active/default with source whatsapp.

### Website order 170

- The live-mode checkout session stores variant ID 9, parent ID 3, retailer ID 7bcdpj5v7b and 100-paise unit/total amounts. The finalized order item retains that exact identity and price.
- The session, payment record and Razorpay payment/order IDs agree. Razorpay reports captured UPI payment and paid order, amount_paid=100, amount_due=0 and one payment attempt. The database payment method is upi.
- The order was finalized at approximately 23:36:21 IST. Session status is paid; order/fulfillment status is processing; no session error remains.
- The website_payment_confirmation record is sent, accepted on attempt one at approximately 23:36:23 IST, with a Meta message ID and no error.
- n8n handoff completed on attempt one at approximately 23:36:22 IST. Both session and order have a success timestamp.
- The website address exists and belongs to the order's profile, while remaining inactive/nondefault with source website_checkout. It has not replaced the bot's default address.

## One existing bookkeeping defect

For WhatsApp payment 57, `payments.provider_order_id` contains `TnsZYkxChC8upP`, while Razorpay's canonical ID is `order_TnsZYkxChC8upP`. Its payment_method is also null although Razorpay confirms upi. The provider payment ID, payment-link ID/reference, amount and paid state are correct.

This is pre-existing behavior: among 34 earlier paid WhatsApp payments, 13 have non-null provider order IDs without the order_ prefix, and all 34 have a null payment method. The current Razorpay handler prioritizes the webhook order entity's ID before payment.entity.order_id and does not pass the method to the paid-transition RPC. That handler/RPC were not changed by the variant-ID patch. The current WhatsApp success path uses the payment/link/reference IDs, so these metadata defects did not prevent capture, confirmation or handoff; a later provider lookup/reconciliation using the malformed order ID could fail.

Recommended separate repair: preserve the canonical Razorpay order ID and payment method during the paid transition, with focused regression coverage and provider-verified, bounded cleanup of historical metadata if requested. No live metadata was edited during this audit.

## Logs and limits of the evidence

All **42 recorded Edge Function requests** in the inspected window returned HTTP 200: 28 whatsapp-webhook v95, five whatsapp-flow v50, one razorpay-webhook v33 and eight madikar-store v16. The 45 application log entries contain no error/warning, failed operation, amount mismatch or missing variant lookup. Observed Flow signatures passed with enforcement enabled.

Meta acceptance and saved sent markers establish successful submission of both confirmations. The current bot does not persist delivery/read receipts, so handset delivery/read is not independently established by these logs. n8n acceptance is established; the resulting Google Sheet row was not independently inspected. The successful website callback path is verified; this purchase does not separately prove closed-browser/webhook recovery, refunds, expired links or all mixed-pack carts. Shipment messages correctly have no jobs yet because neither order has been marked shipped.

Both purchased packs happen to share their parent Product's legacy retailer ID. The bot log proves the new variant lookup ran, and the website session records variant ID 9; however, these two purchases do not constitute a live payment test of a non-default pack with a different retailer ID. All 94 pack identities were already covered by live read-only lookup checks and mocked payment preparation in the Phase 2 report. No additional paid test was initiated here.

Existing bot logs include personal details and signed Flow tokens. Raw messages/tokens were not copied into the committed report or local sanitized evidence. A separate logging-hygiene change should redact them without altering the working checkout flow.

## Current catalog and prices

The complete Meta refresh returned **94 unique items across three pages**, with matching before/after product_count. Extra Panchagavya item dg4i4tvblo is absent. All 94 current Supabase variants have matching retailer IDs in Meta, and all 94 current prices agree across the two systems.

- Mustard 200 ml is now ₹90 in both systems (Meta was ₹1).
- Jaggery 1 kg is now ₹85 in both systems (Meta was ₹70).
- Four intentional ₹1 packs remain in both systems: Groundnut 500 ml, Safflower 500 ml, Coconut 200 ml and Sunflower 500 ml. The go-live checklist has been updated.

The CSV exported at 22:39:34 IST is a historical snapshot: it still has the removed Panchagavya row and the earlier Mustard/Jaggery prices. **Do not upload that older CSV unchanged.** A fresh full export is needed before using it to update the current catalog; this audit did not overwrite the dated CSV.

## Preservation and evidence

The temporary signed, expiring GET-only reader fetched only the fixed catalog and these two existing Razorpay payments plus their relevant link/order. Credentials remained server-side; no secret was returned. The reader was removed afterward. The original six deployed functions retain their versions, hashes and authentication settings; no runtime/database/Meta changes were made by this audit.

Sanitized local evidence is in ignored outputs/live-payment-audit-20261014/: database-and-logs.json, meta-snapshot.json, verification.json and the comparison script. Payment IDs are retained there for traceability; customer details, flow tokens, payment-link URLs and credentials are excluded. The prior checkout/payment tests remain valid; no code changed in this audit.

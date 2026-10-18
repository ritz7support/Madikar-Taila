# Phase-one review fixes — 18 October 2026

## Owner decisions and scope

The owner authorised focused fixes after the independent Claude review, explicitly deferred admin-token authentication changes, and confirmed that the n8n / Google Sheet fulfilment handoff is retired. Supabase admin Orders is now the fulfilment workspace. Payment confirmations have always been sent directly by Supabase to WhatsApp; n8n was a separate sheet integration.

Work started on `codex/phase-one-review-fixes` from main `2d15d94`. This report supersedes older handoff descriptions of n8n as an active dependency. Historical migration files, handoff markers and older dated reports remain as history.

## Implemented

- Removed the n8n call from both payment channels. The old shared handoff exports are inert, the public retry endpoint returns HTTP 410 without database or external calls, and its cron remains disabled. The legacy completion RPC refuses writes. New verified website payments atomically create Processing orders, line items, payment records and the existing confirmation queue without waiting for a sheet. Existing historical orders and markers were not rewritten or replayed.
- Website payment-link creation distinguishes an explicit provider validation rejection from a timeout, server failure or duplicate-reference ambiguity. A definitive rejection is persisted and allows a fresh checkout; ambiguous creation retains its reference and hold without another create POST. Provider-confirmed cancellation/expiry stops routine polling. A later paid webhook can still invoke full payment verification. Terminal handling never treats a browser return or missing lookup alone as payment evidence.
- New website guest Profiles retain the shared hidden identity with name/email NULL. Customer-entered details stay on the checkout and order-specific inactive address. Admin website-order summaries use the order recipient name, so blank bot names do not hide the buyer name. Existing Profiles/default addresses are untouched; a phone's WhatsApp owner still completes registration. Payment is not treated as proof of phone ownership.
- Removed full outbound payloads, recipient numbers, decrypted Flow data, Flow tokens and raw exception content from routine bot logs. Responses no longer reflect raw webhook exceptions. Diagnostic status and internal record IDs remain. Earlier logs were not deleted.
- Flow requests always require Meta signatures. Identity lookup requires a valid, unexpired HMAC token; unsigned legacy tokens, request-body phone identities and old address-test fallbacks are removed. Signed checkout tokens must match the order's bound phone. Address completion rejects legacy token shapes and retains sender/order/address ownership checks. The approved Flow JSON and outbound message structures are unchanged.
- Set only the legacy checkout setting `shipping_paise` to NULL. The active `courier-2026-10-17` policy and quoted charges are unchanged; loss of that policy now disables checkout rather than silently restoring zero shipping.
- Added a confirmation before a new admin Delivered transition, explaining that it requests a WhatsApp delivery message. Cancelling leaves the order unchanged. Existing message deduplication, uncertain-send holds and the explicit historical-send button remain.

Migration: `20261018034139_retire_n8n_and_harden_checkout.sql`. The additive session `payment_resolution` column records `creation_rejected`, `expired` or `cancelled`. Existing sessions begin with NULL; existing payment snapshots are preserved. Recovery excludes paid sessions and terminal unpaid sessions. Private grants, RLS and signature verification remain intact.

## Verification

- All six deployed sources matched the repository before editing. All six were downloaded and matched again after the targeted rollout.
- 115 offline tests pass, including real cryptographic Flow request/response round-trips against mocks, tampered/expired/legacy identities, spoofed phone fields, log redaction, explicit create rejection, duplicate-reference ambiguity, uncertain timeout, cancellation/payment races, late payment verification, channel isolation and no n8n sends.
- The migration and three SQL suites passed together in one rolled-back transaction before application. The payment-links/shipping/delivery, unified-reference and review-hardening suites passed again after application, with fixture data rolled back and no provider calls.
- Desktop 1366 px and mobile 390 px browser checks use mocked checkout/admin endpoints: rejected requests release the session and preserve the bag; uncertain requests retain their session; declining Delivered sends no write, accepting sends one. All five changed function bundles and the website Worker build pass.
- Fingerprints match before/after for all Product, ProductVariant, orders, order_items, payments, Profile and addresses rows. Existing prices, weights, mappings, availability and order history are preserved.
- Security advisors show the same existing informational private-table RLS notice and leaked-password-protection warning. No new advisor category was introduced. Existing admin token and both signing keys are unchanged.
- Evidence is in ignored `outputs/review-fixes-20261018/`. No real payment, customer message, Meta catalog write, full catalog sync, historical reconciliation or destructive data cleanup was performed.

## Deployment

The migration is applied. Full source parity is verified for madikar-store v21, whatsapp-flow v51, whatsapp-webhook v97, razorpay-webhook v36 and the retired retry-order-handoffs v7. sync-meta-catalog remains v11 with its original content and JWT setting. All five changed functions retain verify_jwt=false and their applicable request-signature checks; the retired endpoint simply rejects use.

Website version 38 is published on the same public Site at https://madikartaila.com. Sites source: `45b4f88f7bfcf7fc34e450ed6bb19e11042567d0`; deployment `appgdep_6ad443cdd9688191a87c23e044d2e7c3` succeeded. Version 37 was saved but never deployed, superseded by the guest recipient-name display fix. Deployed runtime assets match local source. The final verification-count/provenance documentation was updated in GitHub after this publishing snapshot; runtime is identical.

## Remaining review items

- Admin authentication is expressly deferred by the owner. Do not rotate the shared code or remove team links without a later instruction.
- Four deliberate ₹1 variants remain: Groundnut 500 ml, Safflower 500 ml, Coconut 200 ml, Sunflower 500 ml. The owner must choose the real prices; this pass does not invent prices or update Meta/CSVs.
- Identify the second signing key's owner before removing it. Public signup configuration, additional security headers, general retention/monitoring policy and hypothetical cart-position/money changes remain separate work.
- Keep the confirmed shipping rate, 200 g threshold and packing algorithm. Confirm real multi-parcel billing and physical packing before attempting a cheaper split; changing it now would alter customer charges.
- Confirm the website Razorpay webhook registration and exercise a real hosted-link purchase, closed-browser/handset return and notification receipt. Automated checks cannot prove handset delivery. Existing older paid orders remain visible in admin; no obsolete sheet retries are needed.

Provider references consulted: [Razorpay Standard Payment Links](https://razorpay.com/docs/api/payments/payment-links/create-standard/), [Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks). Meta's endpoint documentation returned HTTP 429; the existing signed/encrypted protocol was preserved and cryptographically regression-tested.

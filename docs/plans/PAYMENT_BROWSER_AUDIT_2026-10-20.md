# Website payment and closed-tab audit — 20 October 2026

## Evidence

The owner confirmed the affected website payment was order 209, `ORD-1792435502796-51AA5E`, ₹41, and the checkout phone ending 7619 was the intended WhatsApp recipient. Logs were queried for 19 October IST and 20 October IST separately (UTC windows starting 18 October 18:30 and 19 October 18:30). Day summaries ran through 20 October 08:10 UTC; detailed error/payment searches through 08:15 UTC. Database sessions, orders, payments, confirmation outbox, cron runs and deployed source were inspected.

| Event | Time, IST on 20 October |
| --- | --- |
| Website checkout created | 00:07:48.643 |
| Stored provider payment timestamp | 00:08:24 |
| Razorpay paid webhook received | 00:08:26.025 |
| WhatsApp handler logged website link as unknown | 00:08:26.705 |
| Recovery created paid order 209 | 00:15:02.769 |
| Meta accepted website confirmation, attempt 1 | 00:15:04.574 |

The recording delay was about 6 minutes 39 seconds. The registered `/razorpay-webhook` received the event promptly, but its WhatsApp-only lookup ignored the website's `WEB…` reference. No request to `/madikar-store/razorpay-webhook` appeared in the queried logs. Scheduled recovery eventually finalized payment. HTTP 200 alone did not prove successful website webhook handling.

The website purchase remained ₹1 for Safflower 500 ml plus ₹40 shipping, as quoted at purchase. Its current price was ₹190 at inspection; historical amounts were not repriced. Payment 87 and order 209 totals agree, with canonical provider IDs and Processing status. There is one corresponding website order/payment.

The other paid test was WhatsApp order 208 (`ORD-1792434590703-2F3DEF`), ₹900. Payment 86 was recorded at 00:01:22.724 IST and its first confirmation succeeded at 00:01:23.602. WhatsApp order 207, ₹1,516, remained unpaid and expired. The ₹770 website link from 19 October 21:32 IST was cancelled without a paid order. The new-number ₹230 website checkout on 20 October was pending at initial inspection.

The daily function-request summaries contained 661 requests, all HTTP 200. Detailed application logs identified the ignored website payment, with no logged application errors/failures in the selected windows. The website Worker error sample was dominated by unrelated 404 scanner requests; it is not a complete historical checkout trace.

## Receipt and registration limits

The website confirmation outbox records one Meta acceptance and a wamid, with no rejection/error. The old WhatsApp webhook ignored `statuses`, so later sent/delivered/read/failed events were discarded. Handset delivery and the missing message's rejection reason cannot be established from retained records. No old confirmation was resent or marked delivered.

Website confirmations use the approved `website_payment_confirmation` English template; WhatsApp purchases use an interactive `order_status` receipt tied to their native WhatsApp order. This release preserves both formats. It does not turn the website template into a native order receipt.

The owner reports the website-first/new-number → “Hi” test works. The new guest Profile still had no trusted name at inspection, consistent with requiring WhatsApp registration. This is owner-confirmed behavior, not an independently observed completed registration.

## Fixes

- The registered Razorpay handler recognizes signed `payment_link.paid` events with the exact website reference format and valid link ID. It forwards the original body/signature to the website verifier and waits for acknowledgement, without bot paid writes or bot messages.
- The website still verifies HMAC/mode and fetches the provider link, payment and order before its existing atomic finalizer. Pending capture returns 503. Forwarding failures/unknown associations return retryable failure rather than silently acknowledging. Duplicate finalization remains idempotent; scheduled recovery stays as fallback.
- Checkout identity now persists in localStorage alongside the bag. Existing open-tab sessionStorage checkouts migrate. No address, phone or provider secret is stored. Success still requires server verification.
- Purchased quantities and the checkout completion marker share one atomic cart write. Web Locks serialize updates across supported tabs; repeats/reloads cannot subtract twice, extra quantities remain, stale tabs read the current cart, and storage failures do not mark consumption successful.
- Verified, expected-account Meta status callbacks log a SHA-256 message-ID correlation hash, status and numeric error code. No raw wamid, recipient, error message or message body is logged. These are function-log diagnostics, not admin badges or automatic resend rules. Correlate by hashing the outbox `message_id`, without printing/decoding it.

Clearing browser storage or changing browser cannot restore checkout identity. Identity already lost by closing an old tab before this release cannot be reconstructed from its remaining cart; old leftover quantities may need manual removal.

## Validation and release

130 automated tests passed: both modes, signatures, unchanged bot paid/duplicate/terminal paths, forwarding failures, pending capture, closed-tab restoration, legacy migration, storage failure, duplicate responses, two-tab consumption and diagnostic privacy.

Mocked Edge browser checks at 1366 and 390 px passed: close pending tab, change mocked server status to paid, reopen two tabs, consume once, preserve extra quantity, reload/dismiss, no script errors/overflow. External requests were blocked. Three changed functions passed esbuild checks. Every downloaded file matched local source before editing.

No database migration, direct data mutation, real charge, provider event replay or customer send was used. Catalog, shipping policy, historical data, n8n retirement, admin authentication and full catalog sync remain unchanged.

Published to the same public Site as version 40, source commit `2eed834673b4d42151e9ab739d45190f6ccd69c2`. Deployment `appgdep_6ad724f18d0c81919244549ee981f27b` succeeded at 20 October 08:23:32 UTC. Both live changed browser assets match local source. Live checkout configuration remains ready, Payment Links and weight shipping enabled.

Deployed functions: `madikar-store` 22, `razorpay-webhook` 37, `whatsapp-webhook` 98. All deployed files match local source. All three still reject unsigned webhook requests with 401. `whatsapp-flow` 51, `sync-meta-catalog` 11 and retired `retry-order-handoffs` 7 have unchanged hashes/auth settings.

Before/after row fingerprints match for 75 Product rows, 94 variants, 25 Profiles, 166 orders, 256 order items and 61 payments. The security advisor reports the existing private RLS-without-policies information and the previously deferred [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); this release does not modify either.

Real payment-to-phone receipt delivery after this release remains untested. The next owner website payment should be checked for prompt webhook finalization and its confirmation's hashed status callbacks. Do not claim the old missing receipt is resolved, and do not replay an old accepted send without explicit owner direction.

## References and evidence

- [Razorpay webhook retries and duplicates](https://razorpay.com/docs/webhooks/best-practices/)
- [Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks)
- [Meta status payload reference](https://www.postman.com/meta/whatsapp-business-platform/folder/fuaee8l/statuses-object)
- [Supabase changelog](https://supabase.com/changelog): reviewed; the announced legacy TLS cipher removal does not require a change to this runtime.

Private evidence: ignored `outputs/payment-audit-20261020/`. Do not commit raw customer snapshots, tokens or webhook bodies.

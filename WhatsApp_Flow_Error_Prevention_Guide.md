# WhatsApp Flow App — Error & Prevention Guide

Last updated: 24 September 2026. Supersedes `WhatsApp_Flow_Error_Prevention_Guide_Updated_23Sep2026_v6.docx` (deleted — it was stale).

## 1. Product-name lesson

`order_items.product_name` can be empty; `review_and_pay` then falls back to `product_retailer_id`. A mandatory Meta Catalog lookup per checkout item was tried once, failed in testing, and was reverted — the current checkout intentionally does **not** call the Meta Catalog API per order item. `public.Product` is a local cache only; transaction price always comes from the incoming WhatsApp order item, never from `Product`. If a local `Product` row is missing for a `retailer_id`, the webhook logs it and continues using incoming order metadata rather than adding a synchronous Meta lookup to checkout.

## 2. Address Flow protected baseline

Address Flow v7.3 (`Latest Address Flow JSON_7.3.md`) is a working baseline: saved-address selection, new-address creation, pending-order association, and the `review_and_pay` handoff are all confirmed working in real WhatsApp. Do not modify it while debugging unrelated functionality. For any Flow-layer change, check the latest Meta documentation and exact component/action schema before editing the JSON. NavigationList has a hard cap of 20 list-items — current saved-address counts (max seen: 9) are well under that, but this is worth re-checking periodically.

## 3. Flow debugging lessons

- Use Form-level `init-value`s to pre-populate `TextInput` fields, not per-component `init-value` when the Flow contract requires Form-level initialization.
- A terminal screen can use `complete` to close a Flow when no intermediate success screen is needed; final submitted data then arrives through the WhatsApp `nfm_reply` path, **not** as a `data_exchange` response from the Flow endpoint. A `SUCCESS` screen is not inherently required.
- Use `navigate` for deterministic local screen navigation, `data_exchange` for backend interaction.

## 4. Registration/main-menu lesson

A past regression showed that a successful registration Flow + Profile update does not automatically send the main menu — this had to be explicitly reconnected after the Profile update in the `nfm_reply` handler. The fast-registration implementation (send the template immediately, create the Profile/Auth user in the background via `EdgeRuntime.waitUntil`) must stay intact and not be redesigned for unrelated changes. When changing main-menu buttons, verify both the outbound payload **and** the matching `button`/`button_reply` handler — there are two separate code paths for the same logical tap (plain WhatsApp "button" messages and interactive "button_reply" messages), and both must be updated together.

## 5. Deployment lesson

Never deploy reconstructed or partial Edge Function source — a past deployment failed before activation because of a source/syntax error introduced this way. Always retrieve the full deployed source (or the git copy, once confirmed identical), make the smallest focused edit, deploy the complete function, and verify the active version. **Since 23 Sep**, deployment goes through git + the Supabase CLI (`--use-api`, no Docker on this machine) instead of pasting reconstructed source directly:
```
npx supabase functions deploy <name> --project-ref faoomjgkofqrdajaftjd --use-api --no-verify-jwt
```
Before trusting a manual edit, esbuild-bundle it first to catch syntax/import errors without spending a deploy:
```
npx esbuild <entry.ts> --bundle --format=esm --platform=neutral --external:jsr:* --outdir=<tmp>
```
After deploying, re-download with `supabase functions download --use-api` and `git diff` to confirm the repo still matches what's live.

## 6. Payment lessons

- Razorpay Standard Payment Links; UPI enabled, card/netbanking/wallet disabled.
- Store the generated URL in `payments.provider_payment_link_url` and use that stored URL in `review_and_pay` — never reconstruct it.
- Never treat the Razorpay callback redirect as proof of payment. `payment_link.paid` from the verified webhook is authoritative.
- When testing a newly deployed Payment Link configuration, create a **new** order — an existing pending/processing payment record reuses its already-stored URL.
- Razorpay rejects any `expire_by` less than **15 minutes** in the future with a 400 error (`"epoch time passed is less than 15 minutes from the current time"`). WhatsApp's `order_details.order.expiration.timestamp` has its own minimum of **300 seconds**, and Meta's payment-link docs say to use the *same* expiry on both. Currently the link is 24h and the card has no expiry — plan to move both to ~15 minutes together, not independently.
- `RAZORPAY_MODE` (`test`/`live`) is deliberately a single-word switch backed by fully separate test/live key pairs and webhook secrets, so QA can flip modes without touching code. Known gap: anything other than the exact string `"live"` currently falls through to `"test"` silently (missing env var, typo, etc.) — this should fail loudly instead before real launch. Also, `razorpay-webhook` currently only tries the webhook secret matching the *current* `RAZORPAY_MODE`; if mode is flipped after a live payment's webhook is in flight, that webhook's signature check will fail. Trying both secrets and tagging which mode a payment came from is on the outstanding-work list.

## 7. Meta Catalog — now manual-only (changed 23–24 Sep)

Automatic sync via `meta-catalog-webhook` has been **retired** (function deleted, `WHATSAPP_CATALOG_VERIFY_TOKEN` secret removed, catalog webhook subscription removed in the Meta app). Do not re-add catalog-event handling to `whatsapp-webhook` — if automatic sync is ever reinstated, it should again be a dedicated endpoint, not folded into the messaging webhook. Current process: make the catalog change in Commerce Manager, then manually invoke `sync-meta-catalog` (dashboard Test panel or `curl` with the service-role key). `sync-meta-catalog` remains `verify_jwt = true` since only we call it, never Meta.

## 8. Catalog synchronization lessons

- Meta's product `url` field is stored as `Product.product_link` — do not request `link`, the API contract provides `url`.
- `sync-meta-catalog` follows pagination and performs batched upserts (by `(catalog_id, retailer_id)`), then removes stale local products for the configured catalog after a successful full retrieval.
- `Product` stores `name, retailer_id, description, product_link, catalog_id`. Transaction price is never stored here.
- **Fixed 24 Sep evening (v6)**: if Meta returns zero products, `sync-meta-catalog` now skips the stale-deletion step entirely (logs a warning and returns `{"cleanup_skipped":"empty_meta_response"}`) instead of removing every local product for that catalog. The delete filter also now double-quotes each `retailer_id` inside the `or=(...)` expression via a `quotePgFilterValue()` helper (escaping embedded `"`/`\`), defensively guarding against PostgREST-reserved characters (`,` `.` `:` `(` `)`) even though current IDs are plain alphanumeric.

## 9. Supabase safety lessons

- Inspect live schema and advisories before any schema/RLS change.
- **Resolved 23 Sep**: `public.payments` RLS was critical-disabled; now enabled, and `anon`/`authenticated` have zero privileges on any `public` table (verified via `has_table_privilege` checks, not just the advisor). Also fixed: mutable `search_path` on `set_orders_updated_at`/`set_addresses_updated_at`, and a malformed `Profile.language` default (`'''en''::text'::text` → `'en'`).
- Before revoking/dropping any public-key access, **confirm nothing else legitimately depends on it** — in this project, n8n has no Supabase node and there's no front-end yet, so a full lockdown was safe. Re-check this assumption before adding any new consumer (front-end, another automation, etc.).
- Leaked-password protection remains disabled — irrelevant until real user (staff) logins exist via a front-end; revisit then.
- **PostgREST filter encoding**: values containing `,` `.` `:` `(` `)` need double-quoting inside `or=(...)` expressions. This came up building the handoff-retry due-filter (`or.eq.` timestamps) — see `supabase/functions/_shared/order-handoff.ts`'s `dueFilter()` for a working example.

## 10. n8n handoff lesson (new, 24 Sep)

n8n returned `503 {"code":503,"message":"Database is not ready!"}` on the first live-payment test — this was n8n's own backend restarting, not a bug on our side. Because the original code only tried once, the order was silently dropped from the sheet until manually retried. Fix: `orders` now tracks handoff attempts/outcome, and a `pg_cron` job retries any due, unsent handoff every 5 minutes for up to ~2 hours before giving up. **Lesson**: treat any downstream webhook (n8n, or anything similar added later) as potentially and transiently unavailable — one attempt with no retry is not suffient for anything that has to reach a real system of record.

## 11. Flow endpoint security lesson (new, 24 Sep)

`whatsapp-flow` previously did **not** verify Meta's `X-Hub-Signature-256` on Flow endpoint requests, even though `whatsapp-webhook` always had this check on the messaging webhook. Meta's docs confirm it signs Flow endpoint requests the same way and expects HTTP 432 on a bad signature. Fix rolled out in two stages to avoid breaking a working Flow with a config mismatch:
1. Deploy the check in **log-only** mode (`FLOW_SIGNATURE_MODE=log`, the default) — verify and log, never reject.
2. Confirm `valid:true` on real traffic across every screen/action in use.
3. Only then flip `FLOW_SIGNATURE_MODE=enforce` (no redeploy required — it's an env var check).

This is a good general pattern for adding any new validation to a function Meta calls directly: log-first, enforce-second, confirmed live before either step.

**Update, 24 Sep evening**: flipped `FLOW_SIGNATURE_MODE` to `enforce` (secret update only, no redeploy) after confirming `valid:true` on the last 50 real Flow requests logged (~3 hours of real traffic), zero `valid:false`. Invalid signatures now get HTTP 432 instead of just a log line.

## 12. Region/latency lesson (new, 23–24 Sep)

Edge Functions run in whichever region is closest to the *caller* by default. Meta calls from US-based infrastructure, so `whatsapp-webhook`/`whatsapp-flow` were running in `us-east-1`/`us-east-2`/`us-west-2` while the database is in `ap-south-1` (Mumbai) — every database round-trip was crossing the Pacific and back. Fix: append `?forceFunctionRegion=ap-south-1` to the webhook/Flow endpoint URLs configured in the Meta App Dashboard. `razorpay-webhook` didn't need this — Razorpay calls from India already. Cut the slowest customer-facing step (review-and-pay) from ~5.9s to ~3.6s. Remaining latency is now dominated by external API calls (Meta, Razorpay), confirmed via per-call timing logs added to `whatsapp-webhook`.

## 13. Hard-coded values to track (confirm before real launch)

| Value | Purpose | Env override |
|---|---|---|
| `1327606333760280` | WhatsApp phone number ID | `WHATSAPP_PHONE_NUMBER_ID` |
| `1515875913870520` | Catalog ID | `WHATSAPP_CATALOG_ID` |
| `v25.0` | Graph API version | `WHATSAPP_API_VERSION` |
| `1027827043551409` | "Popular products" Meta product set | none |
| `sdedto6u1x` (Almond Oil) | Full-catalogue thumbnail | none |
| `sdedto6u1x`, `5wovdlm67j` | "View oil" product IDs | **removed 24 Sep evening (v83)** — `viewOil()`/`OIL_PRODUCT_IDS` and both dead call sites deleted from `whatsapp-webhook` |
| `https://wa.me/919972267897` | Razorpay post-payment callback | none |
| `registration`, `update_personal_info`, `place_new_order`, `full_catalogue`, `address` (lang `en`) | WhatsApp template names | must match approved templates in the production WABA |

## 11a. Signed flow token lesson (new, 24 Sep evening)

`checkout-address`/`update-profile` flow tokens were plain (order id / wa_id embedded unsigned). Meta's Flow endpoint request signature only proves a request came from Meta's infrastructure — it says nothing about whether the `flow_token` content inside is the one we actually issued, since a party with WABA access (e.g. Business Manager's Flow preview/test tooling) can trigger arbitrarily-shaped, validly-signed requests with a hand-picked `flow_token`. Fix: HMAC-sign every token (`FLOW_TOKEN_SECRET`, new project secret) as `<prefix>:<parts...>:<nonce>:<expiry_unix>:<hmac_sha256_hex>`; `whatsapp-flow` verifies the signature (constant-time compare) and expiry before trusting the embedded order id/wa_id, returning `null` — never an error — on any mismatch, so a forged token degrades to an anonymous/empty Flow screen instead of leaking another customer's addresses. Rolled out safely in dependency order (verifier first, purely additive with a legacy-unsigned fallback; issuer second, switches to signed-only) so there was never a window where one side didn't understand the other's tokens. Verified locally (sign/verify round-trip, tamper detection, expiry enforcement) before deploying, then confirmed live with a real test order end-to-end.

## 14. Current production baseline (24 Sep 2026, night)

- `whatsapp-webhook` v88, `whatsapp-flow` v47, `razorpay-webhook` v28, `sync-meta-catalog` v8, `retry-order-handoffs` v3 (platform version counters drift upward without content changes on some functions — content parity via `git diff`, not the raw number, is what was confirmed).
- `FLOW_SIGNATURE_MODE` is now `enforce` (was `log`). `FLOW_TOKEN_SECRET` (new) signs/verifies flow tokens.
- Order creation (`whatsapp-webhook`) and payment→order advancement (`razorpay-webhook`) are atomic via three Postgres RPC functions (migration `20260924155516_add_transactional_order_and_payment_rpcs.sql`) — see §16. **Live-tested successfully** on a real test order (id 132) this session.
- Payment link + `order_details` expiry tightened from 24h to ~16 minutes, with `payment_link.expired`/`cancelled` handling in `razorpay-webhook` (migration `20260924181608_add_expired_at_to_payments.sql`) — see §17. Not yet live-tested.
- Address Flow JSON v7.3 (unchanged, protected).
- Both functions Meta calls directly pinned to `ap-south-1`.
- `cursor/production-hardening` branch of the GitHub repo confirmed byte-identical to deployed source (one merge behind having this become `main`).

## 15. Regression checklist

1. Inspect the deployed function (or the git copy, confirmed identical) before changing it.
2. Consult current Meta/Razorpay documentation for any protocol-specific change.
3. Make one focused change.
4. `esbuild`-bundle-check, then deploy the complete function via the CLI.
5. Verify the active version and `verify_jwt` setting via `list_edge_functions`/`get_edge_function`.
6. Re-download and `git diff` to confirm parity, then commit/push.
7. Test the real WhatsApp path: new user → registration → main menu; Settings → update info → Profile persists; catalog browse → cart; cart → address Flow → address attached → review_and_pay; a real (test-mode) Razorpay payment → `payment_link.paid` → order `processing` → "Payment received" message → n8n handoff logged as `sent`.
8. For webhook changes, test signature/verification behavior (valid and invalid) separately from business logic.
9. For any change to a function Meta calls directly, consider log-first/enforce-second rollout (see §11) rather than enforcing on day one.

## 16. Transactional order creation + self-healing payment webhook lesson (new, 24 Sep night)

- **The bug pattern**: `whatsapp-webhook` created an `orders` row, then a separate `order_items` insert; a failure between the two left an empty `pending_payment` order that permanently blocked retries (dedup is keyed on `whatsapp_message_id`, so any retry of the same WhatsApp message became a silent no-op forever). Separately, `razorpay-webhook` PATCHed `payments.status='paid'` and then PATCHed `orders.status='processing'` as two separate REST calls; if the second PATCH failed, the payment was already `paid` but the order stayed `pending_payment` — and worse, the webhook's own duplicate-detection shortcuts (matched by `x-razorpay-event-id` or by `provider_payment_id`) only re-sent messaging on a retried/duplicate delivery, never re-attempting the order update, so the order stayed stuck even though Razorpay does retry non-2xx responses.
- **The fix**: move both multi-step writes into single Postgres functions (`create_order_with_items`, `mark_payment_paid_and_advance_order`) called via PostgREST RPC (`/rest/v1/rpc/<name>`) instead of chained REST calls. A single RPC call is one Postgres transaction, so a raised exception partway through rolls back everything in that call, not just the last statement. A third function, `advance_order_to_processing`, is idempotent (only moves status forward, guarded by `status not in ('processing','shipped','delivered','cancelled')`) and is called both inside the atomic payment-update path and standalone in both duplicate-detection shortcuts as an explicit self-heal step — this is what actually closes the "stuck order" gap, since the atomicity fix alone only prevents *new* occurrences, not ones caused by a delivery that already partially succeeded before this fix shipped.
- **Security shape for new RPC functions calling locked-down tables**: use `security invoker` (not `security definer`) so the already-revoked `anon`/`authenticated` table privileges (see §9) automatically protect the function too, then additionally `revoke all ... from public, anon, authenticated` and `grant execute ... to service_role` explicitly for defense in depth. Pin `search_path = ''` and fully qualify every table reference (`public.orders`, not `orders`) inside the function body, matching the existing trigger-function pattern from the `search_path` fix in `lock_down_public_api_access`.
- **Verification approach without live traffic**: wrapped test calls in `begin; ...; rollback;` against the live (test) database to prove behavior — invalid item data rolls back the whole order insert with zero rows left behind, a duplicate `whatsapp_message_id` returns the existing order instead of creating a second row, and `advance_order_to_processing` never regresses an order already past `pending_payment` — all confirmed, then explicitly confirmed rolled back afterward (re-queried the affected row outside the transaction). Checked live data first for any pre-existing instances of the bug (zero-item orders, paid-but-stuck orders) — found none, confirming this closed a documented gap rather than an active incident.
- **Still needs a real end-to-end test** (actual WhatsApp test order + actual test-mode Razorpay payment) before this is considered fully proven in production traffic — the rolled-back-transaction tests above prove the SQL logic, not the full Edge Function → PostgREST → Postgres round trip under real Meta/Razorpay signatures.
- **Update, 24 Sep night**: live-tested with a real test order (id 132, ₹2.00). Full trace was clean: `create_order_with_items` RPC (151ms) → Address Flow (INIT/SELECT_ADDRESS/data_exchange, all `valid:true`/`mode:enforce`) → Razorpay Payment Link → `review_and_pay` sent (200) → real test-mode `payment_link.paid` webhook → `mark_payment_paid_and_advance_order` RPC → order `processing` → "Payment received" message sent (200). Zero errors anywhere in the WhatsApp/Razorpay/Postgres path. The only failure was n8n's own `HTTP 503 Database is not ready!` on the handoff — confirmed to be an issue on the n8n side, not related to this fix; `pg_cron`'s `retry-order-handoffs` correctly kept retrying every 5 minutes exactly as designed.

## 17. Payment link expiry + expired/cancelled handling lesson (new, 24 Sep night)

- **Consulted Meta and Razorpay docs first**, per the project's Flow/Cloud-API rule, before touching either side:
  - Meta: `order_details` message's `action.parameters.order.expiration` is an **optional** object with `timestamp` (UTC seconds, string, minimum 300 seconds from send time) and `description` (string, max 120 chars). After expiry, WhatsApp disables the payment CTA client-side.
  - Razorpay: `expire_by` on a Payment Link must be **at least 15 minutes** in the future or the create call returns HTTP 400 (`"epoch time passed is less than 15 minutes from the current time"`). `payment_link.expired`/`payment_link.cancelled` webhooks carry `payload.payment_link.entity` with `status`/`expired_at`/`cancelled_at` populated accordingly — same envelope shape as `payment_link.paid`.
- **The change**: both the Razorpay Payment Link and the WhatsApp `order.expiration` now use the **same** ~16-minute window (`PAYMENT_LINK_EXPIRY_SECONDS` in `whatsapp-webhook`) — 1 minute above Razorpay's hard floor to absorb checkout processing latency. The WhatsApp expiration timestamp is derived directly from the *stored* `payment.expires_at` (itself copied straight from Razorpay's response), not recomputed independently, so the two surfaces can never drift apart even across code changes. If fewer than Meta's 300-second minimum would remain by send time, the `expiration` field is omitted entirely rather than risking the whole `order_details` message being rejected for violating Meta's own constraint.
- **A 16-minute window turns payment-link reuse into a real correctness concern that a 24-hour window never surfaced**: `createRazorpayPaymentLink` already reused an existing pending payment record for an order rather than creating a duplicate. With a 24h expiry this was always safe; with ~16 minutes, a slow or re-run checkout (e.g. customer restarts the Address Flow) could otherwise hand back a link that's already expired or about to be. Fixed by requiring at least 60 seconds of remaining life (`PAYMENT_LINK_MIN_REMAINING_SECONDS`) before reusing a pending payment record; otherwise a fresh Razorpay link is created.
- **Reference-id trap caught by reading Razorpay's docs before implementing the fresh-link path**: Razorpay's `reference_id` must be **globally unique per Payment Link** — reusing one (e.g. the order's own `reference_id`, unchanged) returns HTTP 400 `"An existing reference id has been passed."`. The fix sends a freshly-suffixed value to Razorpay only (`<order_reference_id>-R<random>`) when replacing an expired link; the order's own `reference_id` (a separate namespace, used in the WhatsApp `order_details` message and unrelated to Razorpay's per-link uniqueness requirement) is untouched. Worth remembering for any future logic that creates more than one Payment Link per order.
- **`payment_link.expired`/`cancelled` handling added to `razorpay-webhook`**: flips the matching payment row to a terminal status (`expired`/`cancelled`), but **only if it's still `pending`** — this guards against a late or out-of-order webhook delivery (Razorpay's own docs note delivery order isn't guaranteed) regressing an already-`paid` payment back to a terminal non-paid state. The order itself is deliberately left in `pending_payment` (not touched) so the customer can simply retry checkout and get a fresh link via the reuse-check above, rather than needing any special "expired order" recovery flow.
- **New `payments.expired_at` column** (migration `20260924181608`) mirrors the existing `paid_at`/`failed_at`/`cancelled_at` columns — the `status` check constraint already allowed `'expired'` as a value but had no matching timestamp column, apparently an oversight from an earlier migration.
- **Not yet live-tested** — needs a real test order deliberately left unpaid for ~16 minutes to confirm the `payment_link.expired` webhook arrives and is handled correctly, plus a real payment completed inside the tighter window to confirm the shorter expiry doesn't cause any customer-facing friction in practice.

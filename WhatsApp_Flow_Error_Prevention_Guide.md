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
- **Not yet fixed**: if Meta legitimately returns zero products, the current stale-deletion logic would remove every local product for that catalog. Needs a safety condition (e.g. only delete if the retrieval both succeeded and returned a non-trivial count) before this is fully safe. The delete filter also builds `retailer_id.eq.<id>` inside an `or=(...)` expression without quoting — untested against IDs containing PostgREST-reserved characters (`,` `.` `:` `(` `)`); current IDs are plain alphanumeric so this hasn't bitten yet, but it's worth quoting defensively.

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
| `sdedto6u1x`, `5wovdlm67j` | "View oil" product IDs | none — **dead code, unreachable, safe to delete** |
| `https://wa.me/919972267897` | Razorpay post-payment callback | none |
| `registration`, `update_personal_info`, `place_new_order`, `full_catalogue`, `address` (lang `en`) | WhatsApp template names | must match approved templates in the production WABA |

## 14. Current production baseline (24 Sep 2026)

- `whatsapp-webhook` v82, `whatsapp-flow` v43, `razorpay-webhook` v24, `sync-meta-catalog` v5, `retry-order-handoffs` v1.
- Address Flow JSON v7.3 (unchanged, protected).
- Both functions Meta calls directly pinned to `ap-south-1`.
- `main` branch of the GitHub repo confirmed byte-identical to deployed source.

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

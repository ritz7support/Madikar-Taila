# WhatsApp Flow App — Project Handoff

Last reviewed: 1 October 2026. Start with PROJECT_HANDOFF.md for the consolidated main baseline, current function counters and website version 24. All bot function sources match live. The owner-authored Razorpay help-line change is included. Older deployment counters and continuation prompts below are dated history; no bot runtime was changed during consolidation.

## 1. Source-of-truth rules

- The **GitHub repo** (`https://github.com/samskruthrml21-eng/Madikar-Taila.git`, bot baseline on `main`) and the **live Supabase project** are both source of truth for the bot. The bot function source was confirmed identical to deployed source after the latest bot change. Create future website work branches from consolidated main.
- Before any WhatsApp Flow or WhatsApp Cloud API change, consult the latest Meta documentation and inspect the currently deployed function / the repo copy (they should match).
- Before Supabase schema/RLS/migration changes, inspect the live schema and current advisories.
- Make one focused change at a time; deploy the complete function via the Supabase CLI (`--use-api`, no Docker available on this machine); verify the active version; test the real runtime path; commit and push so the repo stays in sync.
- Do not modify the working Address Flow JSON (`Latest Address Flow JSON_7.3.md`) unless a specific Flow-layer problem is demonstrated.
- The existing Sites storefront uses the same Supabase project through its separate `madikar-store` function. The Sites source is already migrated into `website/` in this monorepo, and version 24 is published to the same Site. Before website work, read `WEBSITE_HANDOFF.md` and `BOT_BACKEND_DO_NOT_TOUCH.md`. Do not change the bot's Edge Functions, shared module, applied migrations, or `config.toml` entries as a side effect of website work. Preserve the explicitly requested download of the owner's manual Razorpay text change.
- `Project_Instructions.md` is the working guide for any coding tool. The filename used to say "Cursor"; the contents are not tool-specific. The earlier `cursor/production-hardening` branch is retained as bot work history.

## 2. Business context

- **Phase 1**: this is a WhatsApp ordering bot for "Madikar Taila" oil products (Sesame, Coconut, Safflower, Sunflower, Groundnut, Mustard, Almond). Customers place orders and pay entirely inside WhatsApp.
- The client has viewed/fulfilled WhatsApp orders via a **Google Sheet fed by n8n** (Append operation, triggered from `razorpay-webhook` after a payment is confirmed). The Sites storefront now has a team `/admin` page for catalog and order access; verify its current capabilities before assuming it replaces the Sheet workflow.
- The customer-facing e-commerce storefront exists as the "Madikar Taila | Heritage Store" ChatGPT Site at `https://madikartaila.com`. Its source is in `website/`; product categories and detail pages, policies and website payments are implemented. See `WEBSITE_HANDOFF.md`.
- Supabase project is currently on the **Free plan**. Free projects can be auto-paused after 7 days of low activity and have no downloadable backups — revisit before a real (non-test) launch.

## 3. Current Supabase project

- Project name: `Whatsapp`, project ref/ID: `faoomjgkofqrdajaftjd`, region: `ap-south-1` (Mumbai).
- PostgreSQL 17.6.1.147.
- WhatsApp Cloud API version configured by runtime: `v25.0`.
- Catalog ID: `1515875913870520`.

## 4. Repo and deployment workflow

- `supabase/functions/<name>/index.ts` — Edge Function source, kept identical to what's deployed.
- `supabase/functions/_shared/order-handoff.ts` — shared module used by `razorpay-webhook` and `retry-order-handoffs`.
- `supabase/migrations/*.sql` — one file per entry in `supabase_migrations.schema_migrations`, named with the same version timestamp so the Supabase GitHub integration (if re-enabled) treats them as already applied.
- `supabase/config.toml` — per-function `verify_jwt` settings. Meta and Razorpay call three of these functions directly and cannot send a Supabase JWT, so those three (plus the internal retry function) have `verify_jwt = false`; only `sync-meta-catalog` (triggered manually by us) has it `true`.
- **No Docker on this machine.** Deploy and download with the `--use-api` flag, e.g.:
  ```
  npx supabase functions deploy <name> --project-ref faoomjgkofqrdajaftjd --use-api --no-verify-jwt
  npx supabase functions download <name> --project-ref faoomjgkofqrdajaftjd --use-api
  ```
  After any manual edit, re-download and `git diff` to confirm the repo still matches what's live.
- Live migrations are applied with the Supabase MCP `apply_migration` tool (or the CLI), then the exact same SQL is saved under `supabase/migrations/` with the version number the tool assigned, and committed.
- The Supabase GitHub integration's **"Deploy to production" toggle is currently OFF** — deliberate, so that connecting/reconnecting the repo can't accidentally redeploy anything until the migration history and `config.toml` have been fully verified against production. Re-enable only after re-confirming a fresh `db pull` matches `supabase/migrations/` exactly.
- Local machine: Windows/PowerShell, no `gh` CLI, no Docker. Use `npx supabase ...` (no global install). `git` works normally.

## 5. Current deployed Edge Functions

| Function | Last inspected version | verify_jwt | Purpose |
|---|---|---|---|
| `whatsapp-webhook` | v93 (30 Sep) | false | Primary WhatsApp webhook — registration/profile, messages, cart/order creation, address-checkout orchestration, checkout messaging. Verifies Meta's `X-Hub-Signature-256`. Mints HMAC-signed flow tokens, uses atomic order creation, and sends `review_and_pay` followed by `change_address` after an address selection. Allows replacement of an order address only while `pending_payment`. Main menu includes the "Hi" reminder. |
| `whatsapp-flow` | v48 (28 Sep) | false | Flow INIT/data_exchange endpoint for the Address Flow and the shared registration/Settings Flow. Checks Meta's signature in **`enforce`** mode (see §9), and verifies HMAC-signed flow tokens. |
| `razorpay-webhook` | v32 (30 Sep) | false | Verifies Razorpay signature, processes `payment_link.paid`, updates payment/order state atomically via the `mark_payment_paid_and_advance_order` RPC, self-heals a stuck order on duplicate/retried deliveries, schedules `order_status` + n8n handoff, and handles `payment_link.expired`/`cancelled`. Payment confirmation now includes the owner's help phone line. |
| `sync-meta-catalog` | v10 (30 Sep) | true | Pulls the full Meta catalog into `public.Product`. Manually triggered only (see §6). Guards against wiping the local catalog on an empty Meta response and quotes `retailer_id` inside the stale-cleanup filter. |
| `retry-order-handoffs` | v4 (28 Sep) | false | Called every 5 minutes by `pg_cron`; resends any due n8n order handoff. Can't do anything except resend what's already due, so it's safe without JWT auth. |

**Owner's manual edit, synchronized 30 Sep:** downloaded complete `razorpay-webhook` v32 source and copied it into the local branch. The only substantive change appends `Need help with your order? Contact us at 99722 67897.` to the existing payment-confirmation body. The bundled shared module matches the local copy and was not modified. No function was deployed, no secret was changed, and no real payment/message was sent by this synchronization. The local source/documentation update is not yet committed or pushed; the previous `main`/GitHub baseline is older than this manual live edit. Preserve it and consult the updated outbound JSON reference.

(Platform version counters for `sync-meta-catalog`/`retry-order-handoffs` have again been observed to increment without any content change since the last handoff snapshot — confirmed via `download` + `git diff` showing zero diff before this session's edits. Content parity, not the raw version number, is what matters.)

(Note: the platform's internal version counters for `razorpay-webhook`/`sync-meta-catalog`/`retry-order-handoffs` have been observed to increment without any content change — confirmed via `download` + `git diff` showing zero diff each time. Content, not the raw version number, is the parity signal that matters.)

`meta-catalog-webhook` has been **deleted** (dashboard + `WHATSAPP_CATALOG_VERIFY_TOKEN` secret removed). The two test-only functions mentioned in older docs (`whatsapp-flow-key-register-test`, `test-order-status`) no longer exist.

## 6. Catalog architecture (manual sync only)

The automatic webhook chain (Meta Catalog → `meta-catalog-webhook` → `sync-meta-catalog`) has been **retired**. Current flow:

1. Make the catalog change in Meta Commerce Manager.
2. Manually invoke `sync-meta-catalog` (Supabase dashboard "Test" panel, or `curl` with the service-role key).
3. `sync-meta-catalog` pages through Meta's `/products` endpoint, upserts into `public.Product` by `(catalog_id, retailer_id)`, then deletes local rows for the configured catalog that Meta no longer returned.

An empty Meta product response skips stale deletion instead of removing every local product.

`public.Product` is a local cache: `id, created_at, name, retailer_id, description, product_link, catalog_id, updated_at`. It deliberately does **not** store price — checkout uses the incoming WhatsApp cart item's price. Current row count: 7 (all seven oils).

## 7. Checkout and payment architecture

```
WhatsApp cart → pending_payment order + order_items
  → checkout-address:<order_id>:<uuid> token → Address Flow
  → address attached to order
  → Razorpay Standard Payment Link created/reused (UPI only; card/netbanking/wallet disabled)
  → review_and_pay order_details message → change_address Flow template
  → optional replacement address while pending_payment → review_and_pay → change_address
  → verified Razorpay payment_link.paid webhook → payment=paid, order=processing
  → "Payment received" order_status message + n8n handoff (with retry)
```

- Payment success is authoritative **only** via the verified `payment_link.paid` webhook. The callback redirect is not proof of payment.
- `RAZORPAY_MODE` (`test`/`live`) selects which key/secret pair and webhook secret to use. It must be exactly `test` or `live` (trimmed, case-insensitive); otherwise checkout refuses to call Razorpay and the webhook returns 500 so Razorpay retries. It was confirmed as `test` on 25 Sep, then switched to `live` before the successful order 135 payment on 28 Sep. Recheck the live secret rather than relying on a historical value. Still open: `razorpay-webhook` only tries the webhook secret for the *current* mode, so a webhook in flight across a mode flip would fail signature verification.
- **Fixed 24 Sep night**: payment link expiry tightened from 24 hours to **16 minutes** (`PAYMENT_LINK_EXPIRY_SECONDS` in `whatsapp-webhook`) — Razorpay's hard floor is 15 minutes, so this gives a 1-minute safety margin. The `order_details`/`review_and_pay` message now carries a matching `order.expiration` object (`{timestamp, description}`, sourced directly from the stored Razorpay `expires_at` so both surfaces always agree, per Meta's payments docs; minimum 300s, omitted defensively if less would remain). `razorpay-webhook` now handles `payment_link.expired`/`cancelled` — flips the payment to a terminal status (only from `pending`, so a late webhook can't regress an already-paid payment) and leaves the order in `pending_payment` so the customer can retry checkout. See §14.
- **Fixed 24 Sep night**: order creation (order + order_items) is now atomic via the `create_order_with_items` Postgres RPC — a partial failure rolls back the whole order instead of leaving an empty `pending_payment` row behind. See §14.
- Address attachment → payment-link creation → message send is still **not** wrapped in one transaction. A failure partway through can leave an order address-attached without a payment link or without all messages. Re-running the Address Flow can now attach or replace an address while the order remains `pending_payment`, so that path can retry checkout. Monitor for partial message delivery if this proves to bite in practice.
- Callback URL after payment: `https://wa.me/919972267897` — confirm this is the bot's own number before go-live.

## 8. n8n order handoff (with retry)

- `orders` has four tracking columns: `handoff_sent_at`, `handoff_attempts`, `handoff_last_attempt_at`, `handoff_last_error`.
- `supabase/functions/_shared/order-handoff.ts` builds the payload (order + profile + address + items) and posts it to `N8N_WEBHOOK_URL`.
- `razorpay-webhook` makes the first attempt inline (as before). If it fails, `pg_cron` job `retry-order-handoffs` (every 5 minutes, via `pg_net.http_post`) retries any order that's due, up to 24 attempts (~2 hours), 4 minutes apart, then gives up and leaves the last error on the row.
- Two senders can't double-process the same order (claimed via a conditional `PATCH`), so the Google Sheet's **Append** operation in n8n stays safe.
- No shared-secret header between us and n8n yet (kept simple deliberately, per project decision, since n8n is temporary and a front-end is coming soon).
- `pg_net`/`pg_cron` are enabled; Vault holds a `project_url` secret used by the cron job. A second job, `prune-cron-run-history`, deletes `cron.job_run_details` older than 7 days daily at 03:30 UTC.
- Confirmed working end-to-end on 24 Sep — see `WhatsApp_Flow_Error_Prevention_Guide.md` §"n8n handoff" for the restart/`503` incident and outcome.

## 9. Registration, Settings, and the Flow endpoint

- **Registration** never calls `whatsapp-flow`. The registration template opens the Flow, and the submitted answers arrive at `whatsapp-webhook` as an `nfm_reply` message, which creates/updates the `Profile` row and sends the main menu.
- **Settings → Update Personal Information** reuses the *same* Flow. It calls `whatsapp-flow`'s `INIT` action once, to pre-fill the current name/email (token `update-profile:<wa_id>:<uuid>`), but the **save** still happens through the `nfm_reply` path on `whatsapp-webhook`, exactly like registration.
- The `UPDATE_PROFILE` `data_exchange` handler in `whatsapp-flow` that appeared to be dead code (used briefly on 21 Sep, not since) has been **removed** (v44, 24 Sep evening). The `INIT` pre-fill path for `update-profile:<wa_id>:<uuid>` tokens is untouched — only the never-hit `data_exchange` save branch was deleted. Verified via `git diff` after re-download that the deployed source now matches the trimmed repo copy.
- `whatsapp-flow` checks Meta's `X-Hub-Signature-256` (using `WHATSAPP_APP_SECRET`) on every request and logs `{"valid":true/false,"mode":...}`. Controlled by the `FLOW_SIGNATURE_MODE` secret:
  - `"log"` — checks and logs, never rejects.
  - `"enforce"` (**current, flipped 24 Sep evening**) — rejects invalid signatures with HTTP 432. No redeploy was needed, just a secret update.
  - Before flipping: confirmed `valid:true` on the last 50 real Flow requests logged (spanning ~3 hours, across INIT/data_exchange/ping). Zero `valid:false` seen.
  - **Confirmed live post-flip**: a real Settings → Update Personal Info and a real Address Flow run (24 Sep, ~15:09–15:21 UTC) both show `{"valid":true,"mode":"enforce"}` on every `whatsapp-flow` call, and every `whatsapp-webhook`/`whatsapp-flow` HTTP response in that window was `200` with no errors in the function console logs.
- **Fixed 24 Sep evening**: flow tokens are now HMAC-signed (`FLOW_TOKEN_SECRET`, a new project-wide secret). Format: `<prefix>:<part1>:<part2>:...:<nonce>:<expiry_unix>:<hmac_sha256_hex>` — e.g. `checkout-address:<order_id>:<wa_id>:<nonce>:<expiry>:<sig>`, `update-profile:<wa_id>:<nonce>:<expiry>:<sig>`. `whatsapp-webhook`'s `signFlowToken()` mints them (24h TTL); `whatsapp-flow`'s `parseSignedToken()` verifies the HMAC (constant-time compare) and expiry before trusting the embedded order id/wa_id, returning `null` (never an error) on any mismatch, which degrades gracefully to an anonymous/empty Flow screen rather than leaking another customer's addresses. A legacy-unsigned-token fallback remains temporarily for any tokens issued before this deploy (self-obsoletes within 24h; see §14 for cleanup). This closes the gap described below: the Meta signature check alone only proves a request came from Meta's infrastructure, not that the `flow_token` content is the one we actually issued — a party with WABA access (e.g. Business Manager's Flow preview/test tooling) could otherwise hand-craft a validly-signed request with an arbitrary `flow_token` pointing at someone else's order/profile.

## 10. Address Flow protected baseline

Maintained separately in `Latest Address Flow JSON_7.3.md` — do not edit without a demonstrated Flow-layer bug. Summary: `ADDRESS_LIST → ADDRESS_SELECTION or NEW_ADDRESS → ADDRESS_DETAILS` (terminal, `complete`). NavigationList caps out at 20 items (Meta's hard limit); current saved-address counts (max seen: 9) are well under that.

## 11. Region / performance

- `whatsapp-webhook` and `whatsapp-flow` are pinned to `ap-south-1` via `?forceFunctionRegion=ap-south-1` on the webhook/Flow endpoint URLs configured in the Meta App Dashboard. `razorpay-webhook` already runs in `ap-south-1` naturally (Razorpay calls from India). This cut the review-and-pay reply time from ~5.9s to ~3.6s.
- `whatsapp-webhook` now logs per-call timings (`Timing: {"kind":"db"|"meta"|"razorpay", "path", "ms"}`) for every outbound network call, with query strings stripped from the logged path.
- Remaining latency is now mostly Meta/Razorpay API round-trips, not our database. Caching the "popular products" set locally (instead of a live Meta lookup on every tap) and parallelizing the Razorpay-link-save + message-send in the checkout path are the next candidate optimizations.

## 12. Security posture

**Fixed:**
- `public.payments` RLS enabled; `anon`/`authenticated` roles have **no** privileges on any table in `public` (including default privileges for future tables) — confirmed via the security advisor and direct privilege checks. Edge Functions use the service-role key and are unaffected.
- Two trigger functions (`set_orders_updated_at`, `set_addresses_updated_at`) have a pinned `search_path`.
- `Profile.language` default fixed (was a malformed literal string).
- `whatsapp-webhook`, `whatsapp-flow`, `meta-catalog-webhook` (now deleted) all verified Meta's HMAC signature on messaging/catalog webhooks from the start; `whatsapp-flow` now also verifies signatures on Flow endpoint calls (log mode, see §9).
- Confirmed no other consumer (n8n, front-end, etc.) uses the Supabase public/anon key — n8n has no Supabase node.

**Fixed 24 Sep evening:**
- Flow signature check now in `enforce` mode.
- Flow tokens are now HMAC-signed and verified (`FLOW_TOKEN_SECRET`) — order/profile lookups by flow token are cryptographically bound to what we actually issued.

**Fixed 24 Sep night (this session):**
- Order creation and payment→order-processing advancement are now atomic (three new `security invoker` Postgres RPC functions, `EXECUTE` restricted to `service_role`) instead of separate REST calls that could partially fail — see §14.

**Still open (see the outstanding-work list, §14):**
- Address attachment → payment-link creation → message send still isn't wrapped in one transaction (lower risk than the order-creation/payment-webhook gaps just closed — see §7).
- ~~`RAZORPAY_MODE` isn't strictly validated~~ — fixed 25 Sep (see §7).
- Leaked-password protection disabled (irrelevant until staff log in via a front-end).
- Every WhatsApp user currently gets a hidden Supabase Auth account with a fake email — fine for now, but should be removed before a staff front-end exists, so the user list isn't polluted with customer entries.

## 13. Historical database snapshot and later live payment

The earlier 24 Sep snapshot was about 132 orders, 166 order items, 10 addresses, 26 payments, 9 profiles, and 7 products. These counts are historical; query live data before relying on totals. Order 135 included a real ₹3 live-mode payment on 28 Sep, so the database no longer contains only test data. Preserve live records when considering any cleanup.

## 14. Outstanding work (in rough priority order)

**Done, 24 Sep evening:**

1. ~~Flip `FLOW_SIGNATURE_MODE` to `enforce`~~ — done via a secret update (no redeploy needed). Pre-flip logs showed `valid:true` on the last 50 real Flow requests (~3 hours), zero failures. **Live-tested and confirmed** with a real Settings update + Address Flow run post-flip — all `valid:true`/`mode:enforce`, all `200`s, no errors.
2. ~~Remove dead code~~ — done. `whatsapp-flow` v44: unused `UPDATE_PROFILE` `data_exchange` handler removed. `whatsapp-webhook` v83: unused `viewOil`/`OIL_PRODUCT_IDS` removed (including both call sites in the `button` and `button_reply` handlers).
3. ~~Guard `sync-meta-catalog` against an empty Meta response~~ — done (v6). A zero-product Meta response now short-circuits before the stale-deletion step and returns `{"cleanup_skipped":"empty_meta_response"}` instead of wiping `public.Product`. Also added defensive double-quoting of `retailer_id` inside the stale-cleanup `or=(...)` filter (via a new `quotePgFilterValue` helper) per the PostgREST filter-encoding lesson in the Error Prevention Guide §9.
4. ~~Signed/authenticated flow tokens~~ — done. New `FLOW_TOKEN_SECRET` project secret. `whatsapp-webhook` (v86) now mints `checkout-address:<order_id>:<wa_id>:<nonce>:<expiry_unix>:<hmac_sha256_hex>` and `update-profile:<wa_id>:<nonce>:<expiry_unix>:<hmac_sha256_hex>` tokens (`signFlowToken()`). `whatsapp-flow` (v47) verifies the HMAC + expiry before trusting the embedded order id/wa_id (`parseSignedToken()`), falling back to the old unsigned-token parsing only for any tokens issued before this deploy (self-obsoletes as those age out — safe to delete the fallback + its `console.warn` after the 24h token TTL has fully elapsed with no more legacy matches in logs). **Closes the gap** where a party who could get an arbitrarily-shaped, validly Meta-signed Flow endpoint request through (Meta's signature only proves origin, not token content — e.g. via Business Manager's Flow preview/test tooling on the WABA) could previously read/write another customer's saved addresses by hand-crafting a `flow_token`. The final "attach address to order" write was already safely scoped to the real sender's `wa_id` in `whatsapp-webhook`, so this specifically closes an address-book read/write exposure during the Flow session, not order hijacking.
   - Verified locally before deploy: sign→verify round-trip, tamper detection (mutated order id → rejected), and expiry enforcement all pass.
   - Deployed in the safe order (flow first, purely additive; webhook second, switches emission to signed-only) so there was never a window where one side didn't understand the other's tokens.
   - **Live-tested**: a real test order (id 128) went through cart → signed `checkout-address` token → Address Flow (INIT/SELECT_ADDRESS/data_exchange, all `valid:true`/`mode:enforce`) → address attached → payment → order reached `processing`. No legacy-token warnings, no errors.

All four: esbuild-bundle-checked, deployed via `npx supabase functions deploy ... --use-api`, active versions verified via `list_edge_functions`, re-downloaded and `git diff`-confirmed byte-identical to the repo, committed and pushed to `cursor/production-hardening`.

**Done, 24 Sep night:**

5. ~~Transactional order creation + self-healing retry for the payment webhook~~ — done. New migration (`20260924155516_add_transactional_order_and_payment_rpcs.sql`) adds three Postgres functions, all `security invoker` with `search_path` pinned to `''` and `EXECUTE` revoked from `anon`/`authenticated`/`public`, granted only to `service_role`:
   - `create_order_with_items(...)` — inserts `orders` + `order_items` in one transaction; a partial failure (bad item data) now rolls back the order row too instead of leaving an empty `pending_payment` order behind that would silently swallow every future retry (dedup is keyed on `whatsapp_message_id`). Also absorbs the `whatsapp_message_id` duplicate-insert race that used to need a 409 + re-select in `whatsapp-webhook`.
   - `advance_order_to_processing(...)` — idempotent, only moves an order forward to `processing`, never regresses one already `processing`/`shipped`/`delivered`/`cancelled`.
   - `mark_payment_paid_and_advance_order(...)` — updates `payments` and advances the order in one transaction, so a payment can never end up `paid` while its order stays stuck in `pending_payment`.
   - `whatsapp-webhook`'s `createOrderFromWhatsAppCart` now calls `create_order_with_items` via RPC instead of two separate REST inserts.
   - `razorpay-webhook`'s main `payment_link.paid` path now calls `mark_payment_paid_and_advance_order` via RPC instead of two separate PATCHes. **Both** duplicate-detection branches (by `x-razorpay-event-id`, and by matching `provider_payment_id`) now call `advance_order_to_processing` as a self-heal step before scheduling the `order_status` message/n8n handoff — this closes the actual gap described above: previously, if the order-status PATCH failed after the payment PATCH succeeded, every subsequent retried/duplicate webhook delivery hit a shortcut branch that re-sent messaging but never re-attempted the order update, so the order stayed stuck forever even though Razorpay does retry on non-2xx.
   - Verified in rolled-back transactions against live (test) data before deploying: invalid item data rolls back the whole order insert with zero rows left behind, a duplicate `whatsapp_message_id` returns the existing order instead of creating a second row, and `advance_order_to_processing` never regresses an order already past `pending_payment`.
   - Checked live data first: no existing orders had zero `order_items`, and no `payments.status='paid'` rows had a non-advanced order — the bug was a documented gap, not yet a live incident.
   - esbuild-bundle-checked, deployed (`whatsapp-webhook` v87, `razorpay-webhook` v27), re-downloaded and `git diff`-confirmed byte-identical, committed and pushed to `cursor/production-hardening`.
   - **Live-tested end-to-end**: a real test order (id 132, ₹2.00) went through cart → `create_order_with_items` RPC (151ms) → Address Flow → Razorpay Payment Link → `review_and_pay` → real (test-mode) `payment_link.paid` webhook → `mark_payment_paid_and_advance_order` RPC → order `processing` → "Payment received" message, all in one clean pass with zero errors in the logs. n8n handoff failed (`HTTP 503 Database is not ready!`) on all attempts — confirmed to be an issue on the n8n side, not ours; `pg_cron` correctly kept retrying every 5 minutes as designed.
6. ~~Tighten payment link + `order_details` expiry to ~15 minutes; handle `payment_link.expired`/`cancelled`~~ — done. New migration (`20260924181608_add_expired_at_to_payments.sql`) adds `payments.expired_at` (mirrors the existing `paid_at`/`failed_at`/`cancelled_at` columns).
   - `whatsapp-webhook`: Razorpay Payment Link `expire_by` is now `now()+16min` (`PAYMENT_LINK_EXPIRY_SECONDS`), not 24h — 16 minutes gives a 1-minute margin above Razorpay's hard 15-minute floor (confirmed via Razorpay's docs: anything less returns HTTP 400).
   - A reused pending payment now requires at least 60 seconds of remaining life (`PAYMENT_LINK_MIN_REMAINING_SECONDS`) or a fresh Razorpay link is created instead — necessary now that the window is tight rather than 24h. Confirmed via Razorpay's docs first that `reference_id` must be **globally unique per Payment Link** (HTTP 400 `"An existing reference id has been passed"` on reuse), so the replacement link sends a freshly-suffixed `reference_id` to Razorpay while the order's own `reference_id` (used in the WhatsApp message, a separate namespace) is untouched.
   - `order_details`/`review_and_pay` messages now include `order.expiration` (`{timestamp, description}`), sourced directly from the stored Razorpay `expires_at` so both surfaces always agree exactly, per Meta's payments docs (confirmed via Meta's developer docs first: `expiration` is optional, nested under `action.parameters.order`, minimum 300 seconds). Omitted defensively if fewer than 300 seconds would remain, rather than risk the whole message being rejected.
   - `razorpay-webhook`: new `handlePaymentLinkTerminalEvent` processes `payment_link.expired`/`cancelled` — flips the payment row to a terminal status (`expired`/`cancelled`) only if it's still `pending` (so a late or out-of-order webhook delivery can never regress an already-paid payment), and deliberately leaves the order in `pending_payment` so the customer can retry checkout and get a fresh link.
   - esbuild-bundle-checked, deployed (`whatsapp-webhook` v88, `razorpay-webhook` v28), re-downloaded and `git diff`-confirmed byte-identical, committed and pushed to `cursor/production-hardening`.
   - **Not yet live-tested** — needs a real test order left unpaid for ~16 minutes to confirm the `payment_link.expired` webhook is received and handled correctly, and a real payment completed within the tighter window to confirm the shorter expiry doesn't cause any friction. Do this before moving on.

**Still open, in rough priority order:**

1. Production config hardening — code part **done 25 Sep** (`whatsapp-webhook` v89, `razorpay-webhook` v29): strict `RAZORPAY_MODE` validation, and the webhook GET verification now rejects when `WHATSAPP_VERIFY_TOKEN` is empty (previously an unset token plus `?hub.verify_token=` would have passed). Verified live: empty/wrong verify token → 403, unsigned Razorpay POST → 401. A real paid order (id 133) on the new ~16-min expiry also went through cleanly just before this (link TTL 958s, `order.expiration` accepted by WhatsApp, paid in ~25s). Owner-side items confirmed by the project owner on 25 Sep: `WHATSAPP_ACCESS_TOKEN` is already a permanent system-user token; all hard-coded IDs in the `WhatsApp_Flow_Error_Prevention_Guide.md` §13 table are the real production values; `payment_link.expired`/`payment_link.cancelled` are now ticked in the Razorpay dashboard webhook subscription (same `razorpay-webhook` URL and secret as `payment_link.paid`). **Only remaining owner-side item**: enable MFA on the Supabase account.
2. **Deferred to Phase 2** (owner decision, 25 Sep): split `whatsapp-webhook` into multiple files under one function. Maintainability only, no behavior change — not needed for Phase 1.
3. Before a staff front-end: rename `Product`/`Profile`/`whatsAppUserId` to snake_case, detach `Profile` from `auth.users` and stop creating a hidden Auth account per WhatsApp customer, add staff-role RLS policies.
4. Decide on the Supabase plan (Free → Pro) before treating this as a real production launch; re-run advisors and wipe test data at that point.
5. Once confident no legacy unsigned flow tokens remain in use (24h+ after the signed-token deploy with no `console.warn` legacy matches in logs), remove the legacy-token fallback branches in `whatsapp-flow` for full enforcement.

## 15. Historical bot continuation prompt (24 Sep)

This section is retained as history. For current website work and the latest bot state, read `WEBSITE_HANDOFF.md` first. In particular, the versions, "first priority," and branch relationship stated in the paragraph below are outdated.

Continue the WhatsApp Flow App from the state dated 24 September 2026 (night). The GitHub repo (currently `cursor/production-hardening`, one merge away from `main`) and the live Supabase project (`faoomjgkofqrdajaftjd`) are kept in sync — inspect both before changing anything, and re-confirm parity with `supabase functions download --use-api` + `git diff` after any manual edit. Current active functions: `whatsapp-webhook` v89, `whatsapp-flow` v47, `razorpay-webhook` v29, `sync-meta-catalog` v8, `retry-order-handoffs` v3 (platform version counters drift upward without content changes — content parity via `git diff` is what matters, confirmed). `FLOW_SIGNATURE_MODE` is `enforce`; flow tokens are HMAC-signed via `FLOW_TOKEN_SECRET`. Order creation and payment-webhook order-advancement are atomic via three Postgres RPC functions (migration `20260924155516`) with built-in self-healing on duplicate/retried payment webhooks — **live-tested successfully** on a real test order (id 132) on 24 Sep night, full trace clean end-to-end except an n8n-side 503 (confirmed not our bug). Payment link + `order_details` expiry is now ~16 minutes (was 24h), with `payment_link.expired`/`cancelled` handling in `razorpay-webhook` (migration `20260924181608`) — paid path **live-tested** (order 133, 25 Sep); expired path **not yet** (needs a real order left unpaid ~16 min; `payment_link.expired`/`cancelled` are already ticked in the Razorpay dashboard). `RAZORPAY_MODE` is now strictly validated and an empty `WHATSAPP_VERIFY_TOKEN` is rejected (v89/v29). The Address Flow v7.3 is a protected working baseline. Catalog sync is now manual-only. See §14 above for the prioritized outstanding-work list. **First priority**: live-test the expired path. Permanent WhatsApp token and hard-coded production IDs are confirmed by the owner; only Supabase MFA remains owner-side. The next code item is removing the legacy unsigned flow-token fallback in `whatsapp-flow` (and the matching legacy regex in `whatsapp-webhook`'s `parseAddressFlowToken`) — safe after 25 Sep ~15:30 UTC (24h after the signed-token deploy), once logs confirm no legacy-token warnings. Splitting `whatsapp-webhook` into multiple files is deferred to Phase 2. Make one focused change at a time, deploy the complete function via the CLI, verify the active version, commit/push, and test the real runtime path before moving to the next item.

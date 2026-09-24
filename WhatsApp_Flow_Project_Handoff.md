# WhatsApp Flow App — Project Handoff

Last updated: 24 September 2026 (evening — see §14 for the three items closed this session). Supersedes `WhatsApp_Flow_Project_Handoff_September_2026_v6.docx` (deleted — it was stale).

## 1. Source-of-truth rules

- The **GitHub repo** (`https://github.com/samskruthrml21-eng/Madikar-Taila.git`, default branch `main`) and the **live Supabase project** are now both source of truth and are kept in sync — `main` is a byte-for-byte copy of the deployed Edge Function source (confirmed via `supabase functions download --use-api` + `git diff`, no differences).
- Before any WhatsApp Flow or WhatsApp Cloud API change, consult the latest Meta documentation and inspect the currently deployed function / the repo copy (they should match).
- Before Supabase schema/RLS/migration changes, inspect the live schema and current advisories.
- Make one focused change at a time; deploy the complete function via the Supabase CLI (`--use-api`, no Docker available on this machine); verify the active version; test the real runtime path; commit and push so the repo stays in sync.
- Do not modify the working Address Flow JSON (`Latest Address Flow JSON_7.3.md`) unless a specific Flow-layer problem is demonstrated.

## 2. Business context

- **Phase 1**: this is a WhatsApp ordering bot for "Madikar Taila" oil products (Sesame, Coconut, Safflower, Sunflower, Groundnut, Mustard, Almond). Customers place orders and pay entirely inside WhatsApp.
- The client currently views/fulfills orders via a **Google Sheet fed by n8n** (Append operation, triggered from `razorpay-webhook` after a payment is confirmed). This is a **temporary measure** until a staff-only front-end is built.
- The planned front-end is for the client and their team to manage orders — **not** customer-facing. A separate customer-facing e-commerce storefront may be built later as its own phase.
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

| Function | Version (as of 24 Sep evening) | verify_jwt | Purpose |
|---|---|---|---|
| `whatsapp-webhook` | v83 | false | Primary WhatsApp webhook — registration/profile, messages, cart/order creation, address-checkout orchestration, checkout messaging. Verifies Meta's `X-Hub-Signature-256`. `viewOil`/`OIL_PRODUCT_IDS` dead code removed (v83). |
| `whatsapp-flow` | v44 | false | Flow INIT/data_exchange endpoint for the Address Flow and the shared registration/Settings Flow. Checks Meta's signature — now in **`enforce`** mode (see §9). Dead `UPDATE_PROFILE` `data_exchange` handler removed (v44); the `INIT` pre-fill path is unchanged. |
| `razorpay-webhook` | v24 | false | Verifies Razorpay signature, processes `payment_link.paid`, updates payment/order state, schedules `order_status` + n8n handoff. |
| `sync-meta-catalog` | v6 | true | Pulls the full Meta catalog into `public.Product`. Manually triggered only (see §6). Now guarded against wiping the local catalog on an empty Meta response (v6), and quotes `retailer_id` defensively inside the stale-cleanup `or=(...)` filter. |
| `retry-order-handoffs` | v1 | false | Called every 5 minutes by `pg_cron`; resends any due n8n order handoff. Can't do anything except resend what's already due, so it's safe without JWT auth. |

`meta-catalog-webhook` has been **deleted** (dashboard + `WHATSAPP_CATALOG_VERIFY_TOKEN` secret removed). The two test-only functions mentioned in older docs (`whatsapp-flow-key-register-test`, `test-order-status`) no longer exist.

## 6. Catalog architecture (manual sync only)

The automatic webhook chain (Meta Catalog → `meta-catalog-webhook` → `sync-meta-catalog`) has been **retired**. Current flow:

1. Make the catalog change in Meta Commerce Manager.
2. Manually invoke `sync-meta-catalog` (Supabase dashboard "Test" panel, or `curl` with the service-role key).
3. `sync-meta-catalog` pages through Meta's `/products` endpoint, upserts into `public.Product` by `(catalog_id, retailer_id)`, then deletes local rows for the configured catalog that Meta no longer returned.

Known open risk: if Meta ever returns zero products on a good day, the delete step would remove every local product. Not yet guarded against.

`public.Product` is a local cache: `id, created_at, name, retailer_id, description, product_link, catalog_id, updated_at`. It deliberately does **not** store price — checkout uses the incoming WhatsApp cart item's price. Current row count: 7 (all seven oils).

## 7. Checkout and payment architecture

```
WhatsApp cart → pending_payment order + order_items
  → checkout-address:<order_id>:<uuid> token → Address Flow
  → address attached to order
  → Razorpay Standard Payment Link created/reused (UPI only; card/netbanking/wallet disabled)
  → review_and_pay order_details message
  → verified Razorpay payment_link.paid webhook → payment=paid, order=processing
  → "Payment received" order_status message + n8n handoff (with retry)
```

- Payment success is authoritative **only** via the verified `payment_link.paid` webhook. The callback redirect is not proof of payment.
- `RAZORPAY_MODE` (`test`/`live`) selects which key/secret pair and webhook secret to use — both test and live credentials are configured, so switching modes is a one-word env var change. **Not yet hardened**: any value other than exactly `"live"` currently falls through to test mode, including a typo or unset var. This should be tightened before real launch.
- Payment link expiry is currently **24 hours**. Razorpay's minimum is 15 minutes; WhatsApp's `order_details` expiration field minimum is 300 seconds. Tightening this to ~15 minutes (with `payment_link.expired`/`cancelled` handling) is still open work.
- Order creation (order + order_items in two separate inserts) and address attachment → payment-link creation → message send are **not yet transactional** — a failure partway through can leave an order in an inconsistent state that a naive retry won't repair. Still open work.
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
- **Still open**: the signature check only proves the request came from Meta — it does not stop someone from taking a validly-signed request and substituting a different `order_id` or phone number in the flow token (order IDs are sequential integers). Signed/authenticated flow tokens are the real fix and are not yet built.

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

**Still open (see the outstanding-work list, §14):**
- Flow signature check not yet in `enforce` mode.
- No signed/authenticated flow tokens — order/profile lookups by flow token are not cryptographically bound to the intended recipient.
- Order/payment writes not transactional; partial-failure states possible.
- `RAZORPAY_MODE` isn't strictly validated.
- Leaked-password protection disabled (irrelevant until staff log in via a front-end).
- Every WhatsApp user currently gets a hidden Supabase Auth account with a fake email — fine for now, but should be removed before a staff front-end exists, so the user list isn't polluted with customer entries.

## 13. Live database state (24 Sep, all test data)

Orders: ~125 (sequence has one gap from a retried insert — normal). Order items: 157. Addresses: 10. Payments: 23. Profiles: 8. Products: 7. All data to date is test data and should be wiped before a real launch.

## 14. Outstanding work (in rough priority order)

**Done, 24 Sep evening (quick/low-risk batch):**

1. ~~Flip `FLOW_SIGNATURE_MODE` to `enforce`~~ — done via a secret update (no redeploy needed). Pre-flip logs showed `valid:true` on the last 50 real Flow requests (~3 hours), zero failures. **Live-tested and confirmed** with a real Settings update + Address Flow run post-flip — all `valid:true`/`mode:enforce`, all `200`s, no errors.
2. ~~Remove dead code~~ — done. `whatsapp-flow` v44: unused `UPDATE_PROFILE` `data_exchange` handler removed. `whatsapp-webhook` v83: unused `viewOil`/`OIL_PRODUCT_IDS` removed (including both call sites in the `button` and `button_reply` handlers).
3. ~~Guard `sync-meta-catalog` against an empty Meta response~~ — done (v6). A zero-product Meta response now short-circuits before the stale-deletion step and returns `{"cleanup_skipped":"empty_meta_response"}` instead of wiping `public.Product`. Also added defensive double-quoting of `retailer_id` inside the stale-cleanup `or=(...)` filter (via a new `quotePgFilterValue` helper) per the PostgREST filter-encoding lesson in the Error Prevention Guide §9.

All three: esbuild-bundle-checked, deployed via `npx supabase functions deploy ... --use-api`, active version verified via `list_edge_functions`, re-downloaded and `git diff`-confirmed byte-identical to the repo, committed (3 separate commits) and pushed to `cursor/production-hardening`.

**Still open, in rough priority order:**

1. Signed/authenticated flow tokens (the real fix for order/profile-lookup forgery).
2. Transactional order creation + self-healing retry for the payment webhook (payment "paid" but order stuck "pending_payment" on partial failure).
3. Tighten payment link + `order_details` expiry to ~15 minutes; handle `payment_link.expired`/`cancelled`.
4. Production config hardening: strict `RAZORPAY_MODE` validation, permanent (non-temporary) WhatsApp system-user access token, confirm all hard-coded IDs (see table in `WhatsApp_Flow_Error_Prevention_Guide.md`) are the real production values, reject an empty `WHATSAPP_VERIFY_TOKEN`, enable MFA on the Supabase account.
5. Split `whatsapp-webhook` into multiple files under one function (maintainability only, no behavior change).
6. Before a staff front-end: rename `Product`/`Profile`/`whatsAppUserId` to snake_case, detach `Profile` from `auth.users` and stop creating a hidden Auth account per WhatsApp customer, add staff-role RLS policies.
7. Decide on the Supabase plan (Free → Pro) before treating this as a real production launch; re-run advisors and wipe test data at that point.

## 15. Continuation prompt

Continue the WhatsApp Flow App from the state dated 24 September 2026 (evening). The GitHub repo (currently `cursor/production-hardening`, one merge away from `main`) and the live Supabase project (`faoomjgkofqrdajaftjd`) are kept in sync — inspect both before changing anything, and re-confirm parity with `supabase functions download --use-api` + `git diff` after any manual edit. Current active functions: `whatsapp-webhook` v83, `whatsapp-flow` v44, `razorpay-webhook` v24, `sync-meta-catalog` v6, `retry-order-handoffs` v1. `FLOW_SIGNATURE_MODE` is now `enforce`. The Address Flow v7.3 is a protected working baseline. Catalog sync is now manual-only. See §14 above for the prioritized outstanding-work list — items 1/6/7 (as originally numbered) are done; start with signed/authenticated flow tokens next. Make one focused change at a time, deploy the complete function via the CLI, verify the active version, commit/push, and test the real runtime path before moving to the next item.

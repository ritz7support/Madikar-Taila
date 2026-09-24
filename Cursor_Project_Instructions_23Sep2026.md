# WhatsApp Flow App — Cursor Instructions

Last updated: 24 September 2026 (night).

## Runtime source of truth
The GitHub repo (`cursor/production-hardening` branch, one merge away from `main`, `https://github.com/samskruthrml21-eng/Madikar-Taila.git`) and the live Supabase Edge Functions/database are both source of truth and are kept in sync — the branch has been confirmed byte-for-byte identical to the deployed function source after every change this session. Treat a mismatch between them as a bug to investigate, not something to silently paper over.

Current functions (see `WhatsApp_Flow_Project_Handoff.md` §5 for full detail):
- whatsapp-webhook v87
- whatsapp-flow v47
- razorpay-webhook v27
- sync-meta-catalog v8
- retry-order-handoffs v3

(Platform version counters drift upward without content changes on some of these — confirmed via `download` + `git diff` showing zero diff. Content parity is the signal that matters, not the raw number.)

Order creation (`whatsapp-webhook`) and payment→order advancement (`razorpay-webhook`) are now atomic via three Postgres RPC functions added in migration `20260924155516_add_transactional_order_and_payment_rpcs.sql` (`create_order_with_items`, `advance_order_to_processing`, `mark_payment_paid_and_advance_order`), closing the "transactional order creation + self-healing payment webhook" item from the outstanding-work list. **Not yet exercised by a real WhatsApp order + real Razorpay payment** — do that before further changes.

`meta-catalog-webhook` has been deleted (catalog sync is now manual-only).

## Before making changes
1. Inspect the current deployed Edge Function source (or the git copy — confirm they match with `supabase functions download --use-api` + `git diff` if in doubt).
2. Inspect the relevant live Supabase schema/data when applicable.
3. For WhatsApp Flow or WhatsApp Cloud API changes, consult the latest Meta documentation first.
4. Make one focused change at a time.
5. `esbuild`-bundle-check the edit, then deploy the complete function via the Supabase CLI (`--use-api`, no Docker on this machine), then verify the active version.
6. Re-download and `git diff` to confirm the repo still matches, then commit and push.
7. Test the real runtime path.

No Docker/`gh` CLI on this machine — use `npx supabase ...` and plain `git`.

## Protected paths
Do not modify the working Address Flow JSON (`Latest Address Flow JSON_7.3.md`) unless a specific Flow-layer problem is demonstrated.
Protect:
- registration
- registration → main menu
- cart → address Flow → address attachment
- Razorpay Payment Link → review_and_pay
- Razorpay payment_link.paid → order/payment status
- Settings → Update Personal Information

## Current catalog architecture (manual sync only)
Meta Commerce Manager change → manually invoke `sync-meta-catalog` → `public.Product`.

The automatic webhook chain (`meta-catalog-webhook`) has been retired and the function deleted. Do not reintroduce automatic catalog webhook handling into `whatsapp-webhook` if this is ever revisited — it should stay a dedicated endpoint.

`sync-meta-catalog`:
- Uses Meta fields `retailer_id`, `name`, `description`, `url`. Maps `url` → `Product.product_link`.
- Upserts by `(catalog_id, retailer_id)`.
- Removes stale products after a successful full sync (known gap: doesn't yet guard against Meta returning zero products).
- `verify_jwt=true` — only we call it, never Meta.

## Current Product schema
Product contains: `id, created_at, name, retailer_id, description, product_link, catalog_id, updated_at`.

Product does not contain transaction price. Checkout uses the incoming WhatsApp order-item price.

## Current main menu
Only:
- Place a new order
- Settings

Do not reintroduce Order history unless explicitly requested.

## Current Supabase security posture
- `public.payments`: RLS **enabled** (fixed 23 Sep). `anon`/`authenticated` have **zero** privileges on any `public` table, including future ones (default privileges revoked too).
- `Product`/`Profile`/`orders`/`order_items`/`addresses`: RLS enabled, no policies (correct while only the service-role key touches these tables).
- Function search_path fixed on the two `updated_at` trigger functions.
- `whatsapp-flow` checks Meta's request signature on Flow endpoint calls (`FLOW_SIGNATURE_MODE=enforce` as of 24 Sep evening — rejects invalid signatures with HTTP 432; flipped after confirming `valid:true` on 50 consecutive real requests).
- Leaked-password protection is disabled — irrelevant until a staff front-end with real logins exists.
- Flow tokens are now HMAC-signed and verified (`FLOW_TOKEN_SECRET`) — see handoff doc §9/§14.

## n8n order handoff
`razorpay-webhook` sends the paid-order payload to `N8N_WEBHOOK_URL` inline; on failure, a `pg_cron` job (`retry-order-handoffs`, every 5 minutes) retries via the `retry-order-handoffs` Edge Function, up to 24 attempts. Tracked on `orders.handoff_sent_at`/`handoff_attempts`/`handoff_last_attempt_at`/`handoff_last_error`. n8n appends rows to a Google Sheet — this is a temporary Phase 1 measure until a staff front-end is built; keep the n8n workflow itself simple (no shared secret yet, by design).

## Region pinning
`whatsapp-webhook` and `whatsapp-flow` endpoint URLs (configured in the Meta App Dashboard) include `?forceFunctionRegion=ap-south-1` so they run next to the `ap-south-1` database instead of near Meta's US-based callers. Don't remove this without re-measuring latency.

## Test-only functions
None remain — `whatsapp-flow-key-register-test` and `test-order-status` (mentioned in older docs) no longer exist.

## Documents
Use these project sources together:
- `WhatsApp_Flow_Project_Handoff.md` — full current-state handoff, outstanding-work list, continuation prompt.
- `WhatsApp_Outbound_Message_JSON_Reference.md` — every outbound WhatsApp message contract, reconstructed from the current deployed source.
- `WhatsApp_Flow_Error_Prevention_Guide.md` — lessons learned, regression checklist, hard-coded values to confirm before launch.
- `Latest Address Flow JSON_7.3.md` — protected Flow JSON, do not edit casually.

(The three `.docx` files previously listed here have been deleted — they were stale as of 23 Sep and are fully superseded by the three `.md` files above.)

Do not assume any document is newer than the live deployment. If they conflict, inspect the live deployment and treat it as authoritative, then update the doc.

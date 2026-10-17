# Phase-one closure — 17 October 2026

The owner requested faster admin Orders loading, smaller product-page typography and uncropped images, investigation of a missing Delivered message, consolidation of all completed branches into main, and a Claude review prompt. Work continues from `8b320b5` on `codex/phase-one-final-polish`; the completed result is consolidated into `main` without rewriting history. Older branches are retained.

## Diagnosis and fixes

**Orders loading:** the existing browser waited until the first Orders click to request data. The read-only database query took 34.209 ms; 17 recent website-function requests averaged 746 ms (maximum 1,133 ms), before browser/Sites overhead. These function timings include multiple website actions, not a pure Orders benchmark. No evidence justified changing database indexes or weakening authentication.

The first private Orders page now loads immediately after successful team authentication, in parallel with Products. Clicking Orders during that load shares it. The current page can be reused for 30 seconds; revisiting stale data refreshes it while retaining visible rows. Refresh always fetches, source/page changes fetch their own data, and fulfillment/message changes expire the cached timestamp. Data remains in page memory, not browser persistent storage or a public cache. Sign-out clears rows and invalidates pending responses so a late request cannot repopulate them.

**Product page:** the image occupied a large square grid cell with `object-fit:cover` for images not marked as supplied photos. The product title could reach 68 px. The page now has a 1,120 px maximum width; the desktop image frame is capped at 500 px and every product image uses `contain` with padding. The complete original image is visible without modifying any image file or database URL. Titles are 32–44 px, descriptive text is 15 px, and supporting headings/prices are reduced. Mobile controls remain comfortably usable.

**Delivered messages:** the owner identified either of these orders. Times below are IST:

| Order | Finding |
| --- | --- |
| `ORD-1792003713675-ACADF8` / 171 | Marked Delivered at 12:43 on 17 October, before the notification feature was deployed around 16:59. Its earlier shipping notification was accepted. No delivery notification was queued. |
| `ORD-1792001181671-188CD7` / 170 | Updated at 17:18 on 17 October and now Delivered, with no tracking, shipment notification or delivery notification. The former trigger required Shipped → Delivered; a direct Processing → Delivered change did not qualify. There is no full stage-transition audit trail, so the exact preceding stage is inferred from the available records. |

There was no failed Meta delivery attempt to retry for either order: both lacked an outbox entry. The new trigger queues on any **new change to Delivered** for an eligible paid order, including when Shipped is skipped. The website worker schedules it immediately in the background. Re-saving Delivered does not create another notification. Existing queue leases, accepted-message protection, uncertain-send holds, attempt limits and the approved `order_delivered` / `en` / named `order_number` payload remain intact.

For an already-delivered order without an entry, the admin now shows **Send delivery message**. This explicit action creates a single queued job without changing historical fulfillment or payment state. Duplicate clicks cannot requeue an in-flight, accepted or uncertain message. No automatic historical backfill or message send was performed during this work. The owner can use that button on orders 170/171.

## Publication and data preservation

- Applied `20261017120519_delivered_notification_transitions.sql`. The MCP apply tool twice returned an expired request-state error. Read-only checks confirmed the original trigger and absent migration. CLI dry-run then proved this was the only pending migration; `db push --project-ref faoomjgkofqrdajaftjd --skip-vault --yes` applied just that file. No seed, role or Vault update.
- Only `madikar-store` was deployed, now **v20**, SHA `8131a2bf32e6deadd63c8334aa60795acd44c596009d201bc5fe6415bf1227d5`. All eight source files match local. The single runtime change schedules delivery after any non-Delivered → Delivered transition. Other five Edge Function sources, versions and authentication remain unchanged.
- Same public Site **36**, project `appgprj_6ab742ddf3e48191911b4bb531bb0ca8`; source `23fb348e6ef0fd7bc7f1fec59e4d36f365d20923`; deployment `appgdep_6ad36998fca48191aa9bc520fa339f9b` succeeded. Public domain remains https://madikartaila.com. GitHub and Sites commit IDs are different. Subsequent repository handoff/README updates do not change the published runtime assets.
- Fingerprints of Product, ProductVariant, orders, order_items, payments and checkout settings match the start of this task. Existing RLS/grants, policies and cron jobs are unchanged. The intended trigger and `store_retry_delivery_notification(bigint)` are the only database behavior changes. Delivery queue and new Payment Link sessions remained empty at verification.
- No Meta catalog write, full sync, price/weight change, payment, customer message, order-status edit or secret change was performed. The earlier payment/shipping rollout remains active.

## Verification

- **101 automated tests passed.** New coverage checks sign-in preloading, fresh/expired/forced reads, pending-load deduplication, sign-out versus late response, historical send affordance, direct Processing → Delivered scheduling and no repeated scheduling when already Delivered.
- Three live rollback-only SQL suites passed: payment links/shipping/delivery, unified order references, and shipment notifications. Updated delivery fixtures also verify direct transitions, explicit historical queue creation, duplicate rejection, correct buyer/reference, accepted-message no-resend and private permissions. All fixture data was rolled back and no sender was invoked.
- Headless Edge browser checks passed at 320/390/768/1024/1366/1440 px without overflow or JavaScript errors. The tested portrait source is 800 × 1,071 px; full-image fit and a frame no taller than 500 px were verified. Desktop and mobile screenshots were inspected.
- With a simulated 700 ms Orders response, sign-in preloading let the Orders click render in **49 ms** without a second request. Refresh made a new request. Historical sending was exercised with a mocked response only; no live send. Sign-out removed rendered order rows. This is a controlled browser measurement, not a guarantee of every user's network speed.
- Backend bundle and Worker build pass. Live `styles.css` and `admin.js` match local source; home, product, admin, checkout config and catalog return 200. Checkout still reports Payment Links and weight shipping; catalog has 59 public products. Unsigned backend requests return 401.
- Security advisors retain the expected private RLS/no-public-policy informational results and the existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no security configuration was changed.

Evidence is ignored under `outputs/phase-one-close-20261017/`: browser checks/screenshots, test output, live checks and isolated Sites publishing source. No secrets or customer exports are committed.

## Main branch and review handoff

Fetched all remote branches and checked every local/remote branch tip against the latest development history. All previous work is already ancestral to `8b320b5`, including bot hardening, website, admin, shipment, variant IDs, catalogs, availability, payments and shipping. The final fix is committed and main is fast-forwarded to it, then pushed; no force-push, cherry-pick duplication or branch deletion is needed. Future work should start from current main, not an older dated branch checkpoint.

The independent review prompt is `CLAUDE_PHASE_ONE_REVIEW_PROMPT.md`. It asks Claude to challenge the implementation using actual code/tests and read-only live evidence, and to distinguish production blockers, hypotheses and optional improvements. It does not authorize changes or external writes.

The earlier limitations still apply: new hosted Payment Link purchases and delivered-template handset receipt have not been tested live by this implementation; the owner-deferred different-parent-ID pack purchase remains separate. The owner has now entered **910 g for Mustard oil 1 L (variant 18)**. Fresh inspection found **zero missing variant weights**; its live quote returns 1,010 g including the box and ₹40 shipping. Intentional ₹1 prices require the owner's pre-launch review. Physical box fit and combined-consignment carrier billing remain documented assumptions. Full catalog sync remains deferred.

# Supabase CSV images, storefront speed and stock controls

Completed 15 October 2026 on `codex/store-speed-stock-sync`, based on `b3d894a`. Canonical workspace: `D:/cursor projects/Madikar taila`. Existing admin, shipment, variant identity and WhatsApp order-prefix work is preserved.

## Published result

- Same public Site, version **34**, project `appgprj_6ab742ddf3e48191911b4bb531bb0ca8`, source `3346982dbe2d15662f9cd3d25ec8be81a67dc1f4`, deployment `appgdep_6ad0a7c4f9208191838f6cc33084dc8b`. Public origin: https://madikartaila.com. The selected source was opened before edits, synchronized from canonical website/, built, pushed, packaged and published through Sites.
- Only `madikar-store` was deployed, as **v17**. All five deployed modules match local source after newline normalization. Existing authentication/signing keys are preserved. `whatsapp-webhook` 95, `whatsapp-flow` 50, `razorpay-webhook` 34, `sync-meta-catalog` 11 and `retry-order-handoffs` 6 retain their versions, hashes and auth settings.
- Migration **20261015095016_store_catalog_availability** is applied with its Supabase-recorded timestamp. The recovery job is active and the queue remains empty. No real pack was toggled during testing.

## CSV image replacement

Fresh authenticated, GET-only Meta snapshot: **15 October 15:21:29 IST**, catalog `1515875913870520`, 94 unique items across three pages with matching before/after counts. Every item maps to an existing variant; every price and product URL matches Supabase. Four intentional ₹1 test packs remain.

`docs/catalog/Meta_Catalog_2026-10-14.csv` retains its established filename and 15-column format. **Only image_link changed**: all 94 rows use the matched parent product's first public Supabase Storage image. All 59 distinct image URLs returned HTTP 200 and an image content type. All other 1,316 data cells are identical to both the prior CSV and the fresh Meta snapshot. No ID, price, inventory, description, size, grouping or product link was changed. UTF-8 BOM, quoted RFC 4180 rows and exact retailer-ID case are preserved. SHA-256: `ea44f2863c21505601e818ff0ef7ce02d58ab716fcf2e5c6036d1d9cf43ae57b`.

The canonical CSV, earlier delivered copy, guide and ₹1 checklist were refreshed. Workbook round-trip and independent Python source comparisons passed. The guide still records the 25 missing brand/GTIN/MPN identifiers and mixed manual/feed ownership considerations. This is an editing base, not an assurance that a blanket replacement upload is safe. The user explicitly confirmed the image replacement is **CSV-only**. No upload, Meta image update, full sync or any other live Meta write was performed. The temporary authenticated reader was deleted and returns 404.

## Website behavior

- Home/product links, All products and confirmation dismissal use browser history and the loaded catalog/bag instead of full page reloads. Back/forward and ordinary modified-link behavior are preserved. Product-page HTML hides the home hero before initial rendering.
- Product photos have explicit dimensions, asynchronous decoding and a Supabase preconnect; the current source images are retained. The storage image-transform endpoint returned 403, so no unavailable transformation feature or paid plan change was introduced.
- Copy product link replaces the WhatsApp-specific label/input. It copies the current product page URL; unavailable clipboard access shows the link for manual copying.
- Static asset responses use a deployment-content-versioned named edge cache where the Worker handles them, with browser revalidation and an ASSETS fallback. Catalog, admin and checkout API responses remain uncached. Private/no-store/Set-Cookie/error responses are excluded. Native static hosting retains its own cache behavior.
- The browser immediately shows confirmation progress after Razorpay's success callback. Provider payment and order reads run concurrently, retaining signature, identity, amount, currency, captured/paid-state and transactional order-finalization checks. Pending/network-error cases poll the existing session with bounded delays. Closing progress retains the saved session and blocks a second payment attempt. Only confirmed paid state consumes the bag and shows success. Version 34 also guards overlapping verification/status responses so they cannot consume the bag or reopen confirmation twice, including after dismissal. Existing background n8n/messages/webhook recovery is unchanged.

Version 32 exposed a hosting restriction during the live check: `caches.default` is forbidden in an isolated Workers namespace. Direct product routes returned 500. Version 33 fixes this with a named cache and a fallback on cache-open/read errors, plus a regression test. Do not deploy version 32. [Cloudflare's isolation documentation](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/reference/worker-isolation/) explains the restriction.

Observed timings are individual client-side samples, not a controlled benchmark. The local All products transition took 42 ms with one document load retained throughout navigation and mocked checkout. After the corrected live publication, direct product HTML took 109/88 ms, FAQ 158/125 ms, and home samples ranged from 65 ms to 4.15 s. Catalog/config were 1.89/1.34 s in that run and remain uncached. Routing eliminates the repeated home/catalog fetch; network and cold-start variability still affect initial loads. No extra real payment was made to measure paid confirmation latency.

## Availability controls and Meta boundary

Admin users can set a single pack's Availability and Save, or use Mark all packs out of stock / Mark all packs in stock. Numeric inventory controls were removed; existing quantities are preserved when omitted by the new UI. All 94 current packs remain `available` with `inventory_quantity=NULL`. Existing paid orders, prices and weights are unchanged. The store's Listed flag remains a separate website visibility choice, not a Meta stock toggle.

The website disables adding/increasing unavailable packs and disables checkout when an unavailable pack is already in the bag. Catalog reads refresh on focus after 30 seconds, on another admin tab's notification, and before an add after 30 seconds. Checkout always validates current server availability; an already-open tab can briefly show its last-read state. No fixed stock count or decrementing inventory was added.

The private queue stores each variant's parent catalog ID, exact retailer ID, desired availability, revision, attempt count and lease. Changes enqueue in the same transaction as the variant update. A service-only bulk RPC updates only the selected parent's availability. Worker claims use row locks/SKIP LOCKED, batches of six, three-minute leases and concurrency three. A newer edit remains pending if an older revision finishes. Explicit failures retry with backoff up to eight attempts; expired final attempts stop as error. Manual retry cannot steal an active lease.

The worker reads the entire catalog using cursor-only pagination and server-side credentials, rejects missing/ambiguous identities, then sends **only** `{availability:'in stock'}` or `{availability:'out of stock'}` to the matched numeric Meta item. No item is created or deleted; numeric inventory, image, price, size, product links, group IDs and parent retailer IDs are untouched. GET read-back must match the item, retailer ID and desired availability before the admin displays synced. Permission/mapping failures show a sanitized error and Retry sync. Recovery runs every minute only while work is due, using the existing private website recovery credential without rotating it.

Real Meta toggles were intentionally not exercised. Mocked tests verify exact requests, pagination, transient/permanent errors and read-back; the live reader verifies mappings/read permission. Actual write permission and Meta UI propagation will be confirmed by the owner's first intended stock change. The admin must show a verified result, not assume an HTTP success means the toggle propagated. No customer message is sent by stock synchronization.

## Verification and preservation

- **76 automated tests passed**, including exact-pack-only Meta writes, rejected ambiguity/missing IDs, no false sync on unmatched read-back, retry handling, server stock rejection before a provider order, admin auth/scope, preserved inventory/retailer IDs, parallel payment reads, pending confirmation reconciliation and cache-denial fallback.
- `supabase/tests/store-catalog-availability.sql` passed on the applied migration. All fixtures rolled back. It checks exact mappings, unchanged other variant fields, lease exclusion, concurrent revisions, stale finish rejection, permanent/transient errors, retries, expired final attempts, bulk-parent scope, unmapped packs and denied public/authenticated access. Uncommitted fixture jobs were never visible to cron.
- Headless Edge checks against localhost passed at widths 320/390/768/1440, with no page errors or horizontal overflow. Payment and admin writes were mocked. Checks covered copy, All products, back/forward, bag preservation, stock blocking, bulk/per-pack controls, pending/synced/error/retry UI, immediate payment progress, close/reconciliation and exactly one mocked payment order.
- Live Site checks pass: product/home/FAQ HTTP 200; six changed JS/CSS assets match local; 59 products/94 variants retain prices, quantities and stock; checkout ready with zero shipping; unsigned website/recovery requests return 401; removed reader returns 404. All 66 product/static URLs returned valid HTTP 200 HTML. The live browser returned through All products in 42 ms with one document load, one catalog GET and no page errors; screenshots and results are in the evidence directory. Post-fix Worker error logs were empty.
- Before/after hashes match for every Product/ProductVariant field, orders/items/payments, checkout settings, existing function definitions, RLS/grants/policies and existing cron definitions. No payment/refund, new order, customer message, bot deployment, full sync or Meta write occurred.
- Security advisor: the new queue intentionally has RLS and no client policies, with client grants revoked. The existing Auth leaked-password-protection warning remains unchanged; [Supabase guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No unrelated security settings were changed.

Evidence is retained in ignored `outputs/store-speed-stock-20261015/`: full catalog snapshots, protected-data hashes, CSV comparison, public image checks, browser screenshots/results, published-source parity and live measurements. Tokens/private signing material were not saved there.

## Still separate

The owner's non-default-pack live payment test remains deferred. Full Meta catalog sync redesign, shipping calculations, broader content/metadata reconciliation, bot payment-method bookkeeping and previously documented recovery/handset-delivery checks remain outside this change. Refresh this dated CSV after subsequent catalog edits before reusing it.

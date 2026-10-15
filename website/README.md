# Madikar Taila website source

Canonical source for Site appgprj_6ab742ddf3e48191911b4bb531bb0ca8, https://madikartaila.com. Sites is a publishing mirror; preserve its project/audience. See ../PROJECT_HANDOFF.md for the current deployment version and source commit. The 15 October work continues on codex/store-speed-stock-sync from b3d894a, preserving the admin, shipment and variant-ID work; do not reset to the older main branch.

Read ../PROJECT_HANDOFF.md, ../docs/plans/VARIANT_RETAILER_IDS_PHASE2_REPORT.md, ../BOT_BACKEND_DO_NOT_TOUCH.md, PAYMENTS.md and POLICY_PAGES.md. All 94 current variants have verified retailer IDs. The website prefers variant IDs for new quotes, with parent fallback; whatsapp-webhook v95 resolves exact packs. Prices, historical items, zero shipping, UPI-only configuration and existing n8n/payment/shipment messages are preserved. The refreshed 94-item CSV and ₹1 checklist are in ../docs/catalog/. Its image links now use Supabase; no CSV was uploaded to Meta. Do not replay backfill, insert superseded hidden rows or invoke current full sync; sync redesign remains separate.

## Navigation, payment confirmation and stock

Home/product navigation reuses the loaded catalog and bag, including All products and confirmation dismissal. Other static pages use a deployment-versioned edge cache; API responses remain uncached. Product photos have explicit dimensions, asynchronous decoding and a Supabase preconnect. Copy product link copies the current product URL.

Payment verification reads the provider payment and order concurrently, retaining all checks and transactional finalization. The page immediately displays confirmation progress after the provider callback and polls the saved session if necessary. Only a server-confirmed paid session displays success. Closing the progress view retains the session and prevents a second payment attempt.

Admin pack Availability uses In stock / Out of stock, with buttons to change all packs of a product. There is no numeric stock input; omitted quantities preserve existing data. Website checkout and fresh catalog reads reject unavailable packs. Open customer tabs refresh on focus; adding after 30 seconds refreshes first. Existing paid orders remain unchanged.

Stock changes queue an availability-only update to the exact retailer ID in its parent Meta catalog. The private queue uses leases, revisions and bounded retries; a read-back must match before the admin shows synced. A newer edit remains pending if an older request finishes. Permanent failures show Retry sync; automatic recovery runs every minute. Unmapped packs cannot update Meta. Image, price, inventory and other Meta fields are never written by this feature. Real Meta toggles are reserved for the owner's stock changes; implementation verification used mocked Meta and rollback-only SQL fixtures.

## Layout and checks

- dist/client/ is editable source, including storefront, checkout, policy/admin pages, CSS and assets.
- server/worker-template.js builds into dist/server/index.js. Run npm run build here.
- Run npm test here for all current frontend, Worker, backend auth/catalog, checkout and confirmation tests. They use mocks; no customer messages or charges.
- ../supabase/functions/madikar-store/{index,checkout,confirmation,shipment,availability}.ts is the canonical backend source.
- db/ and server/supabase-store-function.js are historical references. Do not apply/deploy them over live. Current migrations belong in ../supabase/migrations/.
- The hero-wide-bottle.webp asset supplies desktop panoramic framing; the original image remains used on mobile.

## Publish to the same Site

1. Use Sites `get_site` and `create_source_repository_write_credential` for the exact project ID above. Open its source with the Sites `site-workflow.mjs` helper in a separate empty checkout. The Sites hosting skill documents the credential handoff through hidden stdin.
2. From this directory, run `node scripts/sync-to-sites.mjs <absolute-path-to-opened-Sites-checkout>`. The script verifies both hosting manifests, copies all website files, and checks their hashes. It stops if the mirror has files absent here; review those files before removing them.
3. In the opened Sites checkout, run the same `site-workflow.mjs` helper with the opening result as `source`, `commands: [["node", "scripts/build-worker.mjs"]]`, and an absolute `archivePath`. It builds, commits and pushes the mirrored source, then packages the deployable output.
4. Save the returned `commit_sha` and archive with Sites `save_site_version`, then deploy that saved version with `deploy_site_version`. This Site is public; preserve its current audience. Check `get_deployment_status` until it succeeds and reports the live URL.

Only the Sites Worker and static files are published by this workflow. Deploying the separate Supabase function requires its own deliberate, function-specific workflow. Never deploy all Supabase functions for website work.

### Windows packaging notes

Use the installed Git Bash by prepending `D:\Git\bin` to PATH for the publishing helper. Set `TAR_OPTIONS=--force-local` so GNU tar treats a drive-letter archive path as a local path. Otherwise the helper may select unconfigured WSL or mistake `D:` for a remote host. Create the temporary Sites checkout under the same Windows account running the helper; do not add a global wildcard Git ownership exception. Keep source credentials in hidden stdin/session memory, never in commands or saved files.

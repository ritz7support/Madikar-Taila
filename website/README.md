# Madikar Taila website source

Canonical source. Latest recorded Site: appgprj_6ab742ddf3e48191911b4bb531bb0ca8, https://madikartaila.com, version 31. Sites commit: acedd13d7cd3acce09e18d800f402b46b30a4fbf. Sites is a publishing mirror; preserve its project/audience. Latest branch: codex/variant-retailer-id-phase1, based on b1d0ad7 and preserving ae53bb4. Origin/main remains older at 4769c08.

Read ../PROJECT_HANDOFF.md, ../docs/plans/VARIANT_RETAILER_IDS.md and its Phase 1 report, ../BOT_BACKEND_DO_NOT_TOUCH.md, PAYMENTS.md and POLICY_PAGES.md. Phase 1 is applied: 87 mapped IDs, eight NULLs and 95 variants preserved; runtime unchanged. Bot lookup, website item IDs and sync adoption are separate Phase 2. The three generated Meta IDs are owner-deferred. Do not replay the backfill, insert superseded hidden rows or invoke current full sync. Forty-nine mocked tests passed. Checkout stays zero shipping and UPI-only; existing n8n/payment/shipment messages are preserved. madikar-store remains v15, Site 31; no existing function or Site deployment occurred.

## Layout and checks

- dist/client/ is editable source, including storefront, checkout, policy/admin pages, CSS and assets.
- server/worker-template.js builds into dist/server/index.js. Run npm run build here.
- Run npm test here for all current frontend, Worker, backend auth/catalog, checkout and confirmation tests. They use mocks; no customer messages or charges.
- ../supabase/functions/madikar-store/{index,checkout,confirmation,shipment}.ts is the canonical backend source.
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

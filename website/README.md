# Madikar Taila website source

This directory contains the source opened from the existing Madikar Taila Site, `appgprj_6ab742ddf3e48191911b4bb531bb0ca8`. The initial copy matched all 57 tracked files byte for byte at Sites commit `0f06a2cf7f7c61c94ab4a91a4eab8d587f6654c6` (published version 12). The Site is public at https://madikartaila.com.

The Sites Git repository remains a publishing mirror. Make website edits here on `codex/website`, then sync this directory to a separately opened checkout of that **same** Site. The project ID in `.openai/hosting.json` must stay unchanged. Do not create a replacement Site or initialize a second Git repository inside this monorepo.

## Layout

- `dist/client/` holds the current storefront, checkout and admin pages, styles, scripts and image assets. These files are tracked source in the existing Site.
- `server/worker-template.js` is the Sites Worker source. `npm run build` copies it to `dist/server/index.js` and copies the hosting manifest to `dist/.openai/hosting.json`.
- `db/` contains SQL and catalog reference files from the Sites repository. They are not migration files for this monorepo and must not be applied casually to the shared Supabase project.
- `server/supabase-store-function.js` is a historical reference copy from Sites version 12. It is **older than the deployed** `madikar-store` v3 function. The live v3 source is tracked at `../supabase/functions/madikar-store/index.ts`; never deploy the historical copy.

## Publish to the same Site

1. Use Sites `get_site` and `create_source_repository_write_credential` for the exact project ID above. Open its source with the Sites `site-workflow.mjs` helper in a separate empty checkout. The Sites hosting skill documents the credential handoff through hidden stdin.
2. From this directory, run `node scripts/sync-to-sites.mjs <absolute-path-to-opened-Sites-checkout>`. The script verifies both hosting manifests, copies all website files, and checks their hashes. It stops if the mirror has files absent here; review those files before removing them.
3. In the opened Sites checkout, run the same `site-workflow.mjs` helper with the opening result as `source`, `commands: [["node", "scripts/build-worker.mjs"]]`, and an absolute `archivePath`. It builds, commits and pushes the mirrored source, then packages the deployable output.
4. Save the returned `commit_sha` and archive with Sites `save_site_version`, then deploy that saved version with `deploy_site_version`. This Site is public; preserve its current audience. Check `get_deployment_status` until it succeeds and reports the live URL.

Only the Sites Worker and static files are published by this workflow. Deploying the separate Supabase function requires its own deliberate, function-specific workflow. Never deploy all Supabase functions for website work.

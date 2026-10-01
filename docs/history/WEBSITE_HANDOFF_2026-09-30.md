# Website handoff — 30 September 2026

## Latest continuation — product catalog and pages

The requested catalog and product-page phase is complete on 30 September 2026. The same public Site, `appgprj_6ab742ddf3e48191911b4bb531bb0ca8`, is published as **version 15** from Sites source commit `6b7b3d2fbed74935e8a8e15580ecbc5d7df4fef4` (deployment `appgdep_6abcede5a65081919ad75fde076da092`). `get_site` still reports `https://madikartaila.com` with public access. The website-only `madikar-store` function is **v5**.

All 59 canonical website groups are now visible across Oils, Millets, Chutney Powder, Pickles, Ghee, Teas, Soaps, Essentials and Special. Their 90 variants retain database sizes/prices and original cart identities. All 17 extra Meta retailer-ID lookup rows remain hidden with null `store_id`; Meta sync was not invoked. Images remain in `madikar-product-images`.

Product cards now link to `/products/<slug>`; direct requests and refreshes load the Site shell, and the catalog renders the requested product or a visible not-found state. Legacy `/?product=<store_id>` links redirect in the browser after catalog load. Product pages use `website_description` and the three existing optional detail fields; their empty sections are hidden by the owner's choice. The catalog's three-attempt transient retry and Try again control remain. One live catalog check returned the known intermittent 503 before a read-only retry succeeded, so the upstream Supabase authentication problem remains unresolved. Checkout was not enabled, and no bot function, bot secret, old migration or webhook source was changed in this continuation.

Verification: seven targeted frontend tests passed; the live public API returned 59 distinct slugs, 90 variants, nine categories and 59 bucket image links; the browser confirmed the Millets filter, direct page, old-link redirect, missing-product view, Groundnut Oil's 1 L price of ₹345, and a 390 px mobile page without horizontal overflow. Details are in `outputs/website-product-pages-20260930/REPORT.md`. The owner's uncommitted `razorpay-webhook` v32 copy and earlier outputs are still preserved.

## Where to start

The owner has paused WhatsApp bot work and is moving to the website built with ChatGPT Sites. Sites project: `appgprj_6ab742ddf3e48191911b4bb531bb0ca8` ("Madikar Taila | Heritage Store"); live URL: `https://madikartaila.com`.

### Current checkpoint for the next chat

| Item | Last verified state, 30 September 2026 |
| --- | --- |
| Workspace / branch | `D:\cursor projects\Madikar taila` / `codex/website` |
| Website source | Already migrated into `website/`; do not repeat the migration |
| Latest published Site | Version 15, source commit `6b7b3d2fbed74935e8a8e15580ecbc5d7df4fef4` |
| Publication | `appgdep_6abcede5a65081919ad75fde076da092`, succeeded; public audience preserved |
| Supabase website backend | `madikar-store` v5, source in `supabase/functions/madikar-store/index.ts` |
| Catalog | 59 website product groups, 90 variants; all 59 listed |
| Bot lookup rows | 17 additional Product rows with null `store_id` and slug; always keep these hidden |
| Images | Existing bucket `madikar-product-images`; all retained Product rows linked |
| Detail pages | `/products/<slug>` live; legacy `/?product=<store_id>` browser redirects preserved |
| Loading fix | Automatic retries and Try again button published; upstream intermittent authentication failure unresolved |

Local changes from this chat are **not committed/pushed to the monorepo's GitHub branch**. The published Sites source has its own commit above. Preserve the modified docs, `website/dist/client/app.js`, `website/dist/client/styles.css`, the new `website/tests/catalog-loading.test.mjs`, the owner's downloaded `supabase/functions/razorpay-webhook/index.ts` update, and `outputs/`. The outputs contain the exact approved batch files, live data backups, retailer/variant mapping and audit reports needed for continuation. Start with `git status`; do not discard this work or restore older remote files over it.

**Repository decision (29 Sep): use one local/GitHub monorepo.** The existing `D:\cursor projects\Madikar taila` checkout and `samskruthrml21-eng/Madikar-Taila` GitHub repository are the home for both bot and website work. Completed bot work is on `main`; use `codex/website` for website changes. Put website source under `website/` in this repo; keep bot functions under their existing `supabase/functions/` paths. Use this same local folder/Codex project for the next website chat. Separate chats and branches keep tasks focused without creating a second GitHub repository.

**Migration complete:** the current Sites source was opened at commit `0f06a2cf7f7c61c94ab4a91a4eab8d587f6654c6`, which matched published version 12. All 57 tracked files were copied byte for byte into `website/`. The monorepo copy was synchronized back to the same Sites project, saved as version 13 from Sites commit `44ba235ef3482168e1bd4c024db0d1915ced8b44`, and published successfully. Sites still manages its publishing repository; `website/` is the development source and `website/scripts/sync-to-sites.mjs` mirrors it to a separate Sites checkout. The project ID and public audience were preserved, and `get_site` still reported `https://madikartaila.com` as the live custom domain after publication. See `website/README.md` for the repeatable workflow. Website-specific backend changes still belong in their own function or new migration, with a clear boundary from the bot.

Read `BOT_BACKEND_DO_NOT_TOUCH.md` before any website or shared Supabase change. The same Supabase project (`faoomjgkofqrdajaftjd`, region `ap-south-1`) hosts the bot, so do not edit or redeploy bot functions, shared bot code, existing applied migrations, bot configuration, or bot table privileges as a side effect of website work. Inspect live schema and permissions before adding website objects. Do not grant the website's `anon`/`authenticated` roles direct access to customer order, address, or payment tables merely to make website features work.

The separate `madikar-store` Edge Function was last inspected at v4 on 30 Sep. Its source matched `supabase/functions/madikar-store/index.ts` after line-ending normalization. It was **not redeployed** during catalog reconciliation or the loading fix. `supabase/config.toml` records its existing `verify_jwt = false` setting without changing bot settings. The old `website/server/supabase-store-function.js` was copied from the Sites repository as a historical reference and differs from the live function; never deploy it. The `/admin` page accepts a 43-character team access code; `madikar-store` validates its SHA-256 hash. The code was rotated on 28 Sep by changing only that hash in the deployed function. The plaintext code is deliberately absent from this repository and the Sites environment variables. If the code is lost, rotate it again; a hash cannot reveal it. The new code's hash was confirmed in the deployed source; an end-to-end login through the admin page was not independently tested.

**Website backend gap found during inspection:** the live public schema contains the website catalog columns and `ProductVariant`, but the last schema inspection did not find the `store_create_order` or `store_record_payment` RPCs referenced by `madikar-store`. The website checkout path that uses those RPCs has not been enabled or tested end to end. Re-inspect the current live schema and order integration before enabling website order creation. Do not turn on checkout as a side effect of the upcoming catalog/detail-page work.

## Product schema update — 30 September 2026

The owner approved future product URLs under `/products/<slug>`. Migration `20260929191323_add_product_website_content.sql` added `slug`, `website_description`, `traditional_benefits`, `extraction_craft`, and `ingredients_and_more`. Existing short descriptions were copied to `website_description`; the three detail fields are empty. A compatibility trigger keeps the old `short_description` field synchronized with `website_description`, so the current admin remains usable. The migration itself preserved all existing product data.

The owner's later catalog cleanup superseded the initial decision to keep 73 hidden manual products. Reconciliation against batch 1, batch 2 and updated batch 3 deleted 24 products and 25 variants, retaining the seven original oils and Mango pickle as confirmed. The live catalog now has 76 Product rows: 59 website groups and 17 hidden Meta lookup rows for extra pack-size retailer IDs. All 90 variants remain grouped under the website parents, including 21 unchanged variants for the original oils. Eight products remain visible. All images use `madikar-product-images` (55 uploads, four existing URLs); all 59 distinct linked images were verified publicly. No columns were added during reconciliation.

See `outputs/catalog-reconciliation-20260930/REPORT.md` for the backup, applied data SQL and final checks. The existing bot resolves each CSV retailer ID through its unchanged `(catalog_id, retailer_id)` lookup. Do not activate the hidden lookup rows or add website IDs to them. Meta upload remains owner-managed; do not run `sync-meta-catalog` until every intended batch item is accepted, because stale cleanup can delete hidden website parents and their variants.

Live inspection for this reconciliation found `madikar-store` v4 and `sync-meta-catalog` v10 matching their tracked sources, and `whatsapp-webhook` v93 using the existing lookup contract. The platform counters advanced since the earlier inspection; no function was edited or deployed. Final public `/api/catalog` check returned HTTP 200 with the eight expected visible products.

The bot's Product lookup explicitly selects `product_link`, `description`, `name`, and `catalog_id` as well as `retailer_id`; keep those columns. The website currently uses the `store_*` fields for identity, display, ordering, visibility and old product links. Its sizes/prices are already database-driven through `ProductVariant`. See `PRODUCT_CATALOG_SCHEMA.md` before the later UI/API work. That work should return the new fields, build real product detail pages, and preserve old query-string links. No website or Edge Function was published as part of this database update.

## Catalog loading recovery — 30 September 2026

The owner reported an empty storefront after reconciliation. The visible page showed the catalog error state. Sites logged `/api/catalog` HTTP 503 at 08:15:12 UTC; matching `madikar-store` v4 logs showed a database HTTP 401 `PGRST303`, followed by function HTTP 502. The same database authentication error occurred at 05:00:21 and 02:53:19 UTC before reconciliation. A fresh public request succeeded, and SQL confirmed all eight active products still had variants. The logs establish an intermittent authentication failure; they do not identify the rejected JWT claim, so no credential/configuration change was made.

Published Sites version 14 from commit `92624712bb1165f1e92e25c115d707a7e5fdb466` to the same public Site. `website/dist/client/app.js` now retries the read-only catalog up to three attempts for transient HTTP/network failures (1s/2s backoff, 15s request timeout), suppresses overlapping loads, and offers a styled Try again button after exhaustion. It does not replay orders/payments or retry direct 401/403 responses. No Supabase function or database data was changed for this fix.

Five targeted tests in `website/tests/catalog-loading.test.mjs` passed. Verified the published browser shows eight products with descriptions, pack sizes, prices and images. See `outputs/catalog-loading-fix-20260930/REPORT.md` and `shop-restored.png`. This mitigates transient catalog outages; the intermittent upstream authentication failure is not proven eliminated.

Windows Sites packaging: prepend `D:\Git\bin` to PATH so the helper uses installed Git Bash rather than unconfigured WSL, and set `TAR_OPTIONS=--force-local` for drive-letter archive paths. Create the temporary Site checkout under the same Windows account used by the publishing helper to avoid Git dubious-ownership errors.

## Previous website implementation plan (completed)

This was the plan before version 15. The product/category and detail-page items below have since been implemented as described in the latest continuation section above.

1. Read this document, `Project_Instructions.md`, `BOT_BACKEND_DO_NOT_TOUCH.md`, `PRODUCT_CATALOG_SCHEMA.md` and `website/README.md`. Preserve local uncommitted work. Open the same Site and reconcile its current source with the monorepo before editing.
2. Inspect the live Product/ProductVariant data and deployed `madikar-store` before backend changes. Work from the 59 canonical website groups with a populated `store_id`; the 17 extra Meta lookup rows must never appear as products. Review the 51 hidden groups for display and enable the intended products after checking their images, variants and content. Availability and website visibility are separate fields.
3. Use the real category names listed in `PRODUCT_CATALOG_SCHEMA.md`. The frontend's old preferred category order includes legacy names such as Pantry and Personal Care; align the display order/filter labels deliberately with the current data. Do not recreate deleted products from `website/db/catalog-source.js`, seeds, old spreadsheets or earlier batch 3.
4. Implement a real page at `/products/<slug>`, e.g. `/products/groundnut-oil`. Store only the lowercase segment in `Product.slug`. Clicking a product should navigate to the page. Direct navigation and refresh must work; use a real not-found state for invalid/hidden products. Preserve/redirect legacy `/?product=<store_id>` links used by the existing catalog. Retain stable `store_id` and variant identities for carts and integrations.
5. Extend the website API to return existing slug/content fields and render shared product information with a size selector whose prices come from ProductVariant. Use `website_description` for short copy and the existing `traditional_benefits`, `extraction_craft`, `ingredients_and_more` fields for corresponding sections. All 59 short descriptions are populated; the three detail fields were empty at the last snapshot. Hide empty sections and use only source-backed content or owner clarification. Do not invent benefits or ingredients. Keep Meta's combined `description`, `product_link` and retailer/catalog IDs intact. The owner's no-new-columns constraint remains applicable.
6. Preserve the catalog loading recovery. If investigating `PGRST303`, correlate current website/Supabase logs before changing authentication; do not treat retries as proof the upstream issue is fixed. Do not rotate bot secrets, weaken access rules or deploy bot functions.
7. Verify category filters, product listings, direct product URLs/refresh, old links, variants/prices, images, and mobile layout. Publish to the same Site with its existing audience and record the new version. Read bot functions/migrations only where a specific integration depends on them.

### Source files and retained artifacts

- Storefront: `website/dist/client/index.html`, `app.js`, `styles.css`; these are tracked source, despite the `dist/` directory name.
- Sites API/routing: `website/server/worker-template.js`; build with `node scripts/build-worker.mjs` from `website/`.
- Live website backend source: `supabase/functions/madikar-store/index.ts`; never use the historical copy under `website/server/`.
- Schema decisions/category inventory: `PRODUCT_CATALOG_SCHEMA.md`.
- Approved batch copies and full backup: `outputs/catalog-reconciliation-20260930/` (`REPORT.md`, `before.json`, `after.json`, `input-batch-1.csv` through `input-batch-3.csv`, `retailer-variant-mapping.json`). The copied third batch is the owner's updated file.
- Loading diagnosis and verification: `outputs/catalog-loading-fix-20260930/REPORT.md`, `shop-restored.png`; test: `website/tests/catalog-loading.test.mjs`.
- Initial handoff checkpoint did not independently confirm the owner's updated batch 3 upload was accepted by Meta. Do not invoke sync just to display website products.

## Bot state to preserve

### Owner's manual Razorpay update — synchronized 30 September

The owner manually changed the deployed `razorpay-webhook` and explicitly requested that the repository be updated to match. Retrieved the complete live function (reported v32, `verify_jwt=false`) and copied its source into `supabase/functions/razorpay-webhook/index.ts`. The only substantive difference is an added line at the end of the payment-confirmation message: `Need help with your order? Contact us at 99722 67897.` The bundled `_shared/order-handoff.ts` matches the local shared file and was not changed. The outbound JSON reference was updated accordingly. No function was deployed or secret changed by this synchronization; no live payment/message test was performed. Preserve this owner-authored text during future website work. This local update is not yet committed/pushed to `main` or `codex/website`.

The earlier committed bot baseline is on `main`; preserve the newer owner-authored live/local Razorpay change above. The bot baseline commits include `6f9677d` (main menu reminder) and `2d58475` (address change). Historical versions checked on 28 Sep were `whatsapp-webhook` v92, `whatsapp-flow` v48, `razorpay-webhook` v30, `sync-meta-catalog` v9 and `retry-order-handoffs` v4. Latest inspected counters are listed in `Project_Instructions.md`; compare actual source when parity matters.

- The main menu message includes: `Note: You can always type "Hi" for the main menu`.
- After an address is selected, the bot sends the `review_and_pay` order message, then the approved `change_address` template in English (`en`). Its Flow button opens the same Address Flow. A replacement is accepted only while the order is `pending_payment`, and only for an active address belonging to that order's profile. The bot sends the same pair again after a replacement.
- Live order 135 tested the complete replacement and payment path on 28 Sep. Both outbound messages returned HTTP 200 in the intended send order. The order's address became the replacement. A ₹3 live-mode payment produced a successful `payment_link.paid` webhook, marked payment 29 `paid`, advanced order 135 to `processing`, sent the payment-confirmation WhatsApp message once (HTTP 200), and completed the n8n handoff on the first attempt. The Google Sheet row was not independently checked.
- The approximately 16-minute payment-link expiry and `payment_link.expired`/`cancelled` handling are implemented. A real expired/cancelled link has not yet been tested. Supabase account MFA remains an owner-side item. Those are outstanding bot follow-ups, not prerequisites for website work in the monorepo.

The downloaded Razorpay source passed an esbuild bundle check. Normalized source parity, the single text change and the unchanged shared module were verified; results are saved in `outputs/razorpay-manual-sync-20260930/verification.json` alongside the before/live source snapshots.

## Previous continuation prompt (historical)

```text
Continue the Madikar Taila website in D:\cursor projects\Madikar taila on branch codex/website. Read WEBSITE_HANDOFF.md, Project_Instructions.md, BOT_BACKEND_DO_NOT_TOUCH.md, PRODUCT_CATALOG_SCHEMA.md and website/README.md first. Preserve the existing uncommitted changes and outputs.

The website source is already in website/. Use the same Sites project appgprj_6ab742ddf3e48191911b4bb531bb0ca8 at https://madikartaila.com; latest published version is 14. Open and inspect the current Site source before editing and publish back to that same Site.

Continue with displaying the other retained categories/products and creating separate product pages at /products/<slug>, e.g. /products/groundnut-oil, instead of popups. Keep existing product query links working. Use the existing database content fields and ProductVariant sizes/prices; do not add columns or invent missing product details.

There are 59 website product groups and 90 variants; only eight groups are currently visible. Keep the 17 extra Meta retailer-ID lookup rows hidden. Images belong in madikar-product-images. Preserve the seven original oils, Mango pickle and the approved batch mapping; do not restore deleted products from old seed files.

Inspect the live madikar-store function (last checked v4) and relevant schema before backend changes. Preserve the catalog retries/Try again fix; the intermittent Supabase 401 PGRST303 remains unresolved. Product-page work must not incidentally enable checkout.

The owner's manual razorpay-webhook v32 payment-confirmation change has been copied from live into the local repo and must be preserved. Do not edit or deploy bot functions, change bot secrets or invoke Meta sync as part of this website work. Read bot functions/migrations only where an integration depends on them. Follow the handoff's implementation and verification plan; ask me about missing product content when needed.
```

See `Project_Instructions.md` for the repo workflow, `WhatsApp_Flow_Project_Handoff.md` for architecture and bot history, and `WhatsApp_Outbound_Message_JSON_Reference.md` for current message contracts.


## Website checkout version 19 — 30 September 2026

Published the Supabase-backed Razorpay checkout to the same Site as version 19, commit `c496fc48850f7c3a941ba4f4fee19375f6f675b2`; deployment `appgdep_6abd2b0b6cdc81918868bb68e93830d9` succeeded. Website-only `madikar-store` is v6. Payment remains disabled because shipping is undecided (`enabled=false`, `shipping_paise=NULL`); the current shared Razorpay mode reports test and was not changed. Confirmation is on-screen only for now, as the owner requested. See `website/PAYMENTS.md` and `outputs/website-checkout-20260930/REPORT.md` for implementation, verification and activation requirements. The five bot functions, protected local source/config, bot RPCs and existing job settings were verified unchanged. Never enable payments or alter the shared mode as an incidental website edit.


## Zero shipping approved and checkout enabled — 30 September 2026

Website checkout is enabled with **zero shipping**, approved by the owner on 30 September 2026. `public.store_checkout_settings.enabled=true` and `shipping_paise=0`; customers pay only the selected product total. The existing Supabase `RAZORPAY_MODE` currently reports **test** and was not changed. Real-money collection remains subject to the shared mode and live-payment verification. Bot functions, settings and secrets remain untouched. Verified in the published checkout: items INR 150, shipping INR 0, total INR 150, and the Razorpay payment button enabled. This was a website settings change only; no new Site build or function deployment was required. No customer data was submitted and no payment was made during this verification.


## n8n test-mode correction — 30 September 2026

Website test and live payments now both trigger n8n. Deployed madikar-store v8 and website-only migration 20260930171554_website_test_payment_handoffs. The previously skipped test order 141 was delivered successfully at 17:16:58 UTC. Both mode predicates and completion restrictions were removed from website-only processing; no bot paths or shared secrets were changed. See outputs/website-n8n-fix/REPORT.md.

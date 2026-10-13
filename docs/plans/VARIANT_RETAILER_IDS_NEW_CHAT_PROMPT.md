# New chat prompt for variant retailer IDs

Paste this into the next chat:

```text
Continue the Madikar Taila project in D:\cursor projects\Madikar taila. Start with PROJECT_HANDOFF.md, then read docs/plans/VARIANT_RETAILER_IDS.md, Project_Instructions.md, BOT_BACKEND_DO_NOT_TOUCH.md, PRODUCT_CATALOG_SCHEMA.md and WEBSITE_HANDOFF.md. Inspect git status/history and preserve newer local work. The latest handoff is on codex/variant-retailer-id-plan, based on ae53bb4; main was older when checked, so do not reset to it or lose existing admin/shipment work.

Implement Phase 1: fetch ALL current Meta catalog products and variants across every page, using existing Supabase-held credentials securely, and add/backfill a nullable ProductVariant.retailer_id column with each verified Meta item ID. Use the live schema and fresh snapshots, not yesterday's counts or old SQL. Meta catalog: 1515875913870520. Supabase project: faoomjgkofqrdajaftjd.

Map IDs using verified parent/group identity and pack sizes. Do not guess or invent IDs; leave unmatched variants NULL and report missing/ambiguous mappings. Recheck Mango pickle 200 g, Rose soap, Panchagavya four-pack and the four newly added variants. Last checked counts were 76 Product rows, 59 website parents, 17 legacy lookup rows and 94 variants.

Do NOT apply the superseded proposal to create 14 hidden Product records. Preserve existing parent retailer IDs, lookup rows, variant IDs/links/positions, prices, shipping weights, stock, availability, visibility, content and orders. Do not invoke the current sync-meta-catalog function. If fetching requires a temporary reader, use a separate authenticated, expiring GET-only reader for this fixed catalog and remove it afterward without changing existing functions.

Phase 1 must leave bot and website runtime unchanged: no existing function deployment, payment or customer message. Verify mapping uniqueness, unchanged existing data, RLS/grants and relevant regressions. Keep shipping zero; content/metadata cleanup, courier calculations and the wider audit remain deferred. Document, commit and push the verified result. Report what Phase 2 requires for bot/website/sync to use the variant IDs; do not implement that runtime change or remove legacy lookup rows in this phase.
```

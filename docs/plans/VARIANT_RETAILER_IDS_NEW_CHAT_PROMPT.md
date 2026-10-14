# New chat prompt — separately authorized Phase 2 compatibility

Updated 14 October 2026. Phase 1 is complete; do not replay its migration. This prompt is for a future owner-authorized runtime change.

```text
Continue Madikar Taila in D:\cursor projects\Madikar taila. Read PROJECT_HANDOFF.md, docs/plans/VARIANT_RETAILER_IDS.md, its Phase 1 report, Project_Instructions.md, BOT_BACKEND_DO_NOT_TOUCH.md, PRODUCT_CATALOG_SCHEMA.md, WEBSITE_HANDOFF.md, website/README.md, website/PAYMENTS.md and the referenced bot handoff/message/error documents. Inspect Git history and preserve newer local work. Latest Phase 1 branch: codex/variant-retailer-id-phase1, based on b1d0ad7 and preserving ae53bb4's admin/shipment work. Freshly fetched origin/main was still older at 4769c08.

Phase 1 migration 20261014120349_add_verified_variant_retailer_ids is applied in Supabase faoomjgkofqrdajaftjd: nullable text retailer_id with blank/whitespace and unique populated-ID protection, 87 verified assignments, eight NULLs. Fresh complete Meta read found 90 items; the database has 76 Product rows, 59 website parents, 17 legacy lookups and 95 variants. Existing data, security and runtime were verified unchanged. Do not replay Phase 1 or insert the superseded 14 hidden Product rows.

Implement focused Phase 2 compatibility so consumers can use verified variant IDs. Reinspect live schema and complete deployed sources first. Resolve incoming WhatsApp retailer IDs through ProductVariant plus parent Product, scoped to catalog 1515875913870520. Retain legacy Product lookup and incoming-metadata fallbacks for older/unmapped items. Preserve incoming transaction prices and checkout/payment/order/registration/address/message behavior. No synchronous Meta calls per checkout item.

Review website quote/item snapshots separately: prefer verified variant IDs with parent fallback; preserve historical order-item IDs and all amounts/payment transitions. Make manual sync variant-aware before invoking it: current sync upserts Product per Meta item and deletes stale rows, so do not use it as a mapping tool. Avoid duplicate parents, automatic regrouping/deletion or price/content reconciliation.

Test mapped/unmapped carts, catalog scoping, duplicate/ambiguity handling, legacy/incoming fallbacks, website metadata and unchanged payment/order transitions. Verify full source parity and deploy only specifically changed functions in the authorized scope. Keep all 17 legacy lookup rows until separately authorized cleanup proves consumer and historical-reference independence. An admin ID editor is optional later scope.

The owner deferred generated Meta IDs 3l8f6g8wzz (Mango), lblvc9q42a (Rose) and dg4i4tvblo (Panchagavya) for later matching; do not guess or assign them in Phase 2. NULL variants: 83 Mango 300 g, 102 Rose Bar, 105 Panchagavya four-pack, 116/117 Sesame 500/200 ml, 118 Flax seed 200 ml, 119 Niger/Huchellu 200 ml and 120 Jaggery powder 500 gms. Preserve current team values. Three fresh price differences are in the report; leave them unchanged unless separately requested.

Preserve parent IDs, lookups, variant links/positions, all data/security, both website signing keys, secrets/modes, admin pagination, tracking/delivery estimates and approved payment/shipment messages. Shipping stays zero; courier calculations, price/content/metadata reconciliation and the wider audit remain deferred. No real customer message or payment is needed for compatibility checks. Document, commit and push the verified result.
```

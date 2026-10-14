# New chat prompt — remaining catalog work

Updated 14 October 2026. Phase 1 and the order-identity portion of Phase 2 are deployed. This prompt describes remaining work only; it is not authorization to invoke current full sync, modify Meta, change prices or process real payments.

```text
Continue Madikar Taila in D:\cursor projects\Madikar taila. Start with PROJECT_HANDOFF.md, docs/plans/VARIANT_RETAILER_IDS.md, its PHASE2_REPORT and Phase 1 report. Read Project_Instructions.md, BOT_BACKEND_DO_NOT_TOUCH.md, PRODUCT_CATALOG_SCHEMA.md, WEBSITE_HANDOFF.md, website/README.md, website/PAYMENTS.md and referenced bot documents. Inspect Git and preserve the latest branch codex/catalog-export-variant-compatibility from be60d37; main was older at 4769c08.

Supabase project faoomjgkofqrdajaftjd / Meta catalog 1515875913870520: the latest complete read found 95 Meta items, 75 Product rows (59 parents and 16 legacy lookups) and 94 variants, all with verified retailer IDs. The owner assigned seven IDs after Phase 1. The owner separately removed Panchagavya four-pack variant 105 and inactive lookup 81; parent 80 and single-bar variant 104 remain. Extra Meta item dg4i4tvblo is unassigned and has no size; do not identify or delete it as the four-pack by assumption. Refresh data before changes.

Owner-approved whatsapp-webhook v95 resolves catalog-scoped ProductVariant IDs with parent, legacy Product and incoming-metadata fallbacks. madikar-store v16 records selected variant retailer IDs with parent fallback in new quote snapshots. All 56 tests, 94 mocked pack/payment preparations and live read-only identity checks passed. Complete deployed files matched local source; existing data, prices, protected RPCs, security and other functions were preserved. No real order/payment/message or Meta write occurred. Do not repeat Phase 1 or recreate the superseded 14 hidden Product rows.

The remaining Phase 2 design task is safe manual catalog sync. Current sync-meta-catalog creates/upserts Product per item and deletes stale rows; DO NOT invoke it. If the owner requests sync work, first design and verify a variant-aware approach using explicit reviewed mappings, preserving parents, variants, remaining lookup rows and historical orders. Avoid automatic regrouping, stale parent deletion and price/content overwrites. Deploy only named functions within the authorized scope after full source checks and tests.

The complete 95-item CSV, all-item audit and ₹1 price checklist are in docs/catalog/. The CSV includes manual and feed items, but a new feed is not assumed to own all items. Twenty-six items lack brand/GTIN/MPN; signed Meta CDN image URLs can expire. Review import preview, source ownership and identifiers before any upload. The owner's 23 website-link corrections were verified. No CSV has been uploaded by the agent.

Five Meta items / four website variants intentionally cost ₹1. Mustard 200 ml differs at ₹1/₹90 and Jaggery 1 kg at ₹70/₹85 (Meta/website). WhatsApp uses incoming transaction prices; website uses server variant prices. Change these only under the owner's specific price instructions. Live public checkout config was ready with zero shipping and mode live; no mode was changed or real payment tested.

Preserve all existing product data, both signing keys, secrets/modes, admin pagination, shipment estimates/notifications, registration/address flows, payment verification and historical snapshots. Shipping calculations, broader launch/payment checks, content reconciliation and an admin retailer-ID editor remain separate. Keep no temporary reader deployed after work. Document, commit and push verified work.
```

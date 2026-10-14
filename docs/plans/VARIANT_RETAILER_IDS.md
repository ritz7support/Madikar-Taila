# Meta retailer IDs on Supabase product variants

Updated 14 October 2026. **Phase 1 and the order-identity part of Phase 2 are applied.** The owner later filled seven IDs and explicitly removed the Panchagavya four-pack; all 94 current variants match a fresh 95-item Meta snapshot. Owner-approved whatsapp-webhook v95 and madikar-store v16 use exact variant identities with compatibility fallbacks and unchanged prices/payment behavior. Manual sync redesign remains deferred: do not invoke the current full sync. Read [VARIANT_RETAILER_IDS_PHASE2_REPORT.md](VARIANT_RETAILER_IDS_PHASE2_REPORT.md) and ../catalog/ for the complete CSV, mapping and ₹1 checklist. Latest branch: codex/catalog-export-variant-compatibility from be60d37.

## Phase 1 checkpoint (history)

Phase 1 was applied in migration 20261014120349_add_verified_variant_retailer_ids. It initially assigned 87 IDs with eight NULLs across 95 variants, preserving runtime. The superseded 14-hidden-row insertion was not applied. The following Phase 1 counts are historical and superseded by the checkpoint above.

Read [VARIANT_RETAILER_IDS_PHASE1_REPORT.md](VARIANT_RETAILER_IDS_PHASE1_REPORT.md) for the complete mapping manifest, unmatched tables, checks and local evidence. Fresh Meta pagination returned 90 items across all three pages, matching product_count before/after, with no duplicate IDs. Current database: 76 Product rows, 59 website parents, 17 legacy lookups and 95 variants. New Jaggery powder 500 gms is variant 120; Mango pickle variant 83 is now 300 g. Preserve all current team-entered values.

The owner explicitly deferred generated IDs 3l8f6g8wzz (Mango), lblvc9q42a (Rose) and dg4i4tvblo (Panchagavya), which all omit size. NULL variants are 83, 102, 105, 116, 117, 118, 119 and 120. The five newly added packs have no current Meta counterpart. Eleven populated mappings omit Meta size but retain their revalidated historical item/group/parent/pack identities.

All pre-existing product/variant/customer/order/payment data, security, triggers, protected RPCs, settings/jobs and six existing functions are unchanged. Forty-nine mocked tests and rollback-only live SQL checks passed. The expiring signed GET-only reader was removed and verified 404. No existing function deployment, full sync, Site publication, customer message or order/payment processing occurred. Shipping remains zero. Three observed price differences are recorded without changing prices.

Latest branch: codex/variant-retailer-id-phase1, based on b1d0ad7 and preserving ae53bb4; freshly fetched origin/main remains older at 4769c08. Do not replay the guarded production backfill or the superseded hidden-row SQL. Runtime adoption is separately authorized Phase 2 below and in the companion prompt.

## Planning checkpoint — 13 October (history)

Canonical checkout: D:/cursor projects/Madikar taila. Planning branch: codex/variant-retailer-id-plan, based on ae53bb4 from codex/admin-shipment-messages. Local main and origin/main were still at 4769c08 when inspected and lack the subsequent weights, admin, order-reference and shipment work. Preserve the latest checkout; inspect history before branching instead of resetting to that older main baseline.

Supabase project: faoomjgkofqrdajaftjd. Meta catalog: 1515875913870520.

Live Supabase read on 13 October at 22:31 IST:

| Measure | Observed value |
| --- | ---: |
| Product rows | 76 |
| Website parents with store_id | 59 |
| Additional lookup rows without store_id | 17 |
| ProductVariant rows | 94 |
| ProductVariant.retailer_id column | Absent |

Sixteen of the 17 lookup rows have store_active=true, but remain excluded from website/admin product queries because those require a non-null store_id. Hidden describes filtering, not access control. Do not change their flags incidentally.

Four team-added variants postdate the 12 October audit; preserve them and all current prices, weights and availability:

| Variant ID | Product | Pack |
| --- | --- | --- |
| 116 | Sesame Oil | 500 ml |
| 117 | Sesame Oil | 200 ml |
| 118 | Flax seed Oil | 200 ml |
| 119 | Niger/Huchellu Oil | 200 ml |

The 12 October audit fetched 87 Meta items in 57 groups and uniquely paired all 87 with the then-current 90 website variants. All paired prices and selling availability agreed. Three packs were absent from Meta. Fourteen additional Meta item IDs had no Product lookup row although their website variants existed. These are dated counts; fetch the catalog again before backfilling.

## Applied schema (same selected design)

Add one nullable text column, retailer_id, to public."ProductVariant". Store the exact Meta item ID, preserving spelling and case. Do not store a product-group ID or invent a website ID. Keep an unverified/unlisted variant NULL.

Reject empty values and surrounding whitespace. Enforce uniqueness for populated values using a partial unique index. The current setup uses one Meta catalog, inherited through the parent Product.catalog_id. If fresh inspection finds multiple catalogs with overlapping IDs, review catalog-scoped uniqueness before migration rather than silently applying a globally unique constraint to that different setup.

Preserve Product.retailer_id as a legacy compatibility field. It may match one of its variant IDs; uniqueness applies within ProductVariant, not across both tables. Preserve variant primary IDs, product_id links, positions and all other fields.

The 12 October Groundnut Oil mapping illustrates the proposed result:

| Existing variant ID | Pack | ProductVariant.retailer_id |
| --- | --- | --- |
| 1 | 500 ml | dtditk1gc0 |
| 2 | 1 L | xl2wuh1d18 |
| 3 | 2 L | jhlu61i86w |
| 4 | 5 L | 380w55uajs |

Parent Product 5 retains retailer_id dtditk1gc0, store_id p1 and all four variants. No additional parent or hidden record is required by the new variant model.

## Phase 1: completed implementation method

The following steps describe the completed Phase 1 method. Do not rerun its guarded production migration. Existing bot/website runtime remains unchanged; no existing function or website deployment occurred.

1. Read PROJECT_HANDOFF.md, Project_Instructions.md, BOT_BACKEND_DO_NOT_TOUCH.md, PRODUCT_CATALOG_SCHEMA.md, WEBSITE_HANDOFF.md and this plan. Inspect Git, live schema/triggers/constraints/RLS/grants and deployed functions. Save fresh Product/ProductVariant snapshots and fingerprints; preserve team changes instead of applying older snapshots.
2. Fetch every current Meta item and variant across every page. Request at least id, retailer_id, name, size, retailer_product_group_id, product_group, price, currency and availability. Check count/pagination completeness and duplicate IDs. Use existing Supabase-held credentials server-side; never print/save tokens or credential-bearing pagination URLs.
3. If direct access is unavailable, use a separate authenticated, expiring GET-only reader of this fixed catalog, as used in the earlier audit. Do not edit or invoke existing functions to obtain credentials or fetch products. Remove the reader and verify all six existing functions keep their IDs, hashes and JWT settings. Do not invoke sync-meta-catalog.
4. Produce a reviewable mapping of actual Meta IDs to exactly one existing website parent and variant. Use verified Product ID anchors, Meta group membership, normalized sizes and the prior confirmed mapping as evidence. Normalize 1 L/1000 ml and 1 kg/1000 g. Names or prices alone cannot settle ambiguous matches. Meta omitted size on 11 items in the older snapshot; do not invent sizes or assume incoming WhatsApp messages always include reliable sizes.
5. Report Meta-only items, Supabase-only variants, missing sizes, duplicates and ambiguities separately. Recheck the three formerly absent packs and the four team-added variants. Leave unmatched IDs NULL and clarify only genuinely unresolved identities. Do not add products/packs, guessed IDs or changed prices to force a match.
6. Generate a new focused migration using the current CLI workflow. Add nullable retailer_id and its format/uniqueness protection; backfill only verified mappings with fresh snapshot guards and exact row-count checks. Do not edit/replay applied migrations. Record the applied migration consistently with repository history; keep data evidence/backups in ignored outputs.
7. Verify every populated ID exists in the fresh Meta response, has the correct parent/catalog/pack and occurs at most once in ProductVariant. Compare Product data and all pre-existing ProductVariant fields excluding the new column with the baseline. Preserve prices, weights, stock, visibility, sizes, positions, names, images, descriptions and links. Verify RLS, grants and protected RPC definitions, existing admin saves and catalog/checkout reads remain compatible with the nullable field.
8. Remove any reader, verify existing function inventory, run appropriate meaningful regressions without real orders/payments/messages, report populated/unmatched counts and tables, update documentation, commit and push.

Phase 1 succeeds when verified IDs are stored on existing variants and existing behavior is preserved. It does not make current bot or website consumers use those IDs yet.

## Original Phase 2 design — order identity now deployed; sync deferred

The bot and website identity bullets below were implemented and verified on 14 October with explicit owner deployment approval. The before-change descriptions are historical. The manual-sync bullet is still outstanding. Preserve the 16 remaining legacy lookup rows; the four-pack exception was separately owner-authorized. The companion prompt now describes the remaining work.

The current bot lookup reads Product by catalog_id and retailer_id, selecting name/description/product_link. Missing cache data is logged and checkout continues using incoming metadata. Prices come from the incoming WhatsApp order item. The bot does not query ProductVariant; a schema-only change cannot resolve its 14 missing-lookup observations.

After Phase 1 is verified, prepare a separate focused runtime change:

- Resolve incoming Meta retailer IDs through ProductVariant and its parent Product, scoped to the catalog. Keep the legacy Product lookup and incoming-metadata fallbacks for older/unmapped items. Preserve transaction prices, payment flow and message contracts. Do not add synchronous Meta requests per checkout item.
- Review website item identification separately: madikar-store/checkout.ts currently records the parent's retailer_id for every pack. A later change can prefer a verified variant ID with parent fallback; leave historical order-item IDs untouched.
- Make manual sync variant-aware before using it for normal identity maintenance. Current sync creates/upserts a Product record per Meta item and deletes stale rows. A revised path must use reviewed variant mappings without duplicate parents, automatic regrouping/deletion or price/content changes. Current sync is not the Phase 1 backfill tool.
- Test mapped/unmapped carts, legacy fallback, catalog scoping, duplicate/ambiguity handling, website item metadata and unchanged payment/order transitions. Inspect full deployed source and deploy only the specifically changed function.

The owner authorized and deployed the order-identity changes; manual sync remains separate. The companion describes remaining work. Preserve the 16 remaining legacy lookup records until separately authorized cleanup proves every consumer and historical reference independent of them. An admin ID field is optional later scope.

## Original planning scope and outstanding items (history)

The 13 October planning chat made no database/runtime change; Phase 1 was applied on 14 October as recorded above. The old 14-hidden-record proposal was never approved/applied and is superseded. Do not execute its SQL, create those rows, delete existing lookups or overwrite parent retailer IDs.

The owner is manually adding the three absent packs to Meta using the supplied public image links and intended existing IDs:

| Product | Pack | ID provided to owner |
| --- | --- | --- |
| Mango pickle | 200 g | mt-mango-pickle-200g |
| Rose soap | Bar | mt-rose-soap-default |
| Panchagavya soap | Pack of 4 | mt-panchagavya-soap-4pack |

The 14 October read found three generated IDs instead of these supplied IDs; the owner deferred their matching. See the result above. The new Panchagavya ₹60 item does not verify the four-pack identity. Use fresh actual IDs and verified packs in later mapping work.

Content/metadata differences, courier rates/shipping calculations and the wider architecture/security audit remain deferred. Keep shipping zero. Preserve payment mode/secrets, checkout amounts, existing order references, payment/order_status messages, approved order_shipped notifications, tracking/delivery estimates, admin pagination and registration/address flows. No real customer messages or charges are needed for migration checks.

Live function inventory on 13 October: whatsapp-webhook 94, whatsapp-flow 50, razorpay-webhook 33, sync-meta-catalog 11, retry-order-handoffs 6 and madikar-store 15. Their hashes matched the audit inventory; the audit reader is absent. Latest recorded Site is version 31 from the shipment-message release, not independently republished in this planning chat.

## Evidence for the next chat

Local files below are intentionally outside Git; do not upload outputs wholesale:

- outputs/catalog-audit-20261012/: complete Meta/Supabase snapshots, comparison.json with 87 verified pairs, full report and reader cleanup verification.
- outputs/catalog-reconciliation-20260930/retailer-variant-mapping.json: historical 69-item mapping, validated on 12 October; revalidate before use.
- outputs/catalog-repair-20261013/: read-only Supabase snapshot, public image links and superseded hidden-record proposal.
- outputs/variant-retailer-id-plan-20261013/read-only-checkpoint.json: current counts, four added variants, data fingerprints and function inventory.

The initial BOT_BACKEND_DO_NOT_TOUCH.md dirty status had no semantic diff. Preserve any substantive local work before staging documentation.

## Reference documentation

[PostgreSQL 17 constraints](https://www.postgresql.org/docs/17/ddl-constraints.html) explains nullable uniqueness and value checks; [partial indexes](https://www.postgresql.org/docs/17/indexes-partial.html) supports indexing populated IDs. [Meta's official Business SDK fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/productitem.py) distinguish retailer_id, retailer_product_group_id and size. Recheck the [Supabase changelog](https://supabase.com/changelog) and relevant CLI/database docs before implementation.

Use [VARIANT_RETAILER_IDS_NEW_CHAT_PROMPT.md](VARIANT_RETAILER_IDS_NEW_CHAT_PROMPT.md) to continue.

# Variant retailer IDs — Phase 1 result, 14 October 2026

Phase 1 is applied to Supabase project `faoomjgkofqrdajaftjd`. Migration: `20261014120349_add_verified_variant_retailer_ids.sql`. Work branch: `codex/variant-retailer-id-phase1`, based on `b1d0ad7`; the admin/shipment baseline is preserved. Bot and website runtime are unchanged.

## Fresh inventory and mapping result

Meta catalog `1515875913870520` was fetched at 2026-10-14T11:56:46.799Z (14/10/2026, 17:26:46 IST), through every page of the catalog's products edge, including all variant items. Three pages returned 90 unique internal IDs and 90 unique retailer IDs; the catalog's product_count was 90 before and after pagination. No credential-bearing paging URL or access token was printed or saved.

| Measure | Current value |
| --- | ---: |
| Meta items | 90 |
| Product rows / website parents / legacy lookup rows | 76 / 59 / 17 |
| Existing variants | 95 |
| Verified populated retailer IDs | 87 |
| Variants left NULL | 8 |
| New Meta items deferred by owner | 3 |
| Duplicate internal IDs / retailer IDs / mapped variants | 0 / 0 / 0 |
| Meta items without explicit size | 14 |
| Verified mappings without explicit Meta size | 11 |

The live database includes a fifth newly added pack, Jaggery powder 500 gms (variant 120), in addition to the four oil packs in the 13 October handoff. Mango pickle variant 83 now reads **300 g** with a 300 g shipping weight; the older handoff's 200 g value was not restored. All team-entered values were preserved.

## Unassigned items

The owner explicitly requested on 14 October that the three newly created Meta IDs be ignored in this phase and matched later. They are present in the fresh catalog, but none supplies size. No new hidden Product records were added and no parent ID was replaced.

| New Meta item | Actual retailer ID | Fresh Meta price | Disposition |
| --- | --- | ---: | --- |
| Mango pickle | 3l8f6g8wzz | ₹125 | Owner deferred; current website pack is 300 g |
| Rose soap | lblvc9q42a | ₹90 | Owner deferred; website pack is Bar |
| Panchagavya soap | dg4i4tvblo | ₹60 | Owner deferred; does not verify the ₹125 four-pack. Existing single-bar Meta ID remains present |

The generated IDs differ from the IDs provided in the earlier plan. Do not infer their pack identity from name, price or shared URL, or assign two Meta items to one variant.

| Variant ID | Product | Current pack | Reason retailer_id remains NULL |
| --- | --- | --- | --- |
| 83 | Mango pickle | 300 g | No verified assignment; the newly added Meta items are owner-deferred |
| 102 | Rose | Bar | No verified assignment; the newly added Meta items are owner-deferred |
| 105 | Panchagavya | Pack of 4 | No verified assignment; the newly added Meta items are owner-deferred |
| 116 | Sesame Oil | 500 ml | No counterpart in the complete current Meta response |
| 117 | Sesame Oil | 200 ml | No counterpart in the complete current Meta response |
| 118 | Flax seed Oil | 200 ml | No counterpart in the complete current Meta response |
| 119 | Niger/Huchellu Oil | 200 ml | No counterpart in the complete current Meta response |
| 120 | Jaggery powder | 500 gms | No counterpart in the complete current Meta response |

## How identities were verified

The 87 prior confirmed pairs were treated as evidence and individually revalidated against the fresh response and current database: exact retailer/internal Meta ID, consistent product-group IDs, catalog, stable parent store_id and retailer ID, existing variant-to-parent linkage, position and pack. Current Meta sizes were normalized (`1 L = 1000 ml`, `1 kg = 1000 g`); names and prices were not identity keys. Historical CSV lookup anchors and original-oil parent/group anchors were checked. Each populated ID maps to exactly one existing variant.

For the 11 Meta items with omitted sizes, the same internal item ID, retailer ID, group, parent and previously confirmed pack relationship still hold. Sesame 1 L remains mapped to variant 15 even though two additional Sesame packs now exist; no singleton assumption was applied. Their explicit Meta pack fields remain unverifiable.

| Variant | Product / pack | Meta retailer ID with omitted size |
| --- | --- | --- |
| 15 | Sesame Oil · 1 L | 5wovdlm67j |
| 57 | Home made cookies Ragi · Pack | mt-ragi-cookies-default |
| 98 | Spice tea kashaya · Pack | mt-spice-tea-kashaya-default |
| 99 | Amala Kashaya · Pack | mt-amala-kashaya-default |
| 100 | Ashwagandha Kashaya · Pack | mt-ashwagandha-kashaya-default |
| 101 | Moringa kashaya · Pack | mt-moringa-kashaya-default |
| 103 | Chandan · Bar | mt-chandan-soap-default |
| 104 | Panchagavya · Bar | mt-panchagavya-soap-default |
| 110 | Red Tooth Powder · Pack | mt-red-tooth-powder-default |
| 111 | Siddhadanta Tooth Paste · Tube | mt-siddhadanta-tooth-paste-default |
| 113 | Charcoal Face Pack · Pack | mt-charcoal-face-pack-default |

## Schema and preservation checks

Nullable text `ProductVariant.retailer_id` has no default. A check rejects empty IDs and surrounding whitespace; a partial unique index protects populated IDs and permits multiple NULLs. Exact spelling and case are preserved. Global uniqueness was chosen only after verifying all current parents use the single catalog; review catalog-scoped uniqueness before adopting multiple catalogs. Product.retailer_id stays a legacy compatibility field.

The migration uses current Product/ProductVariant fingerprints, short lock/statement timeouts, stable store_id plus exact current pack size, and exact 87-updated/8-NULL assertions. It verifies unchanged Product rows and all pre-existing variant fields inside the same transaction. If a team edit invalidates a snapshot guard, refresh evidence and create a new reviewed migration; do not replay this production backfill on a different database. The exact SQL stored in live migration history matches the committed file.

Post-migration checks verified all 87 assignments against the fresh Meta items and their intended parent/pack. Before/after data fingerprints are identical:

| Existing data | Count | Fingerprint (MD5 of ordered jsonb rows) |
| --- | ---: | --- |
| Product | 76 | f859b7158aced41aa79b2a66b7d5aa92 |
| ProductVariant, excluding new retailer_id | 95 | 67a0ce969cbafbd39347bbda520d1088 |
| orders | 152 | f2f61a599590fd52843ab75d32f2d4e3 |
| order_items | 220 | 5e02f9561da8a866a147dd89a493421f |
| payments | 48 | 1501b7b1328071ed4c90aeb332615d9e |
| addresses | 23 | 76a2cbf4e3628db77685c7b7fb4044b2 |
| Profile | 20 | b5c6fa24c59498b03f949a1e96012b3d |

All pre-existing column definitions, constraints, indexes, triggers, RLS, table/column/default grants and public function definitions/ACLs are unchanged. Existing checkout settings and cron-job fingerprint are unchanged. The new field inherits the existing service-role-only access; anon/authenticated still have no catalog privileges. Security advisor findings are unchanged: existing private tables with RLS and no policies, and the existing [leaked-password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No security configuration was relaxed.

`supabase/tests/variant-retailer-ids.sql` passed on the live schema using service_role inside a rollback-only transaction. It checks blanks/whitespace, duplicate rejection, multiple NULLs, exact case retention, admin-style saves preserving metadata and existing fields, nullable/no-default schema and denied public access. It inserts no rows, changes no sequences and invokes no order/payment/message function.

All **49** automated website/backend tests passed with mocked external services. Added compatibility coverage proves mapped/NULL IDs survive existing admin saves, new packs can omit the field, the public catalog shape stays unchanged, and current checkout retains the parent item ID, variant price and zero shipping. Live read-only website verification returned HTTP 200 for catalog and checkout config: all 59 parents and 95 packs match current database sizes/prices/availability, retailer_id is absent from the public variant response, checkout is ready and shippingPaise remains 0. Real staff-code saves and end-to-end payments/messages were not performed.

## Secure reader and runtime verification

The isolated `catalog-variant-read-20261014` reader was GET-only, fixed to this catalog and expiring after two hours, with RSA-signed requests limited to a 60-second timestamp window. Its private key existed only in the fetch process; the reader used the existing Supabase-held Meta token server-side. It accepted no arbitrary destination or field list and had no database writes. Unsigned GET returned 401; POST returned 405. The reader was deleted after the snapshot, and its endpoint returned 404.

The six existing functions retain the same IDs, versions, source bundle hashes and JWT settings: whatsapp-webhook 94, whatsapp-flow 50, razorpay-webhook 33, sync-meta-catalog 11, retry-order-handoffs 6 and madikar-store 15. No existing function was invoked for catalog sync or deployed. Site version 31 remains the latest recorded publication; no Site publication occurred.

## Deferred price observations

Identity verification found three fresh Meta/database price differences. They are recorded only; all prices in both systems are untouched. WhatsApp still charges from incoming cart prices and the website still quotes its existing variant prices.

| Product / pack | Retailer ID | Meta | Supabase variant |
| --- | --- | ---: | ---: |
| Sesame Oil · 1 L | 5wovdlm67j | ₹1 | ₹595 |
| Mustard oil · 200 ml | rihd1eocew | ₹1 | ₹90 |
| Jaggery · 1 kg | mt-jaggery-1000g | ₹70 | ₹85 |

Content/metadata reconciliation, prices, courier calculations and the wider audit remain separate work. Shipping stays zero.

## Separate Phase 2 compatibility work

Adding this metadata does not make existing consumers use it. The bot still queries Product by catalog_id/retailer_id; the older 14 missing parent-lookup observations remain until runtime adoption. In separately authorized Phase 2:

1. Resolve incoming IDs through ProductVariant plus its parent, scoped to catalog, while retaining legacy Product lookup and incoming-metadata fallbacks. Preserve incoming transaction prices and all checkout/payment/registration/address/message behavior. No per-item synchronous Meta calls.
2. Website quote/item snapshots can prefer the verified variant ID with parent fallback. Preserve historical order-item IDs and all amount/payment transitions.
3. Make manual sync variant-aware before invoking it for identity maintenance. Its current implementation upserts Product per Meta item and deletes stale rows; it must not create duplicate parents, regroup/delete existing rows or reconcile prices/content incidentally.
4. Test mapped/unmapped carts, catalog isolation, duplicate/ambiguity handling, fallback behavior and website item metadata. Deploy only specifically changed functions after full source review.
5. Keep all 17 legacy lookup rows until separately authorized cleanup proves consumer and historical-reference independence. Match the three owner-deferred generated IDs and five absent Meta packs separately; an admin ID editor is optional later scope.

## Evidence and source references

Ignored local evidence: `outputs/variant-retailer-id-phase1-20261014/` contains fresh before/after snapshots, complete Meta items, mapping-review.json, secure reader/fetch source, verification.json and function inventories. Previous confirmed evidence is under `outputs/catalog-audit-20261012/`. Do not upload outputs wholesale; customer tables were compared by fingerprints, without exporting customer rows in this phase.

The Supabase changelog and current CLI docs were checked with CLI 2.120.0. The [TLS cipher notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated) and [Postgres minor-release notice](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) require no implementation change for this text-column/partial-index migration. Schema references: [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html), [partial indexes](https://www.postgresql.org/docs/17/indexes-partial.html), [Supabase migration workflow](https://supabase.com/docs/guides/deployment/managing-environments), and [Meta ProductItem fields](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/productitem.py).

## Verified mapping manifest

This manifest records current existing IDs for review. The migration resolves existing rows through store_id and pack size. No new products or variants are created.

| Variant | Parent | store_id | Product / pack | Exact Meta retailer ID | Meta group |
| --- | --- | --- | --- | --- | --- |
| 1 | 5 | p1 | Groundnut oil · 500 ml | dtditk1gc0 | hszeo41f7z |
| 2 | 5 | p1 | Groundnut oil · 1 L | xl2wuh1d18 | hszeo41f7z |
| 3 | 5 | p1 | Groundnut oil · 2 L | jhlu61i86w | hszeo41f7z |
| 4 | 5 | p1 | Groundnut oil · 5 L | 380w55uajs | hszeo41f7z |
| 5 | 4 | p2 | Safflower Oil · 500 ml | adk09bs27q | qa53h2ocma |
| 6 | 4 | p2 | Safflower Oil · 1 L | akcbpy9hfg | qa53h2ocma |
| 7 | 4 | p2 | Safflower Oil · 2 L | s8lszhqj24 | qa53h2ocma |
| 8 | 4 | p2 | Safflower Oil · 5 L | as61cfc4ff | qa53h2ocma |
| 9 | 3 | p3 | Coconut Oil · 200 ml | 7bcdpj5v7b | xfrz0f4wsi |
| 10 | 3 | p3 | Coconut Oil · 500 ml | ny3gsn2un7 | xfrz0f4wsi |
| 11 | 3 | p3 | Coconut Oil · 1 L | dpkf8ck2d0 | xfrz0f4wsi |
| 12 | 15 | p4 | Black Sesame Oil · 200 ml | mt-black-sesame-oil-200ml | mt-black-sesame-oil |
| 13 | 15 | p4 | Black Sesame Oil · 500 ml | mt-black-sesame-oil-500ml | mt-black-sesame-oil |
| 14 | 15 | p4 | Black Sesame Oil · 1 L | mt-black-sesame-oil-1000ml | mt-black-sesame-oil |
| 15 | 7 | p5 | Sesame Oil · 1 L | 5wovdlm67j | x82qitcir0 |
| 16 | 1 | p6 | Mustard oil · 200 ml | rihd1eocew | 4oe7vpaxyw |
| 17 | 1 | p6 | Mustard oil · 500 ml | cqh56ytb6d | 4oe7vpaxyw |
| 18 | 1 | p6 | Mustard oil · 1 L | lgkmrnaejq | 4oe7vpaxyw |
| 19 | 2 | p7 | Sunflower Oil · 500 ml | akdrt9pwv9 | xgo6pfigtj |
| 20 | 2 | p7 | Sunflower Oil · 1 L | s9y9yrzqvk | xgo6pfigtj |
| 21 | 2 | p7 | Sunflower Oil · 2 L | 0l2zybxj8a | xgo6pfigtj |
| 22 | 2 | p7 | Sunflower Oil · 5 L | oy3g4izgu1 | xgo6pfigtj |
| 23 | 16 | p8 | Flax seed Oil · 1 L | mt-flaxseed-oil-1000ml | mt-flaxseed-oil |
| 24 | 17 | p9 | Niger/Huchellu Oil · 1 L | mt-niger-huchellu-oil-1000ml | mt-niger-huchellu-oil |
| 25 | 18 | p10 | Castor Oil · 100 ml | mt-castor-oil-100ml | mt-castor-oil |
| 26 | 18 | p10 | Castor Oil · 200 ml | mt-castor-oil-200ml | mt-castor-oil |
| 27 | 19 | p11 | Herbal hair Oil · 200 ml | mt-herbal-hair-oil-200ml | mt-herbal-hair-oil |
| 28 | 20 | p12 | Pain relief Oil · 100 ml | mt-pain-relief-oil-100ml | mt-pain-relief-oil |
| 29 | 6 | p13 | Almond Oil · 100 ml | sdedto6u1x | 4oe2b44nvv |
| 30 | 6 | p13 | Almond Oil · 200 ml | e30aglg5ik | 4oe2b44nvv |
| 31 | 21 | p14 | Neem Oil · 100 ml | mt-neem-oil-100ml | mt-neem-oil |
| 32 | 21 | p14 | Neem Oil · 200 ml | mt-neem-oil-200ml | mt-neem-oil |
| 33 | 22 | p15 | Honey · 200 g | mt-honey-200g | mt-honey |
| 34 | 22 | p15 | Honey · 500 g | mt-honey-500g | mt-honey |
| 35 | 22 | p15 | Honey · 1 kg | mt-honey-1000g | mt-honey |
| 36 | 23 | p16 | Turmeric · 100 g | mt-turmeric-powder-100g | mt-turmeric-powder |
| 37 | 23 | p16 | Turmeric · 200 g | mt-turmeric-powder-200g | mt-turmeric-powder |
| 38 | 23 | p16 | Turmeric · 400 g | mt-turmeric-powder-400g | mt-turmeric-powder |
| 39 | 24 | p17 | Chilli Powder Byadagi · 1 kg | mt-byadagi-chilli-powder-1000g | mt-byadagi-chilli-powder |
| 40 | 25 | p18 | Jaggery · 1 kg | mt-jaggery-1000g | mt-jaggery |
| 42 | 27 | p20 | Jaggery powder · 1 kg | mt-jaggery-powder-1000g | mt-jaggery-powder |
| 43 | 28 | p21 | Liquid Jaggery · 1 kg | mt-liquid-jaggery-1000g | mt-liquid-jaggery |
| 45 | 30 | p23 | Ragi Flour · 1 kg | mt-ragi-flour-1000g | mt-ragi-flour |
| 46 | 31 | p24 | Chia Seeds · 100 g | mt-chia-seeds-100g | mt-chia-seeds |
| 47 | 32 | p25 | Sabja Seeds · 100 g | mt-sabja-seeds-100g | mt-sabja-seeds |
| 48 | 33 | p26 | Pumpkin Seeds · 100 g | mt-pumpkin-seeds-100g | mt-pumpkin-seeds |
| 57 | 41 | p34 | Home made cookies Ragi · Pack | mt-ragi-cookies-default | mt-ragi-cookies |
| 61 | 45 | p38 | Navani · 500 g | mt-navani-millet-500g | mt-navani-millet |
| 62 | 45 | p38 | Navani · 1 kg | mt-navani-millet-1000g | mt-navani-millet |
| 63 | 46 | p39 | Baragu · 500 g | mt-baragu-millet-500g | mt-baragu-millet |
| 64 | 46 | p39 | Baragu · 1 kg | mt-baragu-millet-1000g | mt-baragu-millet |
| 65 | 47 | p40 | Saame · 500 g | mt-saame-millet-500g | mt-saame-millet |
| 66 | 47 | p40 | Saame · 1 kg | mt-saame-millet-1000g | mt-saame-millet |
| 67 | 48 | p41 | Araka · 500 g | mt-araka-millet-500g | mt-araka-millet |
| 68 | 48 | p41 | Araka · 1 kg | mt-araka-millet-1000g | mt-araka-millet |
| 69 | 49 | p42 | Korale · 500 g | mt-korale-millet-500g | mt-korale-millet |
| 70 | 49 | p42 | Korale · 1 kg | mt-korale-millet-1000g | mt-korale-millet |
| 71 | 50 | p43 | Udalu · 500 g | mt-udalu-millet-500g | mt-udalu-millet |
| 72 | 50 | p43 | Udalu · 1 kg | mt-udalu-millet-1000g | mt-udalu-millet |
| 74 | 52 | p45 | Putane Chutney · 200 g | mt-putane-chutney-200g | mt-putane-chutney |
| 75 | 53 | p46 | Gural Chutney · 200 g | mt-gural-chutney-200g | mt-gural-chutney |
| 76 | 54 | p47 | Agasi Chutney · 200 g | mt-agasi-chutney-200g | mt-agasi-chutney |
| 77 | 55 | p48 | Methi Hittu · 200 g | mt-methi-hittu-200g | mt-methi-hittu |
| 78 | 56 | p49 | Garlic Chutney · 200 g | mt-garlic-chutney-200g | mt-garlic-chutney |
| 79 | 57 | p50 | Sambar Powder · 100 g | mt-sambar-powder-100g | mt-sambar-powder |
| 80 | 58 | p51 | Puliogere Powder · 100 g | mt-puliogere-powder-100g | mt-puliogere-powder |
| 81 | 59 | p52 | Garam Masala · 100 g | mt-garam-masala-100g | mt-garam-masala |
| 82 | 60 | p53 | Rasam Powder · 100 g | mt-rasam-powder-100g | mt-rasam-powder |
| 84 | 62 | p55 | Vinay Mango Pickle · 200 g | mt-vinay-mango-pickle-200g | mt-vinay-mango-pickle |
| 85 | 62 | p55 | Vinay Mango Pickle · 500 g | mt-vinay-mango-pickle-500g | mt-vinay-mango-pickle |
| 86 | 63 | p56 | Tender Mango Pickle · 300 g | mt-tender-mango-pickle-300g | mt-tender-mango-pickle |
| 87 | 64 | p57 | Lemon Pickle · 300 g | mt-lemon-pickle-300g | mt-lemon-pickle |
| 88 | 65 | p58 | Sweet Lemon Pickle · 300 g | mt-sweet-lemon-pickle-300g | mt-sweet-lemon-pickle |
| 89 | 66 | p59 | Mix Pickle · 300 g | mt-mix-pickle-300g | mt-mix-pickle |
| 90 | 67 | p60 | Malnad Ghee · 200 ml | mt-malnad-ghee-200ml | mt-malnad-ghee |
| 91 | 67 | p60 | Malnad Ghee · 500 ml | mt-malnad-ghee-500ml | mt-malnad-ghee |
| 98 | 74 | p67 | Spice tea kashaya · Pack | mt-spice-tea-kashaya-default | mt-spice-tea-kashaya |
| 99 | 75 | p68 | Amala Kashaya · Pack | mt-amala-kashaya-default | mt-amala-kashaya |
| 100 | 76 | p69 | Ashwagandha Kashaya · Pack | mt-ashwagandha-kashaya-default | mt-ashwagandha-kashaya |
| 101 | 77 | p70 | Moringa kashaya · Pack | mt-moringa-kashaya-default | mt-moringa-kashaya |
| 103 | 79 | p72 | Chandan · Bar | mt-chandan-soap-default | mt-chandan-soap |
| 104 | 80 | p73 | Panchagavya · Bar | mt-panchagavya-soap-default | mt-panchagavya-soap |
| 106 | 82 | p75 | Neem · Pack of 3 | mt-neem-soap-3pack | mt-neem-soap |
| 107 | 83 | p76 | Orange · Pack of 3 | mt-orange-soap-3pack | mt-orange-soap |
| 110 | 86 | p79 | Red Tooth Powder · Pack | mt-red-tooth-powder-default | mt-red-tooth-powder |
| 111 | 87 | p80 | Siddhadanta Tooth Paste · Tube | mt-siddhadanta-tooth-paste-default | mt-siddhadanta-tooth-paste |
| 113 | 89 | p82 | Charcoal Face Pack · Pack | mt-charcoal-face-pack-default | mt-charcoal-face-pack |

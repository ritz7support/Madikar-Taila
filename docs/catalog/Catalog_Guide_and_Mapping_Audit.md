# Meta catalog guide and mapping audit

Snapshot: 14 October 2026 at 10:39:34 pm IST. Catalog 1515875913870520. All 95 current Meta items were read across 3 pages, with matching before/after product counts and unique item IDs. The CSV includes items originally entered manually and by feed. No Meta item was changed or uploaded.

## Files and editing

Meta_Catalog_2026-10-14.csv uses Meta feed column names and UTF-8 encoding. One row is one catalog item/pack. The id column is the exact Meta retailer ID, not Meta's numeric internal object ID. Keep existing IDs unchanged, and give each new pack a new unique ID. Use the same item_group_id for variants of one product. The price format is 1.00 INR. Descriptions, names, prices, groups, sizes, availability, links and images are copied from Meta; missing source values stay blank. Meta's system object IDs/feed IDs and empty/default-only attributes are retained in the saved JSON audit, not emitted as invented feed columns.

The CSV is a complete snapshot and editing base; it is **not a verified blanket replacement upload**. There are 26 current items without brand, GTIN or MPN. Meta's feed requirements call for a supported product identifier; complete the correct brand or identifier for those rows before a new feed import. Do not fill another manufacturer's products with Madikar Taila. Existing blank sizes also remain blank instead of inventing source data.

All current image_link values are Meta-hosted signed CDN URLs. They were preserved exactly but can expire. Before reusing an old export, refresh these URLs or use approved persistent public product-image URLs; do not remove URL query parameters or assume a different website image is identical.

For adding products, make a copy containing the header and only the new rows, with unique IDs, valid brands/identifiers, prices, group/size and persistent image URLs. For editing an existing item, keep its original ID and check its owning data source in Commerce Manager. This catalog combines manually entered items with feed 1092721596505856. A new feed is not assumed to take ownership of manually entered items. Use the upload preview and the appropriate update mode; do not choose replace/delete-missing for a subset. No feed ownership migration or live import test was performed.

## Mapping results

All 94 Supabase variants have unique populated retailer IDs that match current Meta items and the correct parent catalog. All populated Meta sizes normalize to the matched website size. Missing Meta sizes use already verified historical/owner assignments, not a new guess. Every mapped product link matches its website slug. The user's 23 link changes are present. 2 price differences remain deliberate/unresolved and were not silently reconciled: Jaggery 1 kg: Meta ₹70, website ₹85; Mustard oil 200 ml: Meta ₹1, website ₹90.

Meta still contains the unassigned Panchagavya soap item dg4i4tvblo at ₹60 without a size. It is included because the request was to export everything currently on Meta. The database four-pack and its inactive lookup have been removed; this unassigned Meta item is not treated as that four-pack.

The owner-approved compatibility patch is now deployed: whatsapp-webhook v95 resolves catalog-scoped variant IDs with parent/legacy/incoming fallbacks, and madikar-store v16 records variant IDs in new quotes with parent fallback. WhatsApp transaction prices and website server prices remain the respective sources; historical snapshots are unchanged. All 56 tests, all 94 mocked pack/payment preparations, live identity queries and deployed source parity checks passed. See docs/plans/VARIANT_RETAILER_IDS_PHASE2_REPORT.md. Current full sync remains unsafe and uninvoked pending a separate redesign. No Meta write, real payment or customer message was made.

## Missing product identifiers in Meta

- Almond Oil 200 ml: e30aglg5ik
- Almond Oil 100 ml: sdedto6u1x
- Coconut Oil 200 ml: 7bcdpj5v7b
- Coconut Oil 1 L: dpkf8ck2d0
- Coconut Oil 500 ml: ny3gsn2un7
- Groundnut oil 5 L: 380w55uajs
- Groundnut oil 500 ml: dtditk1gc0
- Groundnut oil 2 L: jhlu61i86w
- Groundnut oil 1 L: xl2wuh1d18
- Mango pickle: 3l8f6g8wzz
- Mustard oil 500 ml: cqh56ytb6d
- Mustard oil 1 L: lgkmrnaejq
- Mustard oil 200 ml: rihd1eocew
- Panchagavya soap: dg4i4tvblo
- Rose soap: lblvc9q42a
- Safflower Oil 500 ml: adk09bs27q
- Safflower Oil 1 L: akcbpy9hfg
- Safflower Oil 5 L: as61cfc4ff
- Safflower Oil 2 L: s8lszhqj24
- Sesame Oil 1 L: 5wovdlm67j
- Sesame Oil 200 ml: icep05kymv
- Sesame Oil 500 ml: j4t6mzmrun
- Sunflower Oil 2 L: 0l2zybxj8a
- Sunflower Oil 500 ml: akdrt9pwv9
- Sunflower Oil 5 L: oy3g4izgu1
- Sunflower Oil 1 L: s9y9yrzqvk

## Complete item mapping

| Product | Website pack / Meta size | Retailer ID | Variant ID | Meta ₹ | Website ₹ | Status |
|---|---|---|---:|---:|---:|---|
| Agasi Chutney | 200 g | mt-agasi-chutney-200g | 76 | 75 | 75 | Mapped |
| Almond Oil | 200 ml | e30aglg5ik | 30 | 650 | 650 | Mapped |
| Almond Oil | 100 ml | sdedto6u1x | 29 | 325 | 325 | Mapped |
| Amala Kashaya | Pack (Meta size absent) | mt-amala-kashaya-default | 99 | 200 | 200 | Mapped |
| Araka | 1 kg | mt-araka-millet-1000g | 68 | 110 | 110 | Mapped |
| Araka | 500 g | mt-araka-millet-500g | 67 | 60 | 60 | Mapped |
| Ashwagandha Kashaya | Pack (Meta size absent) | mt-ashwagandha-kashaya-default | 100 | 200 | 200 | Mapped |
| Baragu | 1 kg | mt-baragu-millet-1000g | 64 | 130 | 130 | Mapped |
| Baragu | 500 g | mt-baragu-millet-500g | 63 | 70 | 70 | Mapped |
| Black Sesame Oil | 1 L | mt-black-sesame-oil-1000ml | 14 | 845 | 845 | Mapped |
| Black Sesame Oil | 200 ml | mt-black-sesame-oil-200ml | 12 | 170 | 170 | Mapped |
| Black Sesame Oil | 500 ml | mt-black-sesame-oil-500ml | 13 | 425 | 425 | Mapped |
| Castor Oil | 100 ml | mt-castor-oil-100ml | 25 | 40 | 40 | Mapped |
| Castor Oil | 200 ml | mt-castor-oil-200ml | 26 | 80 | 80 | Mapped |
| Chandan | Bar (Meta size absent) | mt-chandan-soap-default | 103 | 60 | 60 | Mapped |
| Charcoal Face Pack | Pack (Meta size absent) | mt-charcoal-face-pack-default | 113 | 150 | 150 | Mapped |
| Chia Seeds | 100 g | mt-chia-seeds-100g | 46 | 70 | 70 | Mapped |
| Chilli Powder Byadagi | 1 kg | mt-byadagi-chilli-powder-1000g | 39 | 495 | 495 | Mapped |
| Coconut Oil | 200 ml | 7bcdpj5v7b | 9 | 1 | 1 | Mapped |
| Coconut Oil | 1 L | dpkf8ck2d0 | 11 | 545 | 545 | Mapped |
| Coconut Oil | 500 ml | ny3gsn2un7 | 10 | 275 | 275 | Mapped |
| Flax seed Oil | 200 ml | 9jag86adim | 118 | 130 | 130 | Mapped |
| Flax seed Oil | 1 L | mt-flaxseed-oil-1000ml | 23 | 645 | 645 | Mapped |
| Garam Masala | 100 g | mt-garam-masala-100g | 81 | 80 | 80 | Mapped |
| Garlic Chutney | 200 g | mt-garlic-chutney-200g | 78 | 80 | 80 | Mapped |
| Groundnut oil | 5 L | 380w55uajs | 4 | 1725 | 1725 | Mapped |
| Groundnut oil | 500 ml | dtditk1gc0 | 1 | 1 | 1 | Mapped |
| Groundnut oil | 2 L | jhlu61i86w | 3 | 690 | 690 | Mapped |
| Groundnut oil | 1 L | xl2wuh1d18 | 2 | 345 | 345 | Mapped |
| Gural Chutney | 200 g | mt-gural-chutney-200g | 75 | 80 | 80 | Mapped |
| Herbal hair Oil | 200 ml | mt-herbal-hair-oil-200ml | 27 | 245 | 245 | Mapped |
| Home made cookies Ragi | Pack (Meta size absent) | mt-ragi-cookies-default | 57 | 125 | 125 | Mapped |
| Honey | 1 kg | mt-honey-1000g | 35 | 445 | 445 | Mapped |
| Honey | 200 g | mt-honey-200g | 33 | 110 | 110 | Mapped |
| Honey | 500 g | mt-honey-500g | 34 | 225 | 225 | Mapped |
| Jaggery | 1 kg | mt-jaggery-1000g | 40 | 70 | 85 | Mapped |
| Jaggery powder | 500 gms | lgurnzbpbr | 120 | 65 | 65 | Mapped |
| Jaggery powder | 1 kg | mt-jaggery-powder-1000g | 42 | 125 | 125 | Mapped |
| Korale | 1 kg | mt-korale-millet-1000g | 70 | 265 | 265 | Mapped |
| Korale | 500 g | mt-korale-millet-500g | 69 | 135 | 135 | Mapped |
| Lemon Pickle | 300 g | mt-lemon-pickle-300g | 87 | 65 | 65 | Mapped |
| Liquid Jaggery | 1 kg | mt-liquid-jaggery-1000g | 43 | 120 | 120 | Mapped |
| Malnad Ghee | 200 ml | mt-malnad-ghee-200ml | 90 | 325 | 325 | Mapped |
| Malnad Ghee | 500 ml | mt-malnad-ghee-500ml | 91 | 750 | 750 | Mapped |
| Mango pickle | 300 g (Meta size absent) | 3l8f6g8wzz | 83 | 125 | 125 | Mapped |
| Methi Hittu | 200 g | mt-methi-hittu-200g | 77 | 75 | 75 | Mapped |
| Mix Pickle | 300 g | mt-mix-pickle-300g | 89 | 65 | 65 | Mapped |
| Moringa kashaya | Pack (Meta size absent) | mt-moringa-kashaya-default | 101 | 200 | 200 | Mapped |
| Mustard oil | 500 ml | cqh56ytb6d | 17 | 200 | 200 | Mapped |
| Mustard oil | 1 L | lgkmrnaejq | 18 | 395 | 395 | Mapped |
| Mustard oil | 200 ml | rihd1eocew | 16 | 1 | 90 | Mapped |
| Navani | 1 kg | mt-navani-millet-1000g | 62 | 80 | 80 | Mapped |
| Navani | 500 g | mt-navani-millet-500g | 61 | 40 | 40 | Mapped |
| Neem | Pack of 3 | mt-neem-soap-3pack | 106 | 90 | 90 | Mapped |
| Neem Oil | 100 ml | mt-neem-oil-100ml | 31 | 60 | 60 | Mapped |
| Neem Oil | 200 ml | mt-neem-oil-200ml | 32 | 120 | 120 | Mapped |
| Niger/Huchellu Oil | 200 ml | bnzn0sa6jq | 119 | 125 | 125 | Mapped |
| Niger/Huchellu Oil | 1 L | mt-niger-huchellu-oil-1000ml | 24 | 645 | 645 | Mapped |
| Orange | Pack of 3 | mt-orange-soap-3pack | 107 | 90 | 90 | Mapped |
| Pain relief Oil | 100 ml | mt-pain-relief-oil-100ml | 28 | 145 | 145 | Mapped |
| Panchagavya | Bar (Meta size absent) | mt-panchagavya-soap-default | 104 | 60 | 60 | Mapped |
| Panchagavya soap | Not supplied (Meta size absent) | dg4i4tvblo | — | 60 | — | Unassigned |
| Puliogere Powder | 100 g | mt-puliogere-powder-100g | 80 | 55 | 55 | Mapped |
| Pumpkin Seeds | 100 g | mt-pumpkin-seeds-100g | 48 | 70 | 70 | Mapped |
| Putane Chutney | 200 g | mt-putane-chutney-200g | 74 | 75 | 75 | Mapped |
| Ragi Flour | 1 kg | mt-ragi-flour-1000g | 45 | 110 | 110 | Mapped |
| Rasam Powder | 100 g | mt-rasam-powder-100g | 82 | 80 | 80 | Mapped |
| Red Tooth Powder | Pack (Meta size absent) | mt-red-tooth-powder-default | 110 | 150 | 150 | Mapped |
| Rose soap | Bar (Meta size absent) | lblvc9q42a | 102 | 90 | 90 | Mapped |
| Saame | 1 kg | mt-saame-millet-1000g | 66 | 160 | 160 | Mapped |
| Saame | 500 g | mt-saame-millet-500g | 65 | 80 | 80 | Mapped |
| Sabja Seeds | 100 g | mt-sabja-seeds-100g | 47 | 45 | 45 | Mapped |
| Safflower Oil | 500 ml | adk09bs27q | 5 | 1 | 1 | Mapped |
| Safflower Oil | 1 L | akcbpy9hfg | 6 | 375 | 375 | Mapped |
| Safflower Oil | 5 L | as61cfc4ff | 8 | 1850 | 1850 | Mapped |
| Safflower Oil | 2 L | s8lszhqj24 | 7 | 790 | 790 | Mapped |
| Sambar Powder | 100 g | mt-sambar-powder-100g | 79 | 80 | 80 | Mapped |
| Sesame Oil | 1 L | 5wovdlm67j | 15 | 595 | 595 | Mapped |
| Sesame Oil | 200 ml | icep05kymv | 117 | 120 | 120 | Mapped |
| Sesame Oil | 500 ml | j4t6mzmrun | 116 | 300 | 300 | Mapped |
| Siddhadanta Tooth Paste | Tube (Meta size absent) | mt-siddhadanta-tooth-paste-default | 111 | 65 | 65 | Mapped |
| Spice tea kashaya | Pack (Meta size absent) | mt-spice-tea-kashaya-default | 98 | 200 | 200 | Mapped |
| Sunflower Oil | 2 L | 0l2zybxj8a | 21 | 790 | 790 | Mapped |
| Sunflower Oil | 500 ml | akdrt9pwv9 | 19 | 1 | 1 | Mapped |
| Sunflower Oil | 5 L | oy3g4izgu1 | 22 | 1975 | 1975 | Mapped |
| Sunflower Oil | 1 L | s9y9yrzqvk | 20 | 395 | 395 | Mapped |
| Sweet Lemon Pickle | 300 g | mt-sweet-lemon-pickle-300g | 88 | 65 | 65 | Mapped |
| Tender Mango Pickle | 300 g | mt-tender-mango-pickle-300g | 86 | 130 | 130 | Mapped |
| Turmeric | 100 g | mt-turmeric-powder-100g | 36 | 50 | 50 | Mapped |
| Turmeric | 200 g | mt-turmeric-powder-200g | 37 | 100 | 100 | Mapped |
| Turmeric | 400 g | mt-turmeric-powder-400g | 38 | 200 | 200 | Mapped |
| Udalu | 1 kg | mt-udalu-millet-1000g | 72 | 145 | 145 | Mapped |
| Udalu | 500 g | mt-udalu-millet-500g | 71 | 75 | 75 | Mapped |
| Vinay Mango Pickle | 200 g | mt-vinay-mango-pickle-200g | 84 | 125 | 125 | Mapped |
| Vinay Mango Pickle | 500 g | mt-vinay-mango-pickle-500g | 85 | 250 | 250 | Mapped |

Sources: [Meta feed reference](https://developers.facebook.com/documentation/ads-commerce/catalog/reference), [WhatsApp order webhook fields](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/order/), authenticated Meta catalog snapshot and Supabase catalog read.

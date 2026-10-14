# Catalog refresh and WhatsApp Razorpay order-ID correction

Completed 15 October 2026 IST on `codex/catalog-export-variant-compatibility`, continuing from `74ed990`. The owner requested refreshed CSVs and the `order_` prefix for WhatsApp Razorpay order IDs. The owner deferred the additional live purchase of a pack whose retailer ID differs from its parent.

## Refreshed catalog files

The full authenticated Meta snapshot was captured on **14 October at 23:57:21 IST**: 94 unique items across three pages, with matching before/after product counts. All 94 existing Supabase variants match current Meta retailer IDs, parent catalogs, populated sizes, product-page links and prices. There are no unmatched items.

`docs/catalog/Meta_Catalog_2026-10-14.csv` and its previously delivered copy in `outputs/catalog-export-20261014/deliverables/` now contain the same refreshed bytes. The original filename is retained for continuity. The companion catalog guide and ₹1 checklist are refreshed too.

- Extra Panchagavya `dg4i4tvblo` is absent, following the owner's removal. The valid single-bar item remains.
- Mustard 200 ml `rihd1eocew` is ₹90; Jaggery 1 kg `mt-jaggery-1000g` is ₹85. These are the owner's changes, read from Meta and confirmed against Supabase.
- Four ₹1 packs remain in both systems: Groundnut 500 ml, Safflower 500 ml, Coconut 200 ml and Sunflower 500 ml. Their prices were preserved.
- The 15 existing feed columns, exact retailer IDs, text, groups, sizes, availability, inventory and URLs are preserved from the fresh source. The only field differences among the retained 94 rows are the two corrected prices and 28 freshly returned Meta CDN image URLs. The 66 Google Drive image links are unchanged.

Artifact-tool cell validation and CSV round-trip passed. An independent Python CSV parser checked all **1,410 cells**, uniqueness, complete Meta coverage and all 94 website prices. UTF-8 BOM, quoted RFC 4180 cells and source newlines are preserved. CSV SHA-256: `86846d92ee4f4cdb55d3b169b2ea7ff856d5a6fdccbb0719730d4951606e1435`.

This remains an editing/export snapshot, not a tested replacement-feed import. Twenty-five items still lack brand/GTIN/MPN; those blanks are preserved. Meta CDN image URLs may expire, and existing manual/feed ownership still needs to be respected when uploading. See the refreshed catalog guide. No Meta write, CSV upload or full catalog sync occurred.

## Correct full provider order IDs

The prior bot handler preferred `payload.order.entity.id`, which can be bare, over the canonical `payload.payment.entity.order_id`. Razorpay's [Payment Links webhook example](https://razorpay.com/docs/webhooks/payment-links/) demonstrates this distinction. The focused fix prefers the payment entity's order ID, retains the order entity as a fallback, and adds `order_` only when absent. Missing IDs retain the previous empty/null behavior. The user-facing `ORD-…` references are unchanged.

Only **razorpay-webhook v34** was deployed, using the complete function and its existing shared module. Both deployed files match the local source after line-ending normalization. Existing `verify_jwt=false` and body-signature authentication are preserved. An unsigned empty request returns 401 before payment processing. The other five functions retain their exact versions, hashes and authentication settings; no Site publication occurred.

The full regression suite passed **61 tests**, including five new tests covering signed live/test events, bare and already-prefixed fallbacks, identity precedence, missing IDs, duplicate suppression, signature/amount rejection and unchanged expired/cancelled behavior. The function bundle check passed. All payment/message/handoff operations in these tests were mocked; no valid paid event was replayed against production.

## Provider-verified historical correction

Direct read-only Razorpay payment responses confirmed the full order ID, payment ID, amount in paise, currency and captured status for **14** affected paid WhatsApp payment records: **10, 11, 12, 13, 17, 19, 29, 30, 43, 45, 49, 52, 55 and 57**. All were verified in live mode. Payment 57 now stores `order_TnsZYkxChC8upP`.

A guarded repeatable-read transaction changed only `payments.provider_order_id` for those exact verified rows. It locked the target rows, rechecked source/provider/status/identity/amount/currency, required exactly 14 matches and updates, checked the absence of application payment triggers, and compared the resulting full payment records with the expected one-column changes. Every other payment field, including timestamps, stayed identical; non-target payment rows stayed identical. No paid-transition RPC or message/handoff operation was invoked.

Before/after fingerprints also match for all Product and ProductVariant fields, orders, order items, public routine definitions/privileges, table security/grants and policies. A fresh query found **zero remaining non-null WhatsApp provider order IDs without `order_`**. Previously null IDs were not guessed or populated. The separate missing `payment_method` metadata remains deferred.

## Evidence and remaining work

Ignored `outputs/catalog-prefix-update-20261014/` contains the fresh Meta snapshot, sanitized provider verification, guarded correction SQL, before/after catalog and runtime snapshots, validation scripts/results and previous CSV backup. The temporary authenticated, expiring, GET-only reader was removed; its endpoint returns 404 and only the original six functions remain. Provider credentials stayed server-side.

The additional live pack purchase remains deferred at the owner's request. Variant-aware full sync, shipping calculations, remaining content/metadata differences, payment-method bookkeeping and broader recovery/refund checks are separate work. No new payment, refund, customer message or price change was initiated by this task.

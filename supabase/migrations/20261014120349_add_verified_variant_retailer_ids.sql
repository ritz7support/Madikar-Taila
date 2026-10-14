-- Phase 1 metadata only. Fresh Meta catalog 1515875913870520: 90 items on
-- 14 October 2026, complete three-page read; 87 revalidated historical mappings.
-- Owner deferred generated IDs 3l8f6g8wzz, lblvc9q42a and dg4i4tvblo.
-- No parent inserts/deletes/ID replacements, price/stock/weight edits or runtime changes.
-- Snapshot guards intentionally stop this production backfill on other databases
-- or after team edits. Refresh evidence and prepare a new migration if they fail.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
LOCK TABLE public."Product" IN SHARE MODE;
LOCK TABLE public."ProductVariant" IN ACCESS EXCLUSIVE MODE;

DO $migration$
DECLARE
  changed integer;
  product_hash text;
  variant_hash text;
BEGIN
  SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '' ORDER BY id), ''))
    INTO product_hash FROM public."Product" p;
  SELECT md5(coalesce(string_agg(to_jsonb(v)::text, '' ORDER BY id), ''))
    INTO variant_hash FROM public."ProductVariant" v;
  IF product_hash <> 'f859b7158aced41aa79b2a66b7d5aa92'
     OR variant_hash <> '67a0ce969cbafbd39347bbda520d1088'
     OR (SELECT count(*) FROM public."Product") <> 76
     OR (SELECT count(*) FROM public."ProductVariant") <> 95 THEN
    RAISE EXCEPTION 'Catalog changed since the fresh Phase 1 snapshot; refresh and review before backfill';
  END IF;
  IF EXISTS (SELECT 1 FROM public."Product" WHERE catalog_id IS DISTINCT FROM '1515875913870520') THEN
    RAISE EXCEPTION 'Review catalog-scoped uniqueness before applying to a different catalog setup';
  END IF;

  ALTER TABLE public."ProductVariant"
    ADD COLUMN retailer_id text
    CONSTRAINT "ProductVariant_retailer_id_format_check"
    CHECK (retailer_id IS NULL OR
      (retailer_id <> '' AND retailer_id !~ '^[[:space:]]|[[:space:]]$'));

  CREATE UNIQUE INDEX "ProductVariant_retailer_id_unique"
    ON public."ProductVariant" (retailer_id) WHERE retailer_id IS NOT NULL;

  COMMENT ON COLUMN public."ProductVariant".retailer_id IS
    'Verified Meta item retailer ID for this pack in the single parent catalog. Exact case retained; NULL means unverified/unlisted. Phase 1 metadata only; legacy Product retailer IDs and runtime consumers are preserved.';

  -- Resolve existing rows by stable website identity and exact current size.
  -- No generated database IDs, inferred IDs or prices are used as identity keys.
  WITH verified(store_id, size, retailer_id) AS (VALUES
      ('p1', '500 ml', 'dtditk1gc0'),
      ('p1', '1 L', 'xl2wuh1d18'),
      ('p1', '2 L', 'jhlu61i86w'),
      ('p1', '5 L', '380w55uajs'),
      ('p2', '500 ml', 'adk09bs27q'),
      ('p2', '1 L', 'akcbpy9hfg'),
      ('p2', '2 L', 's8lszhqj24'),
      ('p2', '5 L', 'as61cfc4ff'),
      ('p3', '200 ml', '7bcdpj5v7b'),
      ('p3', '500 ml', 'ny3gsn2un7'),
      ('p3', '1 L', 'dpkf8ck2d0'),
      ('p4', '200 ml', 'mt-black-sesame-oil-200ml'),
      ('p4', '500 ml', 'mt-black-sesame-oil-500ml'),
      ('p4', '1 L', 'mt-black-sesame-oil-1000ml'),
      ('p5', '1 L', '5wovdlm67j'),
      ('p6', '200 ml', 'rihd1eocew'),
      ('p6', '500 ml', 'cqh56ytb6d'),
      ('p6', '1 L', 'lgkmrnaejq'),
      ('p7', '500 ml', 'akdrt9pwv9'),
      ('p7', '1 L', 's9y9yrzqvk'),
      ('p7', '2 L', '0l2zybxj8a'),
      ('p7', '5 L', 'oy3g4izgu1'),
      ('p8', '1 L', 'mt-flaxseed-oil-1000ml'),
      ('p9', '1 L', 'mt-niger-huchellu-oil-1000ml'),
      ('p10', '100 ml', 'mt-castor-oil-100ml'),
      ('p10', '200 ml', 'mt-castor-oil-200ml'),
      ('p11', '200 ml', 'mt-herbal-hair-oil-200ml'),
      ('p12', '100 ml', 'mt-pain-relief-oil-100ml'),
      ('p13', '100 ml', 'sdedto6u1x'),
      ('p13', '200 ml', 'e30aglg5ik'),
      ('p14', '100 ml', 'mt-neem-oil-100ml'),
      ('p14', '200 ml', 'mt-neem-oil-200ml'),
      ('p15', '200 g', 'mt-honey-200g'),
      ('p15', '500 g', 'mt-honey-500g'),
      ('p15', '1 kg', 'mt-honey-1000g'),
      ('p16', '100 g', 'mt-turmeric-powder-100g'),
      ('p16', '200 g', 'mt-turmeric-powder-200g'),
      ('p16', '400 g', 'mt-turmeric-powder-400g'),
      ('p17', '1 kg', 'mt-byadagi-chilli-powder-1000g'),
      ('p18', '1 kg', 'mt-jaggery-1000g'),
      ('p20', '1 kg', 'mt-jaggery-powder-1000g'),
      ('p21', '1 kg', 'mt-liquid-jaggery-1000g'),
      ('p23', '1 kg', 'mt-ragi-flour-1000g'),
      ('p24', '100 g', 'mt-chia-seeds-100g'),
      ('p25', '100 g', 'mt-sabja-seeds-100g'),
      ('p26', '100 g', 'mt-pumpkin-seeds-100g'),
      ('p34', 'Pack', 'mt-ragi-cookies-default'),
      ('p38', '500 g', 'mt-navani-millet-500g'),
      ('p38', '1 kg', 'mt-navani-millet-1000g'),
      ('p39', '500 g', 'mt-baragu-millet-500g'),
      ('p39', '1 kg', 'mt-baragu-millet-1000g'),
      ('p40', '500 g', 'mt-saame-millet-500g'),
      ('p40', '1 kg', 'mt-saame-millet-1000g'),
      ('p41', '500 g', 'mt-araka-millet-500g'),
      ('p41', '1 kg', 'mt-araka-millet-1000g'),
      ('p42', '500 g', 'mt-korale-millet-500g'),
      ('p42', '1 kg', 'mt-korale-millet-1000g'),
      ('p43', '500 g', 'mt-udalu-millet-500g'),
      ('p43', '1 kg', 'mt-udalu-millet-1000g'),
      ('p45', '200 g', 'mt-putane-chutney-200g'),
      ('p46', '200 g', 'mt-gural-chutney-200g'),
      ('p47', '200 g', 'mt-agasi-chutney-200g'),
      ('p48', '200 g', 'mt-methi-hittu-200g'),
      ('p49', '200 g', 'mt-garlic-chutney-200g'),
      ('p50', '100 g', 'mt-sambar-powder-100g'),
      ('p51', '100 g', 'mt-puliogere-powder-100g'),
      ('p52', '100 g', 'mt-garam-masala-100g'),
      ('p53', '100 g', 'mt-rasam-powder-100g'),
      ('p55', '200 g', 'mt-vinay-mango-pickle-200g'),
      ('p55', '500 g', 'mt-vinay-mango-pickle-500g'),
      ('p56', '300 g', 'mt-tender-mango-pickle-300g'),
      ('p57', '300 g', 'mt-lemon-pickle-300g'),
      ('p58', '300 g', 'mt-sweet-lemon-pickle-300g'),
      ('p59', '300 g', 'mt-mix-pickle-300g'),
      ('p60', '200 ml', 'mt-malnad-ghee-200ml'),
      ('p60', '500 ml', 'mt-malnad-ghee-500ml'),
      ('p67', 'Pack', 'mt-spice-tea-kashaya-default'),
      ('p68', 'Pack', 'mt-amala-kashaya-default'),
      ('p69', 'Pack', 'mt-ashwagandha-kashaya-default'),
      ('p70', 'Pack', 'mt-moringa-kashaya-default'),
      ('p72', 'Bar', 'mt-chandan-soap-default'),
      ('p73', 'Bar', 'mt-panchagavya-soap-default'),
      ('p75', 'Pack of 3', 'mt-neem-soap-3pack'),
      ('p76', 'Pack of 3', 'mt-orange-soap-3pack'),
      ('p79', 'Pack', 'mt-red-tooth-powder-default'),
      ('p80', 'Tube', 'mt-siddhadanta-tooth-paste-default'),
      ('p82', 'Pack', 'mt-charcoal-face-pack-default')
  )
  UPDATE public."ProductVariant" v SET retailer_id = verified.retailer_id
    FROM verified JOIN public."Product" p
      ON p.store_id = verified.store_id AND p.catalog_id = '1515875913870520'
    WHERE v.product_id = p.id AND v.size = verified.size AND v.retailer_id IS NULL;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 87
     OR (SELECT count(*) FROM public."ProductVariant" WHERE retailer_id IS NOT NULL) <> 87
     OR (SELECT count(*) FROM public."ProductVariant" WHERE retailer_id IS NULL) <> 8 THEN
    RAISE EXCEPTION 'Expected exactly 87 mapped existing variants and 8 NULL variants; updated %', changed;
  END IF;

  IF (SELECT md5(coalesce(string_agg(to_jsonb(p)::text, '' ORDER BY id), '')) FROM public."Product" p) <> product_hash
     OR (SELECT md5(coalesce(string_agg((to_jsonb(v) - 'retailer_id')::text, '' ORDER BY id), '')) FROM public."ProductVariant" v) <> variant_hash THEN
    RAISE EXCEPTION 'Existing catalog data changed during Phase 1; rolling back';
  END IF;
END
$migration$;

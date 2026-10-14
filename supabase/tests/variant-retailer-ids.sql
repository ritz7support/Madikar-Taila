-- Run after the focused Phase 1 migration. Every fixture write rolls back.
-- No inserts, sequence changes, order/payment RPCs or outbound calls.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
SET LOCAL ROLE service_role;

DO $test$
DECLARE
  first_variant public."ProductVariant"%ROWTYPE;
  second_variant public."ProductVariant"%ROWTYPE;
  invalid text;
  actual jsonb;
BEGIN
  SELECT * INTO STRICT first_variant FROM public."ProductVariant"
    WHERE retailer_id IS NOT NULL ORDER BY id LIMIT 1 FOR UPDATE;
  SELECT * INTO STRICT second_variant FROM public."ProductVariant"
    WHERE retailer_id IS NOT NULL AND id <> first_variant.id ORDER BY id LIMIT 1 FOR UPDATE;

  FOREACH invalid IN ARRAY ARRAY['', ' ', E'\t', E'\n', ' leading', 'trailing ', E'\tprefix', E'suffix\n'] LOOP
    BEGIN
      UPDATE public."ProductVariant" SET retailer_id = invalid WHERE id = first_variant.id;
      RAISE EXCEPTION 'Invalid retailer ID was accepted: %', quote_literal(invalid);
    EXCEPTION WHEN check_violation THEN NULL;
    END;
  END LOOP;

  BEGIN
    UPDATE public."ProductVariant" SET retailer_id = first_variant.retailer_id WHERE id = second_variant.id;
    RAISE EXCEPTION 'Duplicate retailer ID was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- NULL can occur on several unverified packs; exact spelling/case is retained.
  UPDATE public."ProductVariant" SET retailer_id = NULL WHERE id IN (first_variant.id, second_variant.id);
  UPDATE public."ProductVariant" SET retailer_id = 'Phase1FixtureCase' WHERE id = first_variant.id;
  UPDATE public."ProductVariant" SET retailer_id = 'phase1fixturecase' WHERE id = second_variant.id;
  IF (SELECT retailer_id FROM public."ProductVariant" WHERE id = first_variant.id) <> 'Phase1FixtureCase' THEN
    RAISE EXCEPTION 'Retailer ID case was changed';
  END IF;

  -- Existing admin updates explicitly omit retailer_id; mapped values survive.
  UPDATE public."ProductVariant"
    SET size = first_variant.size, price = first_variant.price,
        inventory_quantity = first_variant.inventory_quantity,
        availability_status = first_variant.availability_status,
        shipping_weight_grams = first_variant.shipping_weight_grams
    WHERE id = first_variant.id;
  SELECT to_jsonb(v) INTO actual FROM public."ProductVariant" v WHERE id = first_variant.id;
  IF actual <> jsonb_set(to_jsonb(first_variant), '{retailer_id}', '"Phase1FixtureCase"') THEN
    RAISE EXCEPTION 'Admin-style save changed variant identity or other data';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ProductVariant' AND column_name = 'retailer_id'
      AND (is_nullable <> 'YES' OR column_default IS NOT NULL OR data_type <> 'text')
  ) THEN RAISE EXCEPTION 'New packs must accept an omitted nullable text retailer ID'; END IF;

  IF has_table_privilege('anon', 'public."ProductVariant"', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_table_privilege('authenticated', 'public."ProductVariant"', 'SELECT,INSERT,UPDATE,DELETE')
     OR has_column_privilege('anon', 'public."ProductVariant"', 'retailer_id', 'SELECT,INSERT,UPDATE')
     OR has_column_privilege('authenticated', 'public."ProductVariant"', 'retailer_id', 'SELECT,INSERT,UPDATE') THEN
    RAISE EXCEPTION 'Catalog metadata must remain private to privileged server access';
  END IF;
END
$test$;
ROLLBACK;

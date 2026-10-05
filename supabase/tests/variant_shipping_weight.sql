-- Run after the migration. Uses only a temporary table; never writes live variants.
BEGIN;
SET LOCAL statement_timeout = '10s';
CREATE TEMP TABLE weight_test (LIKE public."ProductVariant" INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
INSERT INTO weight_test (id,product_id,position,size,price,shipping_weight_grams)
VALUES (1,1,0,'500 ml',175,NULL),(2,1,1,'1 L',345,1050);
DO $$
BEGIN
  IF (SELECT shipping_weight_grams FROM weight_test WHERE id=1) IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown weights must stay NULL';
  END IF;
  UPDATE weight_test SET shipping_weight_grams=550 WHERE id=1;
  IF (SELECT shipping_weight_grams FROM weight_test WHERE id=1) <> 550 THEN
    RAISE EXCEPTION 'Weight update did not persist';
  END IF;
  BEGIN
    UPDATE weight_test SET shipping_weight_grams=0 WHERE id=1;
    RAISE EXCEPTION 'Zero weight was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE weight_test SET shipping_weight_grams=-1 WHERE id=1;
    RAISE EXCEPTION 'Negative weight was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE weight_test SET shipping_weight_grams=NULL WHERE id=1;
  IF (SELECT price FROM weight_test WHERE id=1) <> 175 THEN
    RAISE EXCEPTION 'Weight editing changed the price';
  END IF;
END;
$$;
SELECT 'Weight constraints, save and clear passed; no live variants modified' AS result;
ROLLBACK;

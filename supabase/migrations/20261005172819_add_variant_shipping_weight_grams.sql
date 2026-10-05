-- Optional catalog metadata only. Existing carts, orders and shipping totals are unchanged.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

ALTER TABLE public."ProductVariant"
  ADD COLUMN shipping_weight_grams integer
  CONSTRAINT "ProductVariant_shipping_weight_grams_check"
  CHECK (shipping_weight_grams > 0);

COMMENT ON COLUMN public."ProductVariant".shipping_weight_grams IS
  'Weight of one sellable variant in whole grams, including its immediate container, excluding outer shipping packaging. NULL means unknown; no shipping charge is derived yet.';

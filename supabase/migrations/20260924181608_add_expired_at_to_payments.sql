-- Mirrors the existing paid_at/failed_at/cancelled_at columns for the new
-- payment_link.expired handling in razorpay-webhook (payments.status already allows
-- 'expired' but had no matching timestamp column).
alter table public.payments add column if not exists expired_at timestamptz;

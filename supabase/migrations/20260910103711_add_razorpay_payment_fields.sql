alter table public.orders
  add column if not exists razorpay_payment_link_id text,
  add column if not exists razorpay_payment_link_reference_id text,
  add column if not exists razorpay_payment_link_url text,
  add column if not exists razorpay_payment_id text,
  add column if not exists razorpay_payment_status text not null default 'not_created',
  add column if not exists razorpay_paid_at timestamptz,
  add column if not exists razorpay_event_id text;

create unique index if not exists orders_razorpay_payment_link_id_uidx
  on public.orders (razorpay_payment_link_id)
  where razorpay_payment_link_id is not null;

create unique index if not exists orders_razorpay_payment_link_reference_id_uidx
  on public.orders (razorpay_payment_link_reference_id)
  where razorpay_payment_link_reference_id is not null;

create unique index if not exists orders_razorpay_payment_id_uidx
  on public.orders (razorpay_payment_id)
  where razorpay_payment_id is not null;

create unique index if not exists orders_razorpay_event_id_uidx
  on public.orders (razorpay_event_id)
  where razorpay_event_id is not null;

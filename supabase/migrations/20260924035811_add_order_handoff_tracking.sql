alter table public.orders
  add column if not exists handoff_sent_at timestamptz,
  add column if not exists handoff_attempts integer not null default 0,
  add column if not exists handoff_last_attempt_at timestamptz,
  add column if not exists handoff_last_error text;

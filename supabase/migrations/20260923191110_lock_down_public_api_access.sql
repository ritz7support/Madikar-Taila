alter table public.payments enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;

drop policy if exists "Users can view their own orders" on public.orders;
drop policy if exists "Users can view their own order items" on public.order_items;
drop policy if exists "Users can view own addresses" on public.addresses;
drop policy if exists "Users can insert own addresses" on public.addresses;
drop policy if exists "Users can update own addresses" on public.addresses;
drop policy if exists "Users can delete own addresses" on public.addresses;

alter function public.set_orders_updated_at() set search_path = '';
alter function public.set_addresses_updated_at() set search_path = '';
alter table public."Profile" alter column language set default 'en';

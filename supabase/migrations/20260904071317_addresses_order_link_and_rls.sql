alter table public.addresses
  add column if not exists is_active boolean not null default true;

alter table public.addresses enable row level security;

drop policy if exists "Users can view own addresses" on public.addresses;
drop policy if exists "Users can insert own addresses" on public.addresses;
drop policy if exists "Users can update own addresses" on public.addresses;
drop policy if exists "Users can delete own addresses" on public.addresses;

create policy "Users can view own addresses"
on public.addresses
for select
to authenticated
using ((select auth.uid()) = profile_id);

create policy "Users can insert own addresses"
on public.addresses
for insert
to authenticated
with check ((select auth.uid()) = profile_id);

create policy "Users can update own addresses"
on public.addresses
for update
to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

create policy "Users can delete own addresses"
on public.addresses
for delete
to authenticated
using ((select auth.uid()) = profile_id);

create index if not exists addresses_profile_id_active_idx
on public.addresses (profile_id, is_active, is_default, updated_at desc);

alter table public.orders
  add column if not exists address_id uuid null references public.addresses(id) on delete set null;

create index if not exists orders_address_id_idx
on public.orders(address_id);

-- Keep the database flexible for WhatsApp Flow writes made server-side with the service key;
-- RLS remains enabled for any Data API access.

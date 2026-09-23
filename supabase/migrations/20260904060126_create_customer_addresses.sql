create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public."Profile"(id) on delete cascade,
  label text not null,
  recipient_name text,
  phone text,
  address_line_1 text not null,
  address_line_2 text,
  locality text,
  city text not null,
  state text not null,
  pincode text not null,
  country text not null default 'India',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index addresses_profile_id_idx on public.addresses(profile_id);

create unique index addresses_one_default_per_profile_idx
  on public.addresses(profile_id)
  where is_default = true;

alter table public.addresses enable row level security;

create policy "Service role can manage addresses"
  on public.addresses
  for all
  to service_role
  using (true)
  with check (true);

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

create or replace function public.set_addresses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists addresses_set_updated_at on public.addresses;
create trigger addresses_set_updated_at
before update on public.addresses
for each row
execute function public.set_addresses_updated_at();

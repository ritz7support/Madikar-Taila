-- Store-only display name keeps Meta's Product.name untouched.
alter table public."Product" add column if not exists store_name text;
update public."Product" set store_name=name where store_active and store_name is null;

-- Only the verified server-side admin endpoint may read this allowlist.
create table if not exists public.store_admins (
  email text primary key check (email=lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.store_admins enable row level security;
revoke all on public.store_admins from anon, authenticated;
grant select on public.store_admins to service_role;
insert into public.store_admins(email) values ('support@ritz7.ai') on conflict (email) do nothing;

-- Uploaded product pictures are public to shoppers; uploads require the protected admin API.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('madikar-product-images','madikar-product-images',true,1500000,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

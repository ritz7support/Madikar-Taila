-- Add website content without changing the existing Meta sync or bot contract.
-- Slugs are URL segments, not full URLs. Routing is a separate website change.
alter table public."Product"
  add column slug text,
  add column website_description text,
  add column traditional_benefits text,
  add column extraction_craft text,
  add column ingredients_and_more text;

update public."Product"
set slug = trim(both '-' from regexp_replace(
      lower(coalesce(nullif(store_name, ''), name)), '[^a-z0-9]+', '-', 'g')),
    website_description = short_description;

alter table public."Product"
  add constraint product_slug_format_check
    check (slug is null or slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint product_slug_key unique (slug);

comment on column public."Product".slug is
  'Stable lowercase product URL segment, e.g. groundnut-oil. Does not change on a Meta name update. Nullable so new Meta sync rows can be imported before their website URL is assigned.';
comment on column public."Product".website_description is
  'Short website description. Synchronized with legacy short_description until the website API and admin use this column.';
comment on column public."Product".traditional_benefits is
  'Owner-authored traditional benefits for the product detail page; plain text.';
comment on column public."Product".extraction_craft is
  'Owner-authored extraction or preparation details for the product detail page; plain text.';
comment on column public."Product".ingredients_and_more is
  'Owner-authored ingredients and additional product details; plain text.';

-- The live madikar-store v3 API still reads/writes short_description.
-- Accept writes through either name and reject conflicting dual writes.
create function public.sync_product_website_description()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.website_description is not null and new.short_description is not null
       and new.website_description is distinct from new.short_description then
      raise exception 'Conflicting website descriptions' using errcode = '23514';
    end if;
    new.website_description := coalesce(new.website_description, new.short_description);
    new.short_description := new.website_description;
  elsif new.website_description is distinct from old.website_description then
    if new.short_description is distinct from old.short_description
       and new.short_description is distinct from new.website_description then
      raise exception 'Conflicting website descriptions' using errcode = '23514';
    end if;
    new.short_description := new.website_description;
  elsif new.short_description is distinct from old.short_description then
    new.website_description := new.short_description;
  end if;
  return new;
end;
$function$;

revoke all on function public.sync_product_website_description() from public, anon, authenticated;
grant execute on function public.sync_product_website_description() to service_role;

create trigger sync_product_website_description
before insert or update of short_description, website_description on public."Product"
for each row execute function public.sync_product_website_description();

-- Existing RLS, table grants, keys, Meta fields, and cleanup protection stay intact.

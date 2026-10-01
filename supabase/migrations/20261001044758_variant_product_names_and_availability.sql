begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
alter table public."ProductVariant" add column product_name text;
comment on column public."ProductVariant".product_name is 'Automatically synchronized website display name from Product.store_name, falling back to Product.name.';

create function public.store_set_variant_product_name()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  select coalesce(nullif(p.store_name,''),p.name) into new.product_name
  from public."Product" p where p.id=new.product_id;
  return new;
end;
$$;
create trigger store_set_variant_product_name
before insert or update of product_id,product_name on public."ProductVariant"
for each row execute function public.store_set_variant_product_name();

create function public.store_sync_variant_product_names()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  update public."ProductVariant" v
  set product_name=coalesce(nullif(new.store_name,''),new.name)
  where v.product_id=new.id
    and v.product_name is distinct from coalesce(nullif(new.store_name,''),new.name);
  return new;
end;
$$;
create trigger store_sync_variant_product_names
after update of store_name,name on public."Product"
for each row when(old.store_name is distinct from new.store_name or old.name is distinct from new.name)
execute function public.store_sync_variant_product_names();

revoke all on function public.store_set_variant_product_name() from public,anon,authenticated;
revoke all on function public.store_sync_variant_product_names() from public,anon,authenticated;
grant execute on function public.store_set_variant_product_name() to service_role;
grant execute on function public.store_sync_variant_product_names() to service_role;

update public."ProductVariant" v
set product_name=coalesce(nullif(p.store_name,''),p.name),
    availability_status='available',
    inventory_quantity=case when v.inventory_quantity=0 then null else v.inventory_quantity end
from public."Product" p where p.id=v.product_id;
-- Retain positive quantities if added concurrently; null means untracked stock.
commit;

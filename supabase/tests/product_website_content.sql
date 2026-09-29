-- Transactional compatibility checks; all fixture writes are rolled back.
begin;
do $test$
declare
  target_id bigint;
  original_slug text;
  short_value text;
  website_value text;
begin
  select id, slug into strict target_id, original_slug
    from public."Product" where retailer_id = 'dtditk1gc0' and catalog_id = '1515875913870520';

  if exists(select 1 from public."Product" where website_description is distinct from short_description) then
    raise exception 'Description backfill or compatibility failed';
  end if;

  update public."Product" set website_description = 'Schema test: new field' where id = target_id;
  select short_description into short_value from public."Product" where id = target_id;
  if short_value is distinct from 'Schema test: new field' then
    raise exception 'New description does not update legacy description';
  end if;

  update public."Product" set short_description = 'Schema test: legacy admin' where id = target_id;
  select website_description into website_value from public."Product" where id = target_id;
  if website_value is distinct from 'Schema test: legacy admin' then
    raise exception 'Legacy admin does not update new description';
  end if;

  update public."Product" set website_description = null where id = target_id;
  if exists(select 1 from public."Product" where id = target_id and short_description is not null) then
    raise exception 'Clearing new description does not clear legacy description';
  end if;

  begin
    update public."Product" set website_description = 'one', short_description = 'two' where id = target_id;
    raise exception 'Conflicting descriptions were accepted';
  exception when check_violation then null;
  end;

  begin
    update public."Product" set slug = 'Groundnut-Oil' where id = target_id;
    raise exception 'Uppercase slug was accepted';
  exception when check_violation then null;
  end;

  begin
    update public."Product" set slug = 'https://madikartaila.com/products/groundnut-oil' where id = target_id;
    raise exception 'Full URL was accepted as a slug';
  exception when check_violation then null;
  end;

  begin
    update public."Product" set slug = original_slug where id = 1;
    raise exception 'Duplicate slug was accepted';
  exception when unique_violation then null;
  end;

  -- A future Meta sync can insert a product before a website slug is assigned.
  -- Explicit fixture ID avoids consuming the production identity sequence.
  insert into public."Product" (id, retailer_id, catalog_id, name, short_description)
  values (-20260930, '__schema_test__', '__schema_test__', 'Schema test', 'Legacy insert');
  if not exists(select 1 from public."Product" where id = -20260930
      and slug is null and website_description = 'Legacy insert') then
    raise exception 'Legacy/Meta-compatible insertion failed';
  end if;

  update public."Product" set name = 'Schema test renamed' where id = target_id;
  if (select slug from public."Product" where id = target_id) is distinct from original_slug then
    raise exception 'A product name update changed its stable slug';
  end if;

  if has_table_privilege('anon', 'public."Product"', 'SELECT')
     or has_table_privilege('authenticated', 'public."Product"', 'SELECT') then
    raise exception 'Product became readable to public client roles';
  end if;
  if not has_function_privilege('service_role', 'public.sync_product_website_description()', 'EXECUTE') then
    raise exception 'Service role lacks trigger function permission';
  end if;
end;
$test$;
rollback;
select 'Product content compatibility checks passed; fixture writes rolled back' as result;

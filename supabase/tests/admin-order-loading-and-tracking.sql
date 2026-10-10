-- No external calls. Fixture rows and status edits are rolled back.
begin;
set local statement_timeout='15s';
set local role service_role;
do $$
declare
  result jsonb;
  expected jsonb;
  channel text;
  base public.orders%rowtype;
  fixture_id bigint;
begin
  foreach channel in array array['all','store','whatsapp'] loop
    result := public.store_admin_orders_page(0,channel);
    select coalesce(jsonb_agg(id order by created_at desc,id desc),'[]'::jsonb) into expected
    from (select id,created_at from public.orders where channel='all' or source=channel
      order by created_at desc,id desc limit 20) p;
    if (select coalesce(jsonb_agg((o->>'id')::bigint),'[]'::jsonb)
      from jsonb_array_elements(result->'orders') o) <> expected then raise exception 'Order page differs'; end if;
    if (result->>'hasMore')::boolean <> (select count(*)>20 from public.orders where channel='all' or source=channel) then
      raise exception 'Next-page flag differs';
    end if;
    if exists(select 1 from jsonb_array_elements(result->'orders') o where
      jsonb_array_length(o->'items') <> (select count(*) from public.order_items where order_id=(o->>'id')::bigint)
      or jsonb_array_length(o->'payments') <> (select count(*) from public.payments where order_id=(o->>'id')::bigint)) then
      raise exception 'Related order records differ';
    end if;
  end loop;
  if jsonb_array_length(public.store_admin_orders_page(1000,'all')->'orders')<>0 then raise exception 'Empty page differs'; end if;
  select * into base from public.orders where status='processing' limit 1;
  if base.id is null then raise exception 'A processing order is required for fixture verification'; end if;
  insert into public.orders(reference_id,profile_id,whatsapp_user_id,catalog_id,status,currency,subtotal,shipping,discount,total,source)
    values('ADMIN-FIXTURE-'||gen_random_uuid(),base.profile_id,base.whatsapp_user_id,base.catalog_id,
      'processing',base.currency,base.subtotal,base.shipping,base.discount,base.total,'store') returning id into fixture_id;
  begin
    update public.orders set fulfillment_status='shipped' where id=fixture_id;
    raise exception 'Shipping without tracking accepted';
  exception when check_violation then null;
  end;
  begin
    update public.orders set fulfillment_status='shipped',tracking_id='   ' where id=fixture_id;
    raise exception 'Blank tracking accepted';
  exception when check_violation then null;
  end;
  update public.orders set fulfillment_status='shipped',tracking_id='TRACK-123' where id=fixture_id;
  if not exists(select 1 from public.orders where id=fixture_id and status='processing'
    and fulfillment_status='shipped' and tracking_id='TRACK-123') then raise exception 'Shipment save differs'; end if;
  update public.orders set fulfillment_status='completed' where id=fixture_id;
  if not exists(select 1 from public.orders where id=fixture_id and tracking_id='TRACK-123') then raise exception 'Tracking lost'; end if;
  if has_function_privilege('anon','public.store_admin_orders_page(integer,text)','EXECUTE')
    or has_function_privilege('authenticated','public.store_admin_orders_page(integer,text)','EXECUTE') then
    raise exception 'Admin page is publicly executable';
  end if;
end;
$$;
rollback;
select 'PASS: pages, source filters, related records, tracking requirements, preserved payment state and private access; fixtures rolled back' as verification;

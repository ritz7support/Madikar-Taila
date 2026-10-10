-- Rollback-only shipment fixture. No external calls or customer messages.
begin;
set local role service_role;
do $$
declare base public.orders%rowtype; fixture bigint; result jsonb;
begin
  select * into base from public.orders limit 1;
  if base.id is null then raise exception 'An existing order is required for fixture verification'; end if;
  insert into public.orders(reference_id,profile_id,whatsapp_user_id,catalog_id,status,currency,subtotal,shipping,discount,total,source)
    values('DELIVERY-FIXTURE-'||gen_random_uuid(),base.profile_id,base.whatsapp_user_id,base.catalog_id,
      'processing',base.currency,base.subtotal,base.shipping,base.discount,base.total,'store') returning id into fixture;
  begin
    update public.orders set estimated_delivery_days=0 where id=fixture;
    raise exception 'Zero-day estimate accepted';
  exception when check_violation then null;
  end;
  begin
    update public.orders set estimated_delivery_days=-1 where id=fixture;
    raise exception 'Negative estimate accepted';
  exception when check_violation then null;
  end;
  update public.orders set fulfillment_status='shipped',tracking_id='TRACK-123',estimated_delivery_days=5 where id=fixture;
  result := public.store_admin_orders_page(0,'store');
  if not exists(select 1 from jsonb_array_elements(result->'orders') o where (o->>'id')::bigint=fixture
    and (o->>'estimated_delivery_days')::integer=5 and o->>'tracking_id'='TRACK-123' and o->>'status'='processing') then
    raise exception 'Saved shipment estimate is not returned';
  end if;
  update public.orders set fulfillment_status='completed' where id=fixture;
  if not exists(select 1 from public.orders where id=fixture and estimated_delivery_days=5) then raise exception 'Estimate lost'; end if;
  update public.orders set estimated_delivery_days=null where id=fixture;
end;
$$;
rollback;
select 'PASS: positive estimate round-trip, invalid values rejected, unknown allowed and payment state preserved; fixture rolled back' as verification;

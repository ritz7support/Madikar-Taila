-- Rollback-only fixtures; no network calls, no payment or customer messages.
begin;
set local statement_timeout='15s';
set local role service_role;
do $$
declare base public.orders%rowtype; fixture bigint; job record; page jsonb;
begin
  select * into base from public.orders limit 1;
  if base.id is null then raise exception 'Verification requires an existing order'; end if;
  insert into public.orders(reference_id,profile_id,whatsapp_user_id,catalog_id,status,currency,subtotal,shipping,discount,total,source)
    values('SHIPMENT-FIXTURE-'||gen_random_uuid(),base.profile_id,'919000000001',base.catalog_id,
      'pending_payment',base.currency,base.subtotal,base.shipping,base.discount,base.total,'whatsapp') returning id into fixture;
  update public.orders set status='processing' where id=fixture;
  if exists(select 1 from public.store_shipment_notifications where order_id=fixture) then raise exception 'Bot payment state queued shipment'; end if;
  update public.orders set fulfillment_status='shipped',tracking_id='TRACK-123' where id=fixture;
  if exists(select 1 from public.store_shipment_notifications where order_id=fixture) then raise exception 'Missing days queued invalid message'; end if;
  update public.orders set estimated_delivery_days=5 where id=fixture;
  if not exists(select 1 from public.store_shipment_notifications where order_id=fixture and phone='919000000001' and delivery_days=5) then
    raise exception 'Shipment was not queued for the buyer'; end if;
  select * into job from public.store_claim_shipment_notifications(fixture);
  if job.order_id is null then raise exception 'Shipment was not claimed'; end if;
  if exists(select 1 from public.store_claim_shipment_notifications(fixture)) then raise exception 'Duplicate claim'; end if;
  perform public.store_finish_shipment_notification(fixture,job.lease_token,'failed',null,132001,'Template not approved');
  if exists(select 1 from public.store_claim_shipment_notifications(fixture)) then raise exception 'Approval rejection automatically retried'; end if;
  perform public.store_retry_shipment_notification(fixture);
  select * into job from public.store_claim_shipment_notifications(fixture);
  perform public.store_finish_shipment_notification(fixture,job.lease_token,'sent','wamid.fixture');
  update public.orders set fulfillment_status='processing' where id=fixture;
  update public.orders set fulfillment_status='shipped',tracking_id='TRACK-456',estimated_delivery_days=6 where id=fixture;
  if exists(select 1 from public.store_claim_shipment_notifications(fixture)) then raise exception 'Accepted shipment resent'; end if;
  begin
    perform public.store_retry_shipment_notification(fixture);
    raise exception 'Accepted shipment manually retried';
  exception when raise_exception then
    if sqlerrm <> 'Notification cannot be retried safely or retry limit reached' then raise; end if;
  end;
  if not exists(select 1 from public.orders where id=fixture and status='processing') then raise exception 'Bot/payment state changed'; end if;
  page:=public.store_admin_orders_page(0,'whatsapp');
  if not exists(select 1 from jsonb_array_elements(page->'orders') o where (o->>'id')::bigint=fixture and o->'shipment_notification'->>'status'='sent') then
    raise exception 'Admin notification state missing'; end if;
  -- Website fixture: queued work is cancelled before send when staff cancels order.
  insert into public.orders(reference_id,profile_id,whatsapp_user_id,catalog_id,status,currency,subtotal,shipping,discount,total,source)
    values('SHIPMENT-FIXTURE-'||gen_random_uuid(),base.profile_id,'919000000002',base.catalog_id,
      'processing',base.currency,base.subtotal,base.shipping,base.discount,base.total,'store') returning id into fixture;
  update public.orders set fulfillment_status='shipped',tracking_id='TRACK-789',estimated_delivery_days=4 where id=fixture;
  update public.orders set fulfillment_status='cancelled' where id=fixture;
  if exists(select 1 from public.store_claim_shipment_notifications(fixture)) then raise exception 'Cancelled shipment sent'; end if;
  if not exists(select 1 from public.store_shipment_notifications where order_id=fixture and status='cancelled') then raise exception 'Cancellation missing'; end if;
  -- An expired sending lease is uncertain and can never be blindly retried.
  update public.orders set fulfillment_status='shipped' where id=fixture;
  perform public.store_retry_shipment_notification(fixture);
  select * into job from public.store_claim_shipment_notifications(fixture);
  update public.store_shipment_notifications set lease_until=now()-interval '1 minute' where order_id=fixture;
  if exists(select 1 from public.store_claim_shipment_notifications(fixture)) then raise exception 'Expired lease resent'; end if;
  if not exists(select 1 from public.store_shipment_notifications where order_id=fixture and status='uncertain') then raise exception 'Expired lease not held'; end if;
  if has_table_privilege('anon','public.store_shipment_notifications','SELECT') or has_table_privilege('authenticated','public.store_shipment_notifications','SELECT')
    or has_function_privilege('anon','public.store_claim_shipment_notifications(bigint)','EXECUTE')
    or has_function_privilege('authenticated','public.store_retry_shipment_notification(bigint)','EXECUTE') then raise exception 'Notification access exposed'; end if;
end;
$$;
rollback;
select 'PASS: both order sources, buyer mapping, atomic queue, duplicate/lease/approval safeguards, cancellation, payment preservation and private access; fixtures rolled back' as verification;

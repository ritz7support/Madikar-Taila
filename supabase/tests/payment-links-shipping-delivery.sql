-- Rollback-only fixtures. No provider calls, charges or messages.
begin;
set local statement_timeout='20s';
set local role service_role;
do $$
declare profile uuid; sid uuid; checkout_mode text; link_id text; provider_order text; provider_payment text; ref text;
  saved jsonb; replay jsonb; fixture bigint; job record; result jsonb; base public.orders%rowtype;
begin
  select id into profile from public."Profile" limit 1;
  select * into base from public.orders limit 1;
  foreach checkout_mode in array array['test','live'] loop
    sid:=gen_random_uuid();ref:='WEB'||replace(sid::text,'-','');link_id:='plink_'||replace(sid::text,'-','');
    provider_order:='order_'||replace(sid::text,'-','');provider_payment:='pay_'||replace(sid::text,'-','');
    insert into public.store_checkout_sessions(id,token_hash,request_hash,mode,profile_id,phone,customer,items,catalog_id,
      subtotal_paise,shipping_paise,total_paise,payment_method,provider_payment_link_id,provider_payment_link_reference_id,provider_payment_link_url,status,shipping_quote)
    values(sid,repeat('a',64),repeat('b',64),checkout_mode,profile,'919000000001',
      '{"name":"Rollback fixture","line1":"Fixture street","line2":"","city":"Dharwad","state":"Karnataka","postalCode":"580001"}',
      '[{"retailerId":"fixture-pack","name":"Fixture 500 ml","quantity":2,"unitPaise":17500,"weightGrams":500}]','fixture',
      35000,4000,39000,'payment_link',link_id,ref,'https://rzp.io/i/fixture','ready',
      '{"policy":"courier-2026-10-17","productGrams":1000,"packagingGrams":100,"packedGrams":1100,"billedKg":1,"shippingPaise":4000}');
    begin
      perform public.store_finalize_link_checkout(sid,'plink_wrong',ref,provider_order,provider_payment,39000,'INR','upi',now());
      raise exception 'Wrong link accepted';
    exception when raise_exception then if sqlerrm<>'Payment link does not match checkout' then raise;end if;end;
    begin
      perform public.store_finalize_link_checkout(sid,link_id,ref,provider_order,provider_payment,1,'INR','upi',now());
      raise exception 'Wrong amount accepted';
    exception when raise_exception then if sqlerrm<>'Payment link does not match checkout' then raise;end if;end;
    saved:=public.store_finalize_link_checkout(sid,link_id,ref,provider_order,provider_payment,39000,'INR','upi',now());
    replay:=public.store_finalize_link_checkout(sid,link_id,ref,provider_order,provider_payment,39000,'INR','upi',now());
    if replay->>'reference'<>saved->>'reference' or (replay->>'duplicate')::boolean is not true then raise exception 'Duplicate finalization';end if;
    if not exists(select 1 from public.orders o join public.payments p on p.order_id=o.id where o.id=(saved->>'orderId')::bigint
      and o.source='store' and o.status='processing' and o.handoff_sent_at is null
      and o.total=390 and o.shipping=40 and o.subtotal=350 and o.shipping_quote->>'packedGrams'='1100'
      and p.provider_payment_link_id=link_id and p.provider_order_id=provider_order and p.amount=390 and p.payment_method='upi') then raise exception 'Paid amount or identity mismatch';end if;
    if (select count(*) from public.order_items where order_id=(saved->>'orderId')::bigint)<>1 then raise exception 'Duplicate items';end if;
    if (select count(*) from public.store_payment_confirmations where session_id=sid)<>1 then raise exception 'Confirmation missing or duplicated';end if;
    if exists(select 1 from public.store_claim_checkout_work(sid)) then raise exception 'Paid checkout still claimed for n8n';end if;
    begin
      perform public.store_finalize_link_checkout(sid,link_id,ref,provider_order,'pay_other',39000,'INR','upi',now());
      raise exception 'Second payment accepted';
    exception when raise_exception then if sqlerrm<>'Checkout already paid' then raise;end if;end;
  end loop;
  result:=public.create_order_with_shipping('FIXTURE-'||gen_random_uuid(),profile,'919000000002','fixture','wamid.'||gen_random_uuid(),
    'INR',350,40,0,390,'[{"product_retailer_id":"fixture-pack","product_name":"Fixture","quantity":2,"unit_price":175,"currency":"INR"}]',
    '{"policy":"courier-2026-10-17","shippingPaise":4000,"packedGrams":1100}');
  fixture:=(result->'order'->>'id')::bigint;
  if (result->'order'->>'shipping')::numeric<>40 or result->'order'->'shipping_quote'->>'packedGrams'<>'1100' then raise exception 'Bot shipping snapshot missing';end if;
  update public.orders set status='processing' where id=fixture;
  -- A direct Delivered transition must queue too, even when Shipped was skipped.
  perform public.store_update_fulfillment(fixture,'processing','completed');
  if not exists(select 1 from public.store_delivery_notifications where order_id=fixture and status='pending') then raise exception 'Direct delivery message missing';end if;
  -- Model a historical delivered fixture with no outbox row. The admin action
  -- creates one explicitly, without changing the historical order itself.
  delete from public.store_delivery_notifications where order_id=fixture;
  perform public.store_retry_delivery_notification(fixture);
  if not exists(select 1 from public.store_delivery_notifications where order_id=fixture and status='pending') then raise exception 'Explicit delivery message missing';end if;
  begin perform public.store_retry_delivery_notification(fixture);raise exception 'Duplicate explicit send';
  exception when raise_exception then if sqlerrm<>'Notification cannot be retried safely or retry limit reached' then raise;end if;end;
  perform public.store_update_fulfillment(fixture,'completed','processing');
  result:=public.store_update_fulfillment(fixture,'processing','shipped','TRACK-FIXTURE',5,true);
  if result->'shipmentNotification'->>'status'<>'pending' then raise exception 'Atomic shipment queue state missing';end if;
  result:=public.store_update_fulfillment(fixture,'shipped','completed');
  if result->'deliveryNotification'->>'status'<>'pending' then raise exception 'Atomic delivery queue state missing';end if;
  if not exists(select 1 from public.store_delivery_notifications n join public.orders o on o.id=n.order_id where n.order_id=fixture and n.phone=o.whatsapp_user_id and n.reference_id=o.reference_id) then raise exception 'Wrong buyer/reference';end if;
  perform public.store_update_fulfillment(fixture,'completed','completed');
  select * into job from public.store_claim_delivery_notifications(fixture);
  if job.order_id is null then raise exception 'Delivery not claimed';end if;
  if exists(select 1 from public.store_claim_delivery_notifications(fixture)) then raise exception 'Duplicate delivery claim';end if;
  perform public.store_finish_delivery_notification(fixture,job.lease_token,'sent','wamid.fixture');
  perform public.store_update_fulfillment(fixture,'completed','shipped','TRACK-FIXTURE',5,true);
  perform public.store_update_fulfillment(fixture,'shipped','completed');
  if exists(select 1 from public.store_claim_delivery_notifications(fixture)) then raise exception 'Accepted delivery resent';end if;
  begin perform public.store_retry_delivery_notification(fixture);raise exception 'Unsafe retry';
  exception when raise_exception then if sqlerrm<>'Notification cannot be retried safely or retry limit reached' then raise;end if;end;
  if not exists(select 1 from public.orders where id=fixture and status='processing' and shipping=40 and total=390) then raise exception 'Payment state changed by fulfillment';end if;
  if has_table_privilege('anon','public.store_delivery_notifications','SELECT')
    or has_function_privilege('authenticated','public.store_update_fulfillment(bigint,text,text,text,integer,boolean)','EXECUTE')
    or has_function_privilege('anon','public.store_finalize_link_checkout(uuid,text,text,text,text,integer,text,text,timestamptz)','EXECUTE')
    or has_function_privilege('anon','public.create_order_with_shipping(text,uuid,text,text,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb)','EXECUTE') then raise exception 'Private routines exposed';end if;
end;
$$;
rollback;
select 'PASS: payment identities and amounts, both modes, idempotency, shipping snapshots, exact delivery transition, buyer/reference, queue leases and private access. Fixtures rolled back.' as verification;

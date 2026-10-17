-- Isolated admin delivery messages. No historical backfill or bot/payment changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
create table public.store_delivery_notifications (
  order_id bigint primary key references public.orders(id) on delete cascade,
  phone text not null check(phone ~ '^[0-9]{7,15}$'),
  reference_id text not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain','cancelled')),
  attempts integer not null default 0 check(attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  message_id text,
  accepted_at timestamptz,
  error_code integer,
  last_error text,
  created_at timestamptz not null default now()
);
create index store_delivery_notifications_due_idx on public.store_delivery_notifications(next_attempt_at) where status='pending';
alter table public.store_delivery_notifications enable row level security;
revoke all on public.store_delivery_notifications from public,anon,authenticated;
grant select,insert,update,delete on public.store_delivery_notifications to service_role;

create function public.store_queue_delivery_notification()
returns trigger language plpgsql security invoker set search_path='' as $$
declare buyer_phone text := regexp_replace(new.whatsapp_user_id,'^\+','');
begin
  if new.fulfillment_status='completed' and new.status<>'pending_payment'
    and buyer_phone ~ '^[0-9]{7,15}$' then
    insert into public.store_delivery_notifications(order_id,phone,reference_id)
      values(new.id,buyer_phone,new.reference_id)
      on conflict(order_id) do update set phone=excluded.phone,reference_id=excluded.reference_id
      where store_delivery_notifications.status='pending' and store_delivery_notifications.attempts=0;
  end if;
  return new;
end;
$$;
create trigger store_queue_delivery_notification
after update of fulfillment_status on public.orders
for each row when(old.fulfillment_status='shipped' and new.fulfillment_status='completed') execute function public.store_queue_delivery_notification();

create function public.store_claim_delivery_notifications(p_order_id bigint default null)
returns table(order_id bigint,phone text,reference_id text,lease_token uuid,attempts integer)
language plpgsql security invoker set search_path='' as $$
begin
  update public.store_delivery_notifications n set status='uncertain',last_error='Worker lease expired; check Meta before retrying.'
    where n.status='sending' and n.lease_until<now() and (p_order_id is null or n.order_id=p_order_id);
  update public.store_delivery_notifications n set status='cancelled',last_error='Order is no longer delivered.'
    where n.status='pending' and (p_order_id is null or n.order_id=p_order_id)
      and not exists(select 1 from public.orders o where o.id=n.order_id and o.fulfillment_status='completed' and o.status<>'pending_payment');
  return query with claimed as (
    update public.store_delivery_notifications n
    set status='sending',attempts=n.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    where n.order_id in (
      select q.order_id from public.store_delivery_notifications q
      join public.orders o on o.id=q.order_id
      where q.status='pending' and q.next_attempt_at<=now() and q.attempts<8
        and o.fulfillment_status='completed' and o.status<>'pending_payment'
        and (p_order_id is null or q.order_id=p_order_id)
      order by q.next_attempt_at,q.order_id limit 5 for update of q skip locked
    ) returning n.order_id,n.phone,n.reference_id,n.lease_token,n.attempts
  ) select * from claimed;
end;
$$;

create function public.store_finish_delivery_notification(p_order_id bigint,p_lease_token uuid,p_status text,
  p_message_id text default null,p_error_code integer default null,p_error text default null)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_status is null or p_status not in ('sent','pending','failed','uncertain') then raise exception 'Invalid notification status'; end if;
  if p_status='sent' and (p_message_id is null or p_message_id not like 'wamid.%') then raise exception 'Message ID required'; end if;
  update public.store_delivery_notifications n set
    status=case when p_status='pending' and n.attempts>=8 then 'failed' else p_status end,
    message_id=case when p_status='sent' then p_message_id else n.message_id end,
    accepted_at=case when p_status='sent' then now() else n.accepted_at end,
    error_code=case when p_status='sent' then null else p_error_code end,
    last_error=case when p_status='sent' then null else left(p_error,250) end,
    next_attempt_at=now()+interval '5 minutes'*least(n.attempts,6),lease_until=null
  where n.order_id=p_order_id and n.lease_token=p_lease_token and n.status in ('sending','uncertain');
  if not found then raise exception 'Notification lease not found'; end if;
end;
$$;

create function public.store_retry_delivery_notification(p_order_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.fulfillment_status<>'completed' or o.status='pending_payment' then
    raise exception 'Order must be delivered';
  end if;
  update public.store_delivery_notifications n set status='pending',next_attempt_at=now(),error_code=null,last_error=null,
    reference_id=o.reference_id,phone=regexp_replace(o.whatsapp_user_id,'^\+','')
    where n.order_id=p_order_id and n.status in ('failed','cancelled') and n.attempts<8 and n.message_id is null;
  if not found then raise exception 'Notification cannot be retried safely or retry limit reached'; end if;
end;
$$;

revoke all on function public.store_queue_delivery_notification() from public,anon,authenticated;
revoke all on function public.store_claim_delivery_notifications(bigint) from public,anon,authenticated;
revoke all on function public.store_finish_delivery_notification(bigint,uuid,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.store_retry_delivery_notification(bigint) from public,anon,authenticated;
grant execute on function public.store_queue_delivery_notification() to service_role;
grant execute on function public.store_claim_delivery_notifications(bigint) to service_role;
grant execute on function public.store_finish_delivery_notification(bigint,uuid,text,text,integer,text) to service_role;
grant execute on function public.store_retry_delivery_notification(bigint) to service_role;

-- Separate recovery job; the existing payment and bot jobs are unchanged.
select cron.schedule('store-delivery-recovery','*/5 * * * *',$job$
  select net.http_post(
    url := 'https://faoomjgkofqrdajaftjd.supabase.co/functions/v1/madikar-store/delivery-recovery',
    headers := jsonb_build_object('Content-Type','application/json','x-checkout-recovery',recovery_token),
    body := '{}'::jsonb,timeout_milliseconds := 60000
  ) from public.store_checkout_settings where id=true and exists(
    select 1 from public.store_delivery_notifications where
      (status='pending' and next_attempt_at<=now() and attempts<8) or (status='sending' and lease_until<now())
  );
$job$);
CREATE OR REPLACE FUNCTION public.store_admin_orders_page(p_page integer, p_source text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if p_page is null or p_page < 0 or p_page > 1000
    or p_source is null or p_source not in ('all','store','whatsapp') then
    raise exception 'Invalid orders page';
  end if;
  with fetched as materialized (
    select id,reference_id,source,status,fulfillment_status,tracking_id,estimated_delivery_days,created_at,
      total,subtotal,shipping,currency,whatsapp_user_id,profile_id,address_id
    from public.orders
    where p_source='all' or source=p_source
    order by created_at desc,id desc limit 21 offset p_page*20
  ), page as materialized (
    select * from fetched order by created_at desc,id desc limit 20
  )
  select jsonb_build_object('orders',coalesce((
    select jsonb_agg(to_jsonb(o) || jsonb_build_object(
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'order_id',i.order_id,'product_name',i.product_name,'product_retailer_id',i.product_retailer_id,
        'quantity',i.quantity,'unit_price',i.unit_price) order by i.id)
        from public.order_items i where i.order_id=o.id),'[]'::jsonb),
      'payments',coalesce((select jsonb_agg(jsonb_build_object(
        'order_id',p.order_id,'status',p.status,'provider_payment_id',p.provider_payment_id,'amount',p.amount)
        order by p.created_at desc,p.id desc) from public.payments p where p.order_id=o.id),'[]'::jsonb),
      'shipment_notification',(select jsonb_build_object('status',n.status,'error_code',n.error_code,'attempts',n.attempts,'accepted_at',n.accepted_at) from public.store_shipment_notifications n where n.order_id=o.id),
      'delivery_notification',(select jsonb_build_object('status',n.status,'error_code',n.error_code,'attempts',n.attempts,'accepted_at',n.accepted_at) from public.store_delivery_notifications n where n.order_id=o.id),
      'profile',(select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'whatsAppUserId',p."whatsAppUserId")
        from public."Profile" p where p.id=o.profile_id),
      'address',(select jsonb_build_object('id',a.id,'recipient_name',a.recipient_name,'phone',a.phone,
        'address_line_1',a.address_line_1,'address_line_2',a.address_line_2,'city',a.city,'state',a.state,
        'pincode',a.pincode,'country',a.country) from public.addresses a where a.id=o.address_id)
    ) order by o.created_at desc,o.id desc) from page o
  ),'[]'::jsonb),'hasMore',(select count(*)>20 from fetched),'page',p_page) into result;
  return result;
end;
$function$;


-- Save once and return both notification states in the same database request.
create function public.store_update_fulfillment(p_order_id bigint,p_previous text,p_stage text,
  p_tracking_id text default null,p_delivery_days integer default null,p_set_delivery_days boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;
begin
  if p_stage is null or p_previous is null or p_stage not in ('processing','shipped','completed','cancelled')
    or p_previous not in ('processing','shipped','completed','cancelled') then raise exception 'Invalid order stage'; end if;
  if p_stage='shipped' and (p_tracking_id is null or length(trim(p_tracking_id)) not between 1 and 120 or p_tracking_id ~ '[[:cntrl:]]') then raise exception 'Tracking ID required'; end if;
  if p_set_delivery_days and p_delivery_days is not null and p_delivery_days<1 then raise exception 'Invalid delivery estimate'; end if;
  update public.orders set fulfillment_status=p_stage,
    tracking_id=case when p_stage='shipped' then trim(p_tracking_id) else tracking_id end,
    estimated_delivery_days=case when p_stage='shipped' and p_set_delivery_days then p_delivery_days else estimated_delivery_days end
    where id=p_order_id and fulfillment_status=p_previous and status<>'pending_payment' returning * into o;
  if not found then raise exception 'Order changed or is awaiting payment'; end if;
  return jsonb_build_object('id',o.id,'fulfillmentStatus',o.fulfillment_status,'trackingId',o.tracking_id,
    'estimatedDeliveryDays',o.estimated_delivery_days,
    'shipmentNotification',(select jsonb_build_object('status',n.status,'attempts',n.attempts,'error_code',n.error_code,'accepted_at',n.accepted_at) from public.store_shipment_notifications n where n.order_id=o.id),
    'deliveryNotification',(select jsonb_build_object('status',n.status,'attempts',n.attempts,'error_code',n.error_code,'accepted_at',n.accepted_at) from public.store_delivery_notifications n where n.order_id=o.id));
end;
$$;
revoke all on function public.store_update_fulfillment(bigint,text,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.store_update_fulfillment(bigint,text,text,text,integer,boolean) to service_role;
commit;

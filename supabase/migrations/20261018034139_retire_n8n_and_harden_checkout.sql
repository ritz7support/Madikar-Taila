-- Retire external fulfilment; preserve historical orders, payments and handoff markers.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
alter table public.store_checkout_sessions add column payment_resolution text
  check(payment_resolution in ('creation_rejected','expired','cancelled'));
comment on column public.store_checkout_sessions.payment_resolution is
  'Stops automatic checks after definitive rejection or confirmed unpaid expiry/cancellation. Payment verification can still reconcile late captured events.';
-- Weight shipping is the active policy. Missing policy must never restore free shipping.
update public.store_checkout_settings set shipping_paise=null
  where id=true and shipping_policy='courier-2026-10-17';
select cron.alter_job(jobid,active:=false) from cron.job where jobname='retry-order-handoffs';

CREATE OR REPLACE FUNCTION public.store_finalize_checkout(p_session_id uuid, p_provider_order_id text, p_payment_id text, p_amount_paise integer, p_currency text, p_method text, p_paid_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  s public.store_checkout_sessions%rowtype;
  v_address uuid;
  v_order bigint;
  v_payment bigint;
  v_reference text;
  v_item jsonb;
begin
  select * into s from public.store_checkout_sessions where id=p_session_id for update;
  if not found or s.provider_order_id is distinct from p_provider_order_id then
    raise exception 'Checkout session not found';
  end if;
  if p_payment_id is null or p_payment_id !~ '^pay_[A-Za-z0-9]+$'
    or p_amount_paise is distinct from s.total_paise or p_currency is distinct from 'INR'
    or p_paid_at is null then raise exception 'Payment does not match checkout'; end if;
  if s.status='paid' then
    if s.provider_payment_id is distinct from p_payment_id then raise exception 'Checkout already paid'; end if;
    select reference_id into v_reference from public.orders where id=s.order_id;
    return jsonb_build_object('status','paid','reference',v_reference,'orderId',s.order_id,'paymentId',s.payment_id,'duplicate',true);
  end if;
  if s.status<>'ready' then raise exception 'Checkout is not ready'; end if;
  -- A separate, inactive address is used only by this order. Guest input cannot
  -- replace the customer's bot profile, default address or saved address list.
  insert into public.addresses(profile_id,label,recipient_name,phone,address_line_1,address_line_2,
    locality,city,state,pincode,country,is_default,is_active,source)
  values(s.profile_id,'Website checkout',s.customer->>'name',s.phone,s.customer->>'line1',
    nullif(s.customer->>'line2',''),null,s.customer->>'city',s.customer->>'state',
    s.customer->>'postalCode','India',false,false,'website_checkout') returning id into v_address;
  v_reference := 'ORD-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
    || '-' || upper(substr(gen_random_uuid()::text,1,6));
  -- Orders are ready for the Supabase admin immediately after verified payment.
  insert into public.orders(reference_id,profile_id,whatsapp_user_id,catalog_id,status,currency,
    subtotal,shipping,discount,total,address_id,source)
  values(v_reference,s.profile_id,s.phone,s.catalog_id,'processing','INR',
    s.subtotal_paise::numeric/100,s.shipping_paise::numeric/100,0,s.total_paise::numeric/100,v_address,'store')
  returning id into v_order;
  for v_item in select value from jsonb_array_elements(s.items) loop
    insert into public.order_items(order_id,product_retailer_id,product_name,quantity,unit_price,currency)
    values(v_order,v_item->>'retailerId',v_item->>'name',(v_item->>'quantity')::integer,
      (v_item->>'unitPaise')::numeric/100,'INR');
  end loop;
  insert into public.payments(order_id,provider,provider_order_id,provider_payment_id,amount,currency,status,payment_method,paid_at)
  values(v_order,'razorpay',p_provider_order_id,p_payment_id,s.total_paise::numeric/100,'INR','paid',p_method,p_paid_at)
  returning id into v_payment;
  update public.store_checkout_sessions set status='paid',provider_payment_id=p_payment_id,
    order_id=v_order,payment_id=v_payment,paid_at=p_paid_at,next_check_at=now(),work_attempts=0,last_error=null where id=s.id;
  return jsonb_build_object('status','paid','reference',v_reference,'orderId',v_order,'paymentId',v_payment,'duplicate',false);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.store_claim_checkout_work(p_session_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF store_checkout_sessions
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  update public.store_checkout_sessions s set next_check_at=now()+interval '5 minutes',work_attempts=work_attempts+1
  where s.id in (
    select q.id from public.store_checkout_sessions q
    where (p_session_id is null or q.id=p_session_id) and q.next_check_at<=now()
      and (q.status='ready' or (q.status='preparing' and q.payment_method='payment_link'))
      and q.payment_resolution is null and q.work_attempts<288
    order by q.next_check_at limit 5 for update skip locked
  ) returning s.*;
$function$
;
-- Keep the legacy RPC name for explicit errors, without falsifying handoff history.
create or replace function public.store_complete_handoff(p_session_id uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  raise exception 'External fulfilment handoff is retired; use the admin Orders panel';
end;
$$;

select cron.schedule('store-checkout-recovery','*/5 * * * *',$job$
  select net.http_post(
    url:='https://faoomjgkofqrdajaftjd.supabase.co/functions/v1/madikar-store/checkout-recovery',
    headers:=jsonb_build_object('Content-Type','application/json','x-checkout-recovery',recovery_token),body:='{}'::jsonb,timeout_milliseconds:=60000
  ) from public.store_checkout_settings where id=true and exists(
    select 1 from public.store_checkout_sessions where next_check_at<=now() and work_attempts<288
      and payment_resolution is null and (status='ready' or (status='preparing' and payment_method='payment_link')));
$job$);
commit;

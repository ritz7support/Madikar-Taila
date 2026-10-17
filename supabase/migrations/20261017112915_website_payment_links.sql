-- Additive payment-link and shipping snapshots. Existing sessions stay on Orders.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
alter table public.store_checkout_settings
  add column payment_method text not null default 'order' check(payment_method in ('order','payment_link')),
  add column shipping_policy text check(shipping_policy='courier-2026-10-17');
alter table public.store_checkout_sessions
  add column payment_method text not null default 'order' check(payment_method in ('order','payment_link')),
  add column provider_payment_link_id text unique check(provider_payment_link_id ~ '^plink_[A-Za-z0-9]+$'),
  add column provider_payment_link_reference_id text unique,
  add column provider_payment_link_url text,
  add column shipping_quote jsonb;
alter table public.orders add column shipping_quote jsonb;
comment on column public.orders.shipping_quote is 'Immutable quote for new orders: variant weights, courier boxes, packed grams and charged kilograms. NULL for existing orders.';

create function public.store_finalize_link_checkout(p_session_id uuid,p_link_id text,p_reference_id text,
  p_provider_order_id text,p_payment_id text,p_amount_paise integer,p_currency text,p_method text,p_paid_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.store_checkout_sessions%rowtype; result jsonb;
begin
  select * into s from public.store_checkout_sessions where id=p_session_id for update;
  if not found or s.payment_method<>'payment_link' or s.provider_payment_link_id is distinct from p_link_id
    or s.provider_payment_link_reference_id is distinct from p_reference_id
    or p_provider_order_id is null or p_provider_order_id !~ '^order_[A-Za-z0-9]+$'
    or (s.provider_order_id is not null and s.provider_order_id<>p_provider_order_id)
    or p_amount_paise is distinct from s.total_paise or p_currency is distinct from 'INR' then
    raise exception 'Payment link does not match checkout';
  end if;
  update public.store_checkout_sessions set provider_order_id=p_provider_order_id where id=s.id;
  result:=public.store_finalize_checkout(p_session_id,p_provider_order_id,p_payment_id,p_amount_paise,p_currency,p_method,p_paid_at);
  if not (result->>'duplicate')::boolean then
    update public.orders set shipping_quote=s.shipping_quote where id=(result->>'orderId')::bigint and source='store';
    update public.payments set provider_payment_link_id=p_link_id,provider_payment_link_reference_id=p_reference_id,
      provider_payment_link_url=s.provider_payment_link_url,expires_at=s.expires_at where id=(result->>'paymentId')::bigint;
  end if;
  return result;
end;
$$;
revoke all on function public.store_finalize_link_checkout(uuid,text,text,text,text,integer,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.store_finalize_link_checkout(uuid,text,text,text,text,integer,text,text,timestamptz) to service_role;

-- Wrap the established atomic bot RPC without altering its semantics or grants.
create function public.create_order_with_shipping(p_reference_id text,p_profile_id uuid,p_whatsapp_user_id text,
  p_catalog_id text,p_whatsapp_message_id text,p_currency text,p_subtotal numeric,p_shipping numeric,
  p_discount numeric,p_total numeric,p_items jsonb,p_shipping_quote jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; saved public.orders%rowtype;
begin
  if p_shipping_quote is null or p_shipping_quote->>'policy' is distinct from 'courier-2026-10-17'
    or (p_shipping_quote->>'shippingPaise')::numeric is distinct from p_shipping*100
    or p_total is distinct from p_subtotal+p_shipping-p_discount then raise exception 'Invalid shipping quote'; end if;
  result:=public.create_order_with_items(p_reference_id,p_profile_id,p_whatsapp_user_id,p_catalog_id,p_whatsapp_message_id,
    p_currency,p_subtotal,p_shipping,p_discount,p_total,p_items);
  if not (result->>'duplicate')::boolean then
    update public.orders set shipping_quote=p_shipping_quote where id=(result->'order'->>'id')::bigint returning * into saved;
    result:=jsonb_set(result,'{order}',to_jsonb(saved));
  end if;
  return result;
end;
$$;
revoke all on function public.create_order_with_shipping(text,uuid,text,text,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_order_with_shipping(text,uuid,text,text,text,text,numeric,numeric,numeric,numeric,jsonb,jsonb) to service_role;

create or replace function public.store_claim_checkout_work(p_session_id uuid default null)
returns setof public.store_checkout_sessions language sql security invoker set search_path='' as $$
  update public.store_checkout_sessions s set next_check_at=now()+interval '5 minutes',work_attempts=work_attempts+1
  where s.id in (
    select q.id from public.store_checkout_sessions q
    where (p_session_id is null or q.id=p_session_id) and q.next_check_at<=now()
      and (q.status='ready' or (q.status='preparing' and q.payment_method='payment_link') or (q.status='paid' and q.handoff_sent_at is null))
      and q.work_attempts<288
    order by q.next_check_at limit 5 for update skip locked
  ) returning s.*;
$$;
select cron.schedule('store-checkout-recovery','*/5 * * * *',$job$
  select net.http_post(
    url:='https://faoomjgkofqrdajaftjd.supabase.co/functions/v1/madikar-store/checkout-recovery',
    headers:=jsonb_build_object('Content-Type','application/json','x-checkout-recovery',recovery_token),body:='{}'::jsonb,timeout_milliseconds:=60000
  ) from public.store_checkout_settings where id=true and exists(
    select 1 from public.store_checkout_sessions where next_check_at<=now() and work_attempts<288
      and (status='ready' or (status='preparing' and payment_method='payment_link') or (status='paid' and handoff_sent_at is null)));
$job$);
commit;

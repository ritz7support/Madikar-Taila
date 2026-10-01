-- Website checkout only. Existing bot functions, grants, jobs and defaults are preserved.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

alter table public.addresses
  add column source text not null default 'whatsapp'
  constraint addresses_source_check check (source in ('whatsapp','website_checkout'));
comment on column public.addresses.source is 'Origin of address creation; omitted by existing bot inserts and defaults to whatsapp.';

create table public.store_checkout_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  shipping_paise integer check (shipping_paise between 0 and 1000000),
  recovery_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','')
);
insert into public.store_checkout_settings (id,enabled,shipping_paise) values (true,false,null);

create table public.store_checkout_limits (
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.store_checkout_limits enable row level security;
revoke all on public.store_checkout_limits from public,anon,authenticated;
grant select,insert,update,delete on public.store_checkout_limits to service_role;

create function public.store_allow_checkout(p_client_hash text,p_phone_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare k text; n integer; allowed boolean := true;
begin
  if p_client_hash !~ '^[a-f0-9]{64}$' or p_phone_hash !~ '^[a-f0-9]{64}$'
    or p_client_hash is null or p_phone_hash is null then return false; end if;
  delete from public.store_checkout_limits where window_start < now()-interval '2 hours';
  foreach k in array array['client:'||p_client_hash,'phone:'||p_phone_hash] loop
    insert into public.store_checkout_limits(bucket,window_start,attempts) values(k,now(),1)
    on conflict(bucket) do update set
      attempts=case when store_checkout_limits.window_start<now()-interval '1 hour' then 1 else store_checkout_limits.attempts+1 end,
      window_start=case when store_checkout_limits.window_start<now()-interval '1 hour' then now() else store_checkout_limits.window_start end
    returning attempts into n;
    if n > 10 then allowed := false; end if;
  end loop;
  return allowed;
end;
$$;
revoke all on function public.store_allow_checkout(text,text) from public,anon,authenticated;
grant execute on function public.store_allow_checkout(text,text) to service_role;

create table public.store_checkout_sessions (
  id uuid primary key,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  mode text not null check (mode in ('test','live')),
  profile_id uuid not null references public."Profile"(id),
  phone text not null check (phone ~ '^91[6-9][0-9]{9}$'),
  customer jsonb not null,
  items jsonb not null check (jsonb_typeof(items)='array' and jsonb_array_length(items) between 1 and 16),
  catalog_id text not null,
  subtotal_paise integer not null check (subtotal_paise > 0),
  shipping_paise integer not null check (shipping_paise >= 0),
  total_paise integer not null check (total_paise = subtotal_paise + shipping_paise and total_paise <= 10000000),
  provider_order_id text unique,
  provider_payment_id text unique,
  status text not null default 'preparing' check (status in ('preparing','ready','paid')),
  order_id bigint unique references public.orders(id),
  payment_id bigint unique references public.payments(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 minutes',
  paid_at timestamptz,
  next_check_at timestamptz not null default now()+interval '5 minutes',
  work_attempts integer not null default 0,
  handoff_sent_at timestamptz,
  last_error text
);
create index store_checkout_sessions_profile_idx on public.store_checkout_sessions(profile_id);
create index store_checkout_sessions_due_idx on public.store_checkout_sessions(next_check_at) where status in ('ready','paid');

alter table public.store_checkout_settings enable row level security;
alter table public.store_checkout_sessions enable row level security;
revoke all on public.store_checkout_settings, public.store_checkout_sessions from public, anon, authenticated;
grant select,insert,update,delete on public.store_checkout_settings, public.store_checkout_sessions to service_role;

create function public.store_finalize_checkout(
  p_session_id uuid, p_provider_order_id text, p_payment_id text,
  p_amount_paise integer, p_currency text, p_method text, p_paid_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
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
  v_reference := case when s.mode='test' then 'WEB-TEST-' else 'WEB-' end || replace(s.id::text,'-','');
  -- Keep new website orders at paid until the website's own n8n handoff succeeds.
  -- The bot retry job selects processing orders, so it never takes this work.
  insert into public.orders(reference_id,profile_id,whatsapp_user_id,catalog_id,status,currency,
    subtotal,shipping,discount,total,address_id,source)
  values(v_reference,s.profile_id,s.phone,s.catalog_id,'paid','INR',
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
$$;

create function public.store_claim_checkout_work(p_session_id uuid default null)
returns setof public.store_checkout_sessions language sql security invoker set search_path = '' as $$
  update public.store_checkout_sessions s set next_check_at=now()+interval '5 minutes',work_attempts=work_attempts+1
  where s.id in (
    select q.id from public.store_checkout_sessions q
    where (p_session_id is null or q.id=p_session_id) and q.next_check_at<=now()
      and (q.status='ready' or (q.status='paid' and q.mode='live' and q.handoff_sent_at is null))
      and q.work_attempts<288
    order by q.next_check_at limit 5 for update skip locked
  ) returning s.*;
$$;

create function public.store_complete_handoff(p_session_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.store_checkout_sessions%rowtype;
begin
  select * into s from public.store_checkout_sessions where id=p_session_id for update;
  if not found or s.status<>'paid' or s.mode<>'live' then raise exception 'Paid live checkout required'; end if;
  update public.orders set status=case when status='paid' then 'processing' else status end,
    handoff_sent_at=coalesce(handoff_sent_at,now()),handoff_attempts=handoff_attempts+1,
    handoff_last_attempt_at=now(),handoff_last_error=null where id=s.order_id and source='store';
  update public.store_checkout_sessions set handoff_sent_at=coalesce(handoff_sent_at,now()),last_error=null where id=s.id;
end;
$$;

revoke all on function public.store_finalize_checkout(uuid,text,text,integer,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.store_claim_checkout_work(uuid) from public,anon,authenticated;
revoke all on function public.store_complete_handoff(uuid) from public,anon,authenticated;
grant execute on function public.store_finalize_checkout(uuid,text,text,integer,text,text,timestamptz) to service_role;
grant execute on function public.store_claim_checkout_work(uuid) to service_role;
grant execute on function public.store_complete_handoff(uuid) to service_role;
-- Dedicated authenticated recovery; never changes either existing bot cron job.
select cron.schedule('store-checkout-recovery','*/5 * * * *',$job$
  select net.http_post(
    url := 'https://faoomjgkofqrdajaftjd.supabase.co/functions/v1/madikar-store/checkout-recovery',
    headers := jsonb_build_object('Content-Type','application/json','x-checkout-recovery',recovery_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) from public.store_checkout_settings where id=true and
    exists(select 1 from public.store_checkout_sessions where next_check_at<=now() and work_attempts<288
      and (status='ready' or (status='paid' and mode='live' and handoff_sent_at is null)));
$job$);
commit;

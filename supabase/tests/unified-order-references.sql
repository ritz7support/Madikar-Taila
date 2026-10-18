-- Transactional fixture only: no external calls and all fixture rows roll back.
begin;
set local statement_timeout='15s';
set local role service_role;

do $$
declare
  profile uuid;
  sid uuid;
  checkout_mode text;
  saved jsonb;
  replay jsonb;
  references_seen text[] := '{}';
  legacy_reference text;
begin
  select id into profile from public."Profile" limit 1;
  if profile is null then raise exception 'Verification requires an existing profile'; end if;
  foreach checkout_mode in array array['test','live'] loop
    sid := gen_random_uuid();
    insert into public.store_checkout_sessions(id,token_hash,request_hash,mode,profile_id,phone,customer,items,catalog_id,
      subtotal_paise,shipping_paise,total_paise,provider_order_id,status)
    values(sid,repeat('a',64),repeat('b',64),checkout_mode,profile,'919000000001',
      '{"name":"Rollback fixture","line1":"Fixture street","line2":"","city":"Dharwad","state":"Karnataka","postalCode":"580001"}',
      '[{"retailerId":"fixture","name":"Fixture oil","quantity":1,"unitPaise":560000}]','fixture',
      560000,0,560000,'order_'||replace(sid::text,'-',''),'ready');
    begin
      perform public.store_finalize_checkout(sid,'order_'||replace(sid::text,'-',''),'pay_'||replace(sid::text,'-',''),1,'INR','upi',now());
      raise exception 'Mismatch accepted';
    exception when raise_exception then
      if sqlerrm <> 'Payment does not match checkout' then raise; end if;
    end;
    saved := public.store_finalize_checkout(sid,'order_'||replace(sid::text,'-',''),'pay_'||replace(sid::text,'-',''),560000,'INR','upi',now());
    if saved->>'reference' !~ '^ORD-[0-9]{13}-[0-9A-F]{6}$' then raise exception 'Unexpected order reference format'; end if;
    if saved->>'reference' = any(references_seen) then raise exception 'Duplicate reference'; end if;
    references_seen := array_append(references_seen,saved->>'reference');
    replay := public.store_finalize_checkout(sid,'order_'||replace(sid::text,'-',''),'pay_'||replace(sid::text,'-',''),560000,'INR','upi',now());
    if (replay->>'duplicate')::boolean is not true or replay->>'reference' <> saved->>'reference'
      or replay->>'orderId' <> saved->>'orderId' then raise exception 'Payment replay changed reference'; end if;
    if not exists(select 1 from public.orders o join public.payments p on p.order_id=o.id
      where o.id=(saved->>'orderId')::bigint and o.source='store' and o.status='processing'
      and o.total=5600 and p.amount=5600 and p.status='paid') then raise exception 'Paid data changed'; end if;
    if not exists(select 1 from public.store_payment_confirmations where session_id=sid and status='pending') then
      raise exception 'Confirmation was not queued';
    end if;
    legacy_reference := 'WEB-TEST-'||replace(sid::text,'-','');
    update public.orders set reference_id=legacy_reference where id=(saved->>'orderId')::bigint;
    replay := public.store_finalize_checkout(sid,'order_'||replace(sid::text,'-',''),'pay_'||replace(sid::text,'-',''),560000,'INR','upi',now());
    if replay->>'reference' <> legacy_reference then raise exception 'Historical reference changed on replay'; end if;
  end loop;
end;
$$;
rollback;
select 'PASS: both modes use ORD format, verified amounts, queue, idempotency and historical references preserved; fixtures rolled back' as verification;

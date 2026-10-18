-- Rollback only: no providers, customer messages or persistent fixture data.
begin;
set local statement_timeout='20s';
do $$
begin
  if exists(select 1 from cron.job where jobname='retry-order-handoffs' and active) then raise exception 'Retired cron active'; end if;
  if exists(select 1 from public.store_checkout_settings where shipping_policy='courier-2026-10-17' and shipping_paise is not null) then raise exception 'Legacy shipping fallback remains'; end if;
end;
$$;
set local role service_role;
do $$
declare p uuid; sid uuid; resolution text; claimed integer;
begin
  select id into p from public."Profile" limit 1;
  foreach resolution in array array[null,'creation_rejected','expired','cancelled'] loop
    sid:=gen_random_uuid();
    insert into public.store_checkout_sessions(id,token_hash,request_hash,mode,profile_id,phone,customer,items,catalog_id,
      subtotal_paise,shipping_paise,total_paise,payment_method,status,next_check_at,payment_resolution)
    values(sid,repeat('a',64),repeat('b',64),'test',p,'919000000001',
      '{"name":"Fixture","line1":"Test","city":"Dharwad","state":"Karnataka","postalCode":"580001"}',
      '[{"retailerId":"fixture","name":"Fixture","quantity":1,"unitPaise":100}]','fixture',100,4000,4100,
      'payment_link','preparing',now()-interval '1 minute',resolution);
    select count(*) into claimed from public.store_claim_checkout_work(sid);
    if claimed<>(case when resolution is null then 1 else 0 end) then raise exception 'Incorrect recovery claim';end if;
    begin
      perform public.store_complete_handoff(sid);
      raise exception 'Retired handoff accepted';
    exception when raise_exception then
      if sqlerrm<>'External fulfilment handoff is retired; use the admin Orders panel' then raise;end if;
    end;
  end loop;
  if has_table_privilege('anon','public.store_checkout_sessions','SELECT')
    or has_function_privilege('authenticated','public.store_claim_checkout_work(uuid)','EXECUTE') then raise exception 'Private checkout exposed';end if;
end;
$$;
rollback;
select 'PASS: retired cron/RPC, fail-closed shipping, terminal session recovery and private access; fixtures rolled back' as verification;

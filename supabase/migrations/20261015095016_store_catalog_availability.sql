begin;

-- Durable, private queue. Availability changes never rewrite catalog identities or prices.
create table public.store_catalog_availability (
  variant_id bigint primary key references public."ProductVariant"(id) on delete cascade,
  catalog_id text not null,
  retailer_id text not null,
  desired_availability text not null check (desired_availability in ('in stock','out of stock')),
  revision bigint not null default 1,
  synced_revision bigint not null default 0,
  status text not null default 'pending' check (status in ('pending','sending','synced','error')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  meta_item_id text,
  confirmed_availability text,
  last_error text,
  updated_at timestamptz not null default now(),
  synced_at timestamptz
);
alter table public.store_catalog_availability enable row level security;
revoke all on public.store_catalog_availability from public, anon, authenticated;
grant select,insert,update,delete on public.store_catalog_availability to service_role;
create index store_catalog_availability_pending on public.store_catalog_availability (next_attempt_at)
  where status in ('pending','sending');

create function public.store_queue_catalog_availability()
returns trigger language plpgsql set search_path=public as $fn$
declare parent public."Product"%rowtype;
begin
  select * into parent from public."Product" where id=new.product_id;
  if parent.store_id is null or parent.catalog_id is null or parent.catalog_id !~ '^[0-9]+$' or nullif(btrim(new.retailer_id),'') is null then
    delete from public.store_catalog_availability where variant_id=new.id;
    return new;
  end if;
  insert into public.store_catalog_availability(variant_id,catalog_id,retailer_id,desired_availability)
  values(new.id,parent.catalog_id,new.retailer_id,case when new.availability_status='available' then 'in stock' else 'out of stock' end)
  on conflict(variant_id) do update set
    catalog_id=excluded.catalog_id,retailer_id=excluded.retailer_id,
    desired_availability=excluded.desired_availability,
    revision=store_catalog_availability.revision+1,attempts=0,next_attempt_at=now(),
    status=case when store_catalog_availability.lease_until>now() then 'sending' else 'pending' end,
    last_error=null,updated_at=now();
  return new;
end;
$fn$;
revoke all on function public.store_queue_catalog_availability() from public,anon,authenticated;
grant execute on function public.store_queue_catalog_availability() to service_role;
create trigger store_variant_availability_insert after insert on public."ProductVariant"
  for each row execute function public.store_queue_catalog_availability();
create trigger store_variant_availability_update after update of availability_status,retailer_id,product_id on public."ProductVariant"
  for each row when(old.availability_status is distinct from new.availability_status
    or old.retailer_id is distinct from new.retailer_id or old.product_id is distinct from new.product_id)
  execute function public.store_queue_catalog_availability();

create function public.store_set_product_availability(p_product_id bigint,p_available boolean)
returns jsonb language plpgsql set search_path=public as $fn$
declare changed integer;
begin
  if p_available is null or not exists(select 1 from public."Product" where id=p_product_id and store_id is not null) then
    raise exception 'Product not found';
  end if;
  update public."ProductVariant" set availability_status=case when p_available then 'available' else 'unavailable' end
  where product_id=p_product_id;
  get diagnostics changed=row_count;
  return jsonb_build_object('updated',changed);
end;
$fn$;

create function public.store_claim_catalog_availability(p_product_id bigint default null)
returns jsonb language plpgsql set search_path=public as $fn$
declare result jsonb;
begin
  update public.store_catalog_availability set status='error',lease_token=null,lease_until=null,
    last_error='Meta update could not be confirmed after repeated attempts',updated_at=now()
  where status='sending' and lease_until<now() and attempts>=8;
  with due as (
    select q.variant_id from public.store_catalog_availability q
    join public."ProductVariant" v on v.id=q.variant_id
    where (p_product_id is null or v.product_id=p_product_id)
      and q.attempts<8
      and ((q.status='pending' and q.next_attempt_at<=now())
        or (q.status='sending' and q.lease_until<now()))
    order by q.next_attempt_at,q.variant_id limit 6 for update of q skip locked
  ), claimed as (
    update public.store_catalog_availability q set status='sending',attempts=q.attempts+1,
      lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes'
    from due where q.variant_id=due.variant_id returning q.*
  )
  select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into result from claimed c;
  return result;
end;
$fn$;

create function public.store_finish_catalog_availability(
  p_variant_id bigint,p_revision bigint,p_lease_token uuid,p_ok boolean,
  p_meta_item_id text default null,p_error text default null,p_retryable boolean default true)
returns boolean language plpgsql set search_path=public as $fn$
declare q public.store_catalog_availability%rowtype;
begin
  select * into q from public.store_catalog_availability where variant_id=p_variant_id for update;
  if not found or q.lease_token is distinct from p_lease_token or q.status<>'sending' then return false; end if;
  update public.store_catalog_availability set
    status=case when revision<>p_revision then 'pending' when p_ok then 'synced'
      when p_retryable and attempts<8 then 'pending' else 'error' end,
    synced_revision=case when p_ok then p_revision else synced_revision end,
    confirmed_availability=case when p_ok and revision=p_revision then desired_availability else confirmed_availability end,
    meta_item_id=case when p_ok then p_meta_item_id else meta_item_id end,
    synced_at=case when p_ok then now() else synced_at end,
    last_error=case when p_ok or revision<>p_revision then null else left(coalesce(p_error,'Meta update could not be confirmed'),200) end,
    next_attempt_at=case when revision<>p_revision then now() else now()+make_interval(secs=>least(900,30*(2^least(attempts,5))::integer)) end,
    lease_token=null,lease_until=null,updated_at=now()
  where variant_id=p_variant_id;
  return true;
end;
$fn$;

create function public.store_retry_catalog_availability(p_variant_id bigint)
returns boolean language plpgsql set search_path=public as $fn$
begin
  update public.store_catalog_availability set status='pending',attempts=0,
    next_attempt_at=now(),last_error=null,lease_token=null,lease_until=null
  where variant_id=p_variant_id and (status in ('pending','error') or (status='sending' and lease_until<now()));
  return found;
end;
$fn$;
revoke all on function public.store_set_product_availability(bigint,boolean),
  public.store_claim_catalog_availability(bigint),
  public.store_finish_catalog_availability(bigint,bigint,uuid,boolean,text,text,boolean),
  public.store_retry_catalog_availability(bigint) from public,anon,authenticated;
grant execute on function public.store_set_product_availability(bigint,boolean),
  public.store_claim_catalog_availability(bigint),
  public.store_finish_catalog_availability(bigint,bigint,uuid,boolean,text,text,boolean),
  public.store_retry_catalog_availability(bigint) to service_role;

-- Reuse the existing private recovery credential without changing other jobs.
select cron.schedule('store-catalog-availability-recovery','* * * * *',$job$
  select net.http_post(
    url := 'https://faoomjgkofqrdajaftjd.supabase.co/functions/v1/madikar-store/catalog-availability-recovery',
    headers := jsonb_build_object('Content-Type','application/json','x-checkout-recovery',recovery_token),
    body := '{}'::jsonb,timeout_milliseconds := 60000
  ) from public.store_checkout_settings where id=true and exists(
    select 1 from public.store_catalog_availability where
      (status='pending' and attempts<8 and next_attempt_at<=now()) or (status='sending' and lease_until<now())
  );
$job$);
commit;

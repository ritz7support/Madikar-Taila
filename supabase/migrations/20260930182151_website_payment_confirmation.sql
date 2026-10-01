-- Website-only confirmation outbox. No historical payment backfill or bot changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

create table public.store_payment_confirmations (
  session_id uuid primary key references public.store_checkout_sessions(id),
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','uncertain')),
  attempts integer not null default 0 check(attempts between 0 and 8),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  message_id text,
  accepted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index store_payment_confirmations_due_idx on public.store_payment_confirmations(next_attempt_at) where status='pending';
alter table public.store_payment_confirmations enable row level security;
revoke all on public.store_payment_confirmations from public,anon,authenticated;
grant select,insert,update,delete on public.store_payment_confirmations to service_role;

create function public.store_queue_payment_confirmation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  insert into public.store_payment_confirmations(session_id) values(new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.store_queue_payment_confirmation() from public,anon,authenticated;
grant execute on function public.store_queue_payment_confirmation() to service_role;
create trigger store_queue_payment_confirmation
after update of status on public.store_checkout_sessions
for each row when(new.status='paid' and old.status is distinct from 'paid')
execute function public.store_queue_payment_confirmation();

create function public.store_claim_payment_confirmations(p_session_id uuid default null)
returns table(session_id uuid,phone text,lease_token uuid,attempts integer)
language plpgsql security invoker set search_path='' as $$
begin
  -- If a worker disappeared, Meta may already have accepted its message.
  -- Hold for review instead of risking a duplicate confirmation.
  update public.store_payment_confirmations c set status='uncertain',last_error='Worker lease expired; check Meta before retrying.'
  where c.status='sending' and c.lease_until<now() and (p_session_id is null or c.session_id=p_session_id);
  return query
  with claimed as (
    update public.store_payment_confirmations c
    set status='sending',attempts=c.attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    where c.session_id in (
      select q.session_id from public.store_payment_confirmations q
      join public.store_checkout_sessions s on s.id=q.session_id
      where q.status='pending' and q.next_attempt_at<=now() and q.attempts<8
        and s.status='paid' and s.order_id is not null and s.provider_payment_id is not null
        and (p_session_id is null or q.session_id=p_session_id)
      order by q.next_attempt_at limit 5 for update of q skip locked
    )
    returning c.session_id,c.lease_token,c.attempts
  )
  select c.session_id,s.phone,c.lease_token,c.attempts from claimed c
  join public.store_checkout_sessions s on s.id=c.session_id;
end;
$$;

create function public.store_finish_payment_confirmation(
  p_session_id uuid,p_lease_token uuid,p_status text,p_message_id text default null,p_error text default null
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('sent','pending','failed','uncertain') or p_status is null then raise exception 'Invalid confirmation status'; end if;
  if p_status='sent' and (p_message_id is null or p_message_id not like 'wamid.%') then raise exception 'Message ID required'; end if;
  update public.store_payment_confirmations c set
    status=case when p_status='pending' and c.attempts>=8 then 'failed' else p_status end,
    message_id=case when p_status='sent' then p_message_id else c.message_id end,
    accepted_at=case when p_status='sent' then now() else c.accepted_at end,
    last_error=case when p_status='sent' then null else left(p_error,250) end,
    next_attempt_at=now()+interval '5 minutes'*least(c.attempts,6),
    lease_until=null
  where c.session_id=p_session_id and c.lease_token=p_lease_token and c.status in ('sending','uncertain');
  if not found then raise exception 'Confirmation lease not found'; end if;
end;
$$;
revoke all on function public.store_claim_payment_confirmations(uuid) from public,anon,authenticated;
revoke all on function public.store_finish_payment_confirmation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.store_claim_payment_confirmations(uuid) to service_role;
grant execute on function public.store_finish_payment_confirmation(uuid,uuid,text,text,text) to service_role;

select cron.schedule('store-checkout-recovery','*/5 * * * *',$job$
  select net.http_post(
    url := 'https://faoomjgkofqrdajaftjd.supabase.co/functions/v1/madikar-store/checkout-recovery',
    headers := jsonb_build_object('Content-Type','application/json','x-checkout-recovery',recovery_token),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  ) from public.store_checkout_settings where id=true and (
    exists(select 1 from public.store_checkout_sessions where next_check_at<=now() and work_attempts<288
      and (status='ready' or (status='paid' and handoff_sent_at is null)))
    or exists(select 1 from public.store_payment_confirmations
      where (status='pending' and next_attempt_at<=now() and attempts<8)
         or (status='sending' and lease_until<now()))
  );
$job$);
commit;

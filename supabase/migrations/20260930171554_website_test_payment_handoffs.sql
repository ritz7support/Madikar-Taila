-- Allow both test and live website payments to reach n8n; bot paths unchanged.
begin;
set local lock_timeout='2s';
create or replace function public.store_claim_checkout_work(p_session_id uuid default null)
returns setof public.store_checkout_sessions language sql security invoker set search_path = '' as $$
  update public.store_checkout_sessions s set next_check_at=now()+interval '5 minutes',work_attempts=work_attempts+1
  where s.id in (
    select q.id from public.store_checkout_sessions q
    where (p_session_id is null or q.id=p_session_id) and q.next_check_at<=now()
      and (q.status='ready' or (q.status='paid' and q.handoff_sent_at is null))
      and q.work_attempts<288
    order by q.next_check_at limit 5 for update skip locked
  ) returning s.*;
$$;

create or replace function public.store_complete_handoff(p_session_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare s public.store_checkout_sessions%rowtype;
begin
  select * into s from public.store_checkout_sessions where id=p_session_id for update;
  if not found or s.status<>'paid' then raise exception 'Paid checkout required'; end if;
  update public.orders set status=case when status='paid' then 'processing' else status end,
    handoff_sent_at=coalesce(handoff_sent_at,now()),handoff_attempts=handoff_attempts+1,
    handoff_last_attempt_at=now(),handoff_last_error=null where id=s.order_id and source='store';
  update public.store_checkout_sessions set handoff_sent_at=coalesce(handoff_sent_at,now()),last_error=null where id=s.id;
end;
$$;

select cron.schedule('store-checkout-recovery','*/5 * * * *',$job$
  select net.http_post(
    url := 'https://faoomjgkofqrdajaftjd.supabase.co/functions/v1/madikar-store/checkout-recovery',
    headers := jsonb_build_object('Content-Type','application/json','x-checkout-recovery',recovery_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  ) from public.store_checkout_settings where id=true and
    exists(select 1 from public.store_checkout_sessions where next_check_at<=now() and work_attempts<288
      and (status='ready' or (status='paid' and handoff_sent_at is null)));
$job$);
commit;

-- New transitions only; do not backfill or send messages for historical orders.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
drop trigger store_queue_delivery_notification on public.orders;
create trigger store_queue_delivery_notification
after update of fulfillment_status on public.orders
for each row when(old.fulfillment_status is distinct from new.fulfillment_status and new.fulfillment_status='completed')
execute function public.store_queue_delivery_notification();

-- Explicit admin action also covers an already-delivered order with no queue
-- entry. Existing accepted/uncertain/in-flight jobs cannot be resent.
create or replace function public.store_retry_delivery_notification(p_order_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found or o.fulfillment_status<>'completed' or o.status='pending_payment' then
    raise exception 'Order must be delivered';
  end if;
  insert into public.store_delivery_notifications(order_id,phone,reference_id)
    values(o.id,regexp_replace(o.whatsapp_user_id,'^\+',''),o.reference_id)
    on conflict(order_id) do nothing;
  if found then return; end if;
  update public.store_delivery_notifications n set status='pending',next_attempt_at=now(),error_code=null,last_error=null,
    reference_id=o.reference_id,phone=regexp_replace(o.whatsapp_user_id,'^\+','')
    where n.order_id=p_order_id and n.status in ('failed','cancelled') and n.attempts<8 and n.message_id is null;
  if not found then raise exception 'Notification cannot be retried safely or retry limit reached'; end if;
end;
$$;
revoke all on function public.store_retry_delivery_notification(bigint) from public,anon,authenticated;
grant execute on function public.store_retry_delivery_notification(bigint) to service_role;
commit;

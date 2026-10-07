-- Staff-managed delivery stage. Keep orders.status for payment and bot handoff.
alter table public.orders
  add column fulfillment_status text not null default 'processing'
  constraint orders_fulfillment_status_check
  check (fulfillment_status in ('processing', 'shipped', 'completed', 'cancelled'));

-- Preserve any delivery stages already recorded in the legacy status column.
update public.orders
set fulfillment_status = case status
  when 'shipped' then 'shipped'
  when 'delivered' then 'completed'
  when 'cancelled' then 'cancelled'
  else 'processing'
end
where status in ('shipped', 'delivered', 'cancelled');

create index if not exists orders_created_at_id_desc_idx
  on public.orders (created_at desc, id desc);

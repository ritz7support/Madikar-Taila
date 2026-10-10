begin;
set local lock_timeout='2s';
set local statement_timeout='30s';

alter table public.orders add column tracking_id text;
alter table public.orders add constraint orders_tracking_id_valid
  check (tracking_id is null or (tracking_id = btrim(tracking_id)
    and char_length(tracking_id) between 1 and 120 and tracking_id !~ '[[:cntrl:]]'));
alter table public.orders add constraint orders_shipped_requires_tracking
  check (fulfillment_status <> 'shipped' or tracking_id is not null);
comment on column public.orders.tracking_id is 'Courier tracking ID entered by staff before marking an order shipped.';

-- Fetch the page first, then its related records, within a single Data API call.
-- Service-role access remains behind the signed website admin endpoint.
create function public.store_admin_orders_page(p_page integer, p_source text default 'all')
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if p_page is null or p_page < 0 or p_page > 1000
    or p_source is null or p_source not in ('all','store','whatsapp') then
    raise exception 'Invalid orders page';
  end if;
  with fetched as materialized (
    select id,reference_id,source,status,fulfillment_status,tracking_id,created_at,
      total,subtotal,shipping,currency,whatsapp_user_id,profile_id,address_id
    from public.orders
    where p_source='all' or source=p_source
    order by created_at desc,id desc limit 21 offset p_page*20
  ), page as materialized (
    select * from fetched order by created_at desc,id desc limit 20
  )
  select jsonb_build_object('orders',coalesce((
    select jsonb_agg(to_jsonb(o) || jsonb_build_object(
      'items',coalesce((select jsonb_agg(jsonb_build_object(
        'order_id',i.order_id,'product_name',i.product_name,'product_retailer_id',i.product_retailer_id,
        'quantity',i.quantity,'unit_price',i.unit_price) order by i.id)
        from public.order_items i where i.order_id=o.id),'[]'::jsonb),
      'payments',coalesce((select jsonb_agg(jsonb_build_object(
        'order_id',p.order_id,'status',p.status,'provider_payment_id',p.provider_payment_id,'amount',p.amount)
        order by p.created_at desc,p.id desc) from public.payments p where p.order_id=o.id),'[]'::jsonb),
      'profile',(select jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'whatsAppUserId',p."whatsAppUserId")
        from public."Profile" p where p.id=o.profile_id),
      'address',(select jsonb_build_object('id',a.id,'recipient_name',a.recipient_name,'phone',a.phone,
        'address_line_1',a.address_line_1,'address_line_2',a.address_line_2,'city',a.city,'state',a.state,
        'pincode',a.pincode,'country',a.country) from public.addresses a where a.id=o.address_id)
    ) order by o.created_at desc,o.id desc) from page o
  ),'[]'::jsonb),'hasMore',(select count(*)>20 from fetched),'page',p_page) into result;
  return result;
end;
$$;
revoke all on function public.store_admin_orders_page(integer,text) from public,anon,authenticated;
grant execute on function public.store_admin_orders_page(integer,text) to service_role;
commit;

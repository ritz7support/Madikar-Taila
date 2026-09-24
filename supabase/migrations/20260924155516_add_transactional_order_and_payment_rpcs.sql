-- Atomic order+items creation and atomic payment->order advancement, to close the
-- "transactional order creation + self-healing payment webhook" gap:
--   1. create_order_with_items: order + order_items insert in one transaction, so a
--      partial failure (e.g. bad item data) rolls back the order row too instead of
--      leaving an empty pending_payment order behind. Also absorbs the whatsapp_message_id
--      duplicate race that used to be handled with a 409 + re-select in application code.
--   2. advance_order_to_processing: idempotent, only moves status forward, safe to call
--      repeatedly (used both inside the atomic payment update and standalone as a
--      self-heal step on duplicate/retried webhook deliveries).
--   3. mark_payment_paid_and_advance_order: payments update + orders advance in one
--      transaction, so a payment can never end up 'paid' while its order stays stuck in
--      'pending_payment'.

create or replace function public.advance_order_to_processing(
  p_order_id bigint,
  p_updated_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  update public.orders
  set status = 'processing',
      updated_at = p_updated_at
  where id = p_order_id
    and status not in ('processing','shipped','delivered','cancelled')
  returning * into v_order;

  if v_order.id is null then
    select * into v_order from public.orders where id = p_order_id;
  end if;

  if v_order.id is null then
    raise exception 'Order % not found while advancing to processing', p_order_id;
  end if;

  return to_jsonb(v_order);
end;
$$;

comment on function public.advance_order_to_processing(bigint, timestamptz) is
  'Idempotently advances an order to processing status. Never regresses an order that is already processing/shipped/delivered/cancelled. Used as a self-heal step on payment-webhook retries/duplicates.';

create or replace function public.mark_payment_paid_and_advance_order(
  p_payment_id bigint,
  p_order_id bigint,
  p_provider_payment_id text,
  p_provider_order_id text,
  p_provider_event_id text,
  p_payment_link_id text,
  p_payment_link_reference_id text,
  p_paid_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.payments;
  v_order_json jsonb;
begin
  update public.payments
  set status = 'paid',
      provider_payment_id = p_provider_payment_id,
      provider_order_id = p_provider_order_id,
      provider_event_id = p_provider_event_id,
      provider_payment_link_id = coalesce(p_payment_link_id, provider_payment_link_id),
      provider_payment_link_reference_id = coalesce(p_payment_link_reference_id, provider_payment_link_reference_id),
      paid_at = p_paid_at,
      updated_at = p_paid_at
  where id = p_payment_id
  returning * into v_payment;

  if v_payment.id is null then
    raise exception 'Payment % not found while marking paid', p_payment_id;
  end if;

  v_order_json := public.advance_order_to_processing(p_order_id, p_paid_at);

  return jsonb_build_object('payment', to_jsonb(v_payment), 'order', v_order_json);
end;
$$;

comment on function public.mark_payment_paid_and_advance_order(bigint, bigint, text, text, text, text, text, timestamptz) is
  'Atomically marks a payment paid and advances its order to processing in one transaction, so the two can never diverge on partial failure.';

create or replace function public.create_order_with_items(
  p_reference_id text,
  p_profile_id uuid,
  p_whatsapp_user_id text,
  p_catalog_id text,
  p_whatsapp_message_id text,
  p_currency text,
  p_subtotal numeric,
  p_shipping numeric,
  p_discount numeric,
  p_total numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order public.orders;
  v_existing public.orders;
  v_item_count integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order_with_items called with no items';
  end if;

  begin
    insert into public.orders (
      reference_id, profile_id, whatsapp_user_id, catalog_id,
      whatsapp_message_id, status, currency, subtotal, shipping, discount, total
    ) values (
      p_reference_id, p_profile_id, p_whatsapp_user_id, p_catalog_id,
      p_whatsapp_message_id, 'pending_payment', p_currency, p_subtotal, p_shipping, p_discount, p_total
    )
    returning * into v_order;
  exception when unique_violation then
    select * into v_existing
    from public.orders
    where whatsapp_message_id = p_whatsapp_message_id
    limit 1;

    if v_existing.id is null then
      raise;
    end if;

    return jsonb_build_object('order', to_jsonb(v_existing), 'duplicate', true);
  end;

  insert into public.order_items (order_id, product_retailer_id, quantity, unit_price, currency, product_name)
  select
    v_order.id,
    item->>'product_retailer_id',
    (item->>'quantity')::integer,
    (item->>'unit_price')::numeric,
    coalesce(item->>'currency', 'INR'),
    item->>'product_name'
  from jsonb_array_elements(p_items) as item;

  get diagnostics v_item_count = row_count;
  if v_item_count = 0 then
    raise exception 'Inserted zero order_items for order %', v_order.id;
  end if;

  return jsonb_build_object('order', to_jsonb(v_order), 'duplicate', false);
end;
$$;

comment on function public.create_order_with_items(text, uuid, text, text, text, text, numeric, numeric, numeric, numeric, jsonb) is
  'Atomically creates an order and its order_items in one transaction, so a partial failure (e.g. a bad cart item) rolls back the order row too instead of leaving an empty pending_payment order behind. Also absorbs whatsapp_message_id duplicate-insert races that used to be handled with a 409 + re-select in application code.';

revoke all on function public.advance_order_to_processing(bigint, timestamptz) from public, anon, authenticated;
revoke all on function public.mark_payment_paid_and_advance_order(bigint, bigint, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.create_order_with_items(text, uuid, text, text, text, text, numeric, numeric, numeric, numeric, jsonb) from public, anon, authenticated;

grant execute on function public.advance_order_to_processing(bigint, timestamptz) to service_role;
grant execute on function public.mark_payment_paid_and_advance_order(bigint, bigint, text, text, text, text, text, timestamptz) to service_role;
grant execute on function public.create_order_with_items(text, uuid, text, text, text, text, numeric, numeric, numeric, numeric, jsonb) to service_role;

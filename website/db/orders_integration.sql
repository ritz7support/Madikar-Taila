-- Madikar Taila web storefront shares the existing order ledger with WhatsApp.
-- Existing WhatsApp rows and functions continue to use the default source.

alter table public.orders alter column profile_id drop not null;
alter table public.orders alter column whatsapp_user_id drop not null;
alter table public.orders alter column catalog_id drop not null;
alter table public.orders add column if not exists customer_name text;
alter table public.orders add column if not exists customer_phone text;
alter table public.orders add column if not exists customer_email text;
alter table public.orders add column if not exists shipping_address jsonb;
alter table public.orders add column if not exists store_razorpay_order_id text;
alter table public.orders add constraint orders_source_required_fields_check check (
  (source = 'whatsapp' and profile_id is not null and whatsapp_user_id is not null and catalog_id is not null)
  or (source = 'store' and customer_name is not null and customer_phone is not null and shipping_address is not null)
);
create unique index if not exists orders_store_razorpay_order_id_key
  on public.orders(store_razorpay_order_id) where store_razorpay_order_id is not null;
alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('awaiting_whatsapp', 'pending_payment', 'paid', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));
alter table public.order_items add column if not exists variant_size text;

create or replace function public.store_create_order(
  p_channel text,
  p_customer jsonb,
  p_address jsonb,
  p_lines jsonb,
  p_shipping_paise integer,
  p_expected_subtotal_paise integer,
  p_provider_order_id text default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_line jsonb;
  v_product public."Product"%rowtype;
  v_variant public."ProductVariant"%rowtype;
  v_product_id text;
  v_variant_index integer;
  v_quantity integer;
  v_price numeric;
  v_subtotal numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_order_id bigint;
  v_reference text;
  v_phone text := p_customer->>'phone';
  v_name text := p_customer->>'name';
  v_email text := nullif(p_customer->>'email', '');
begin
  if p_channel is null or p_channel not in ('whatsapp', 'razorpay') then raise exception 'Invalid checkout channel'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 16 then
    raise exception 'Invalid order lines';
  end if;
  if length(coalesce(v_name, '')) not between 2 and 80 or coalesce(v_phone, '') !~ '^[0-9]{10}$' then
    raise exception 'Invalid customer details';
  end if;
  if v_email is not null and (length(v_email) > 120 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Invalid email';
  end if;
  if jsonb_typeof(p_address) is distinct from 'object'
    or length(coalesce(p_address->>'line1', '')) not between 1 and 120
    or length(coalesce(p_address->>'city', '')) not between 1 and 60
    or length(coalesce(p_address->>'state', '')) not between 1 and 60
    or coalesce(p_address->>'postalCode', '') !~ '^[0-9]{6}$' then
    raise exception 'Invalid shipping address';
  end if;
  if p_shipping_paise is null or p_shipping_paise < 0 or p_shipping_paise > 1000000 then
    raise exception 'Invalid shipping amount';
  end if;
  if p_channel = 'razorpay' and coalesce(p_provider_order_id, '') !~ '^order_[A-Za-z0-9]+$' then
    raise exception 'Invalid payment order';
  end if;
  if p_channel = 'whatsapp' and p_provider_order_id is not null then
    raise exception 'Unexpected payment order';
  end if;

  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_product_id := v_line->>'id';
    if coalesce(v_product_id, '') !~ '^p[0-9]+$'
      or coalesce(v_line->>'variant', '') !~ '^[0-9]+$'
      or coalesce(v_line->>'quantity', '') !~ '^[0-9]+$' then
      raise exception 'Invalid item';
    end if;
    v_variant_index := (v_line->>'variant')::integer;
    v_quantity := (v_line->>'quantity')::integer;
    if v_quantity not between 1 and 20 or v_variant_index > 100
      or (v_product_id || ':' || v_variant_index) = any(v_seen) then
      raise exception 'Invalid item quantity or variant';
    end if;
    v_seen := array_append(v_seen, v_product_id || ':' || v_variant_index);
    select * into v_product from public."Product" where store_id = v_product_id and store_active = true;
    if not found then raise exception 'Product unavailable'; end if;
    select * into v_variant from public."ProductVariant"
      where product_id = v_product.id and position = v_variant_index;
    if not found or v_variant.availability_status = 'unavailable'
      or (v_variant.inventory_quantity is not null and v_variant.inventory_quantity < v_quantity) then
      raise exception 'Variant unavailable';
    end if;
    if p_channel = 'razorpay' and v_variant.availability_status <> 'available' then
      raise exception 'Please confirm product availability before online payment';
    end if;
    v_price := v_variant.price;
    if v_price not between 1 and 100000 then raise exception 'Invalid price'; end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_product_id, 'name', coalesce(v_product.store_name, v_product.name), 'size', v_variant.size,
      'quantity', v_quantity, 'unitPrice', v_price
    ));
  end loop;
  if p_expected_subtotal_paise is null or v_subtotal * 100 <> p_expected_subtotal_paise
    or v_subtotal * 100 not between 100 and 10000000 then
    raise exception 'Product prices changed';
  end if;

  insert into public.orders (
    reference_id, source, profile_id, whatsapp_user_id, catalog_id, status,
    currency, subtotal, shipping, discount, total, customer_name, customer_phone,
    customer_email, shipping_address, store_razorpay_order_id
  ) values (
    'STORE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    'store', null, null, null,
    case when p_channel = 'razorpay' then 'pending_payment' else 'awaiting_whatsapp' end,
    'INR', v_subtotal, p_shipping_paise::numeric / 100, 0,
    v_subtotal + p_shipping_paise::numeric / 100,
    v_name, v_phone, v_email, p_address, p_provider_order_id
  ) returning id, reference_id into v_order_id, v_reference;

  insert into public.order_items (order_id, product_retailer_id, product_name, variant_size, quantity, unit_price, currency)
  select v_order_id, item->>'id', item->>'name', item->>'size',
    (item->>'quantity')::integer, (item->>'unitPrice')::numeric, 'INR'
  from jsonb_array_elements(v_items) as item;

  if p_channel = 'razorpay' then
    insert into public.payments (order_id, provider, provider_order_id, amount, currency, status)
    values (v_order_id, 'razorpay', p_provider_order_id,
      v_subtotal + p_shipping_paise::numeric / 100, 'INR', 'pending');
  end if;

  return jsonb_build_object('id', v_order_id, 'reference', v_reference,
    'subtotalPaise', (v_subtotal * 100)::integer,
    'totalPaise', (v_subtotal * 100 + p_shipping_paise)::integer,
    'items', v_items);
end;
$$;

create or replace function public.store_record_payment(
  p_provider_order_id text,
  p_provider_payment_id text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
begin
  if coalesce(p_provider_order_id, '') !~ '^order_[A-Za-z0-9]+$'
    or coalesce(p_provider_payment_id, '') !~ '^pay_[A-Za-z0-9]+$' then
    raise exception 'Invalid payment reference';
  end if;
  select * into v_order from public.orders
    where source = 'store' and store_razorpay_order_id = p_provider_order_id for update;
  if not found then raise exception 'Store order not found'; end if;
  select * into v_payment from public.payments
    where order_id = v_order.id and provider_order_id = p_provider_order_id for update;
  if not found then raise exception 'Store payment not found'; end if;
  if v_order.status = 'paid' and v_payment.status = 'paid'
    and v_payment.provider_payment_id = p_provider_payment_id then
    return jsonb_build_object('id', v_order.id, 'reference', v_order.reference_id, 'status', 'paid');
  end if;
  if v_order.status <> 'pending_payment' or v_payment.status <> 'pending' then
    raise exception 'Store payment is not pending';
  end if;
  update public.payments set status = 'paid', provider_payment_id = p_provider_payment_id,
    paid_at = now(), updated_at = now() where id = v_payment.id;
  update public.orders set status = 'paid', updated_at = now() where id = v_order.id;
  return jsonb_build_object('id', v_order.id, 'reference', v_order.reference_id, 'status', 'paid');
end;
$$;

revoke all on function public.store_create_order(text,jsonb,jsonb,jsonb,integer,integer,text) from public, anon, authenticated;
revoke all on function public.store_record_payment(text,text) from public, anon, authenticated;
grant execute on function public.store_create_order(text,jsonb,jsonb,jsonb,integer,integer,text) to service_role;
grant execute on function public.store_record_payment(text,text) to service_role;

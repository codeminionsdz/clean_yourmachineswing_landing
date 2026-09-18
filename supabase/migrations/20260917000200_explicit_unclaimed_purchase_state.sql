alter table public.orders
  alter column meta_purchase_status set default null;

update public.orders
set meta_purchase_status = null
where meta_purchase_status = 'pending'
  and not exists (
    select 1
    from public.meta_purchase_attempts attempts
    where attempts.order_id = orders.id
  );

drop function if exists public.create_order(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text, text);

create or replace function public.create_order(
  p_submission_id uuid, p_product_slug text, p_full_name text, p_phone text, p_wilaya text, p_commune text,
  p_address text, p_quantity integer, p_notes text default null, p_utm_source text default null,
  p_utm_medium text default null, p_utm_campaign text default null, p_utm_content text default null,
  p_utm_term text default null, p_fbclid text default null, p_fbp text default null, p_fbc text default null
)
returns table (id uuid, order_number text, total_amount bigint, currency text, created boolean)
language plpgsql security definer set search_path = public
as $$
declare v_product products%rowtype; v_customer customers%rowtype; v_order orders%rowtype; v_order_number text;
begin
  select * into v_product from products where slug = p_product_slug and active = true for share;
  if not found then raise exception using errcode = 'P0002', message = 'product_unavailable'; end if;
  insert into customers (full_name, phone) values (trim(p_full_name), p_phone)
    on conflict (phone) do update set full_name = excluded.full_name, updated_at = now() returning * into v_customer;
  select * into v_order from orders where submission_id = p_submission_id;
  if found then return query select v_order.id, v_order.order_number, v_order.total_amount, v_order.currency, false; return; end if;
  v_order_number := 'YM-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');
  insert into orders (order_number, submission_id, customer_id, product_id, quantity, unit_price, total_amount, currency, wilaya, commune, address, notes, status, meta_purchase_status, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc)
  values (v_order_number, p_submission_id, v_customer.id, v_product.id, p_quantity, v_product.price, v_product.price * p_quantity, v_product.currency, trim(p_wilaya), trim(p_commune), trim(p_address), nullif(trim(p_notes), ''), 'new', null, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term, p_fbclid, p_fbp, p_fbc)
  returning * into v_order;
  return query select v_order.id, v_order.order_number, v_order.total_amount, v_order.currency, true;
end;
$$;

revoke all on function public.create_order(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text, text) to service_role;

create or replace function public.claim_meta_purchase_delivery(
  p_order_id uuid,
  p_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_claimed boolean; v_order_number text;
begin
  update public.orders
  set meta_purchase_status = 'pending', updated_at = now()
  where id = p_order_id
    and order_number = p_event_id
    and meta_purchase_status is null
  returning true, order_number into v_claimed, v_order_number;

  if v_claimed then
    insert into public.meta_purchase_attempts (order_id, order_number, event_id, attempt_number, status)
    values (p_order_id, v_order_number, p_event_id,
      (select count(*)::integer + 1 from public.meta_purchase_attempts where order_id = p_order_id), 'claimed');
  end if;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_meta_purchase_delivery(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_meta_purchase_delivery(uuid, text) to service_role;

create or replace function public.record_meta_purchase_browser_call(
  p_order_number text,
  p_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_recorded boolean; v_order_id uuid;
begin
  if p_order_number is null or p_event_id is null or p_event_id <> p_order_number then
    raise exception 'invalid_meta_purchase_browser_event';
  end if;

  update public.orders
  set meta_purchase_browser_status = 'sent', updated_at = now()
  where order_number = p_order_number
    and meta_purchase_status = 'sent'
    and meta_purchase_browser_status is null
  returning id into v_order_id;

  if v_order_id is null then return false; end if;

  insert into public.meta_purchase_browser_calls (order_number, event_id)
  values (p_order_number, p_event_id);
  v_recorded := true;
  return v_recorded;
end;
$$;

revoke all on function public.record_meta_purchase_browser_call(text, text) from public, anon, authenticated;
grant execute on function public.record_meta_purchase_browser_call(text, text) to service_role;
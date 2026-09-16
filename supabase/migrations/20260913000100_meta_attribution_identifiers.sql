alter table public.orders
  add column if not exists fbp text,
  add column if not exists fbc text;

create or replace function public.create_order(
  p_submission_id uuid, p_product_slug text, p_full_name text, p_phone text, p_wilaya text, p_commune text,
  p_address text, p_quantity integer, p_notes text default null, p_utm_source text default null,
  p_utm_medium text default null, p_utm_campaign text default null, p_utm_content text default null,
  p_utm_term text default null, p_fbclid text default null, p_fbp text default null, p_fbc text default null
)
returns table (id uuid, order_number text, total_amount bigint, currency text)
language plpgsql security definer set search_path = public
as $$
declare v_product products%rowtype; v_customer customers%rowtype; v_order orders%rowtype; v_order_number text;
begin
  select * into v_product from products where slug = p_product_slug and active = true for share;
  if not found then raise exception using errcode = 'P0002', message = 'product_unavailable'; end if;
  insert into customers (full_name, phone) values (trim(p_full_name), p_phone)
    on conflict (phone) do update set full_name = excluded.full_name, updated_at = now() returning * into v_customer;
  select * into v_order from orders where submission_id = p_submission_id;
  if found then return query select v_order.id, v_order.order_number, v_order.total_amount, v_order.currency; return; end if;
  v_order_number := 'YM-' || to_char(current_date, 'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');
  insert into orders (order_number, submission_id, customer_id, product_id, quantity, unit_price, total_amount, currency, wilaya, commune, address, notes, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbp, fbc)
  values (v_order_number, p_submission_id, v_customer.id, v_product.id, p_quantity, v_product.price, v_product.price * p_quantity, v_product.currency, trim(p_wilaya), trim(p_commune), trim(p_address), nullif(trim(p_notes), ''), p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term, p_fbclid, p_fbp, p_fbc)
  returning * into v_order;
  return query select v_order.id, v_order.order_number, v_order.total_amount, v_order.currency;
end;
$$;

revoke all on function public.create_order(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, text, text, text, text) to service_role;

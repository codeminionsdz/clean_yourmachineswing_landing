create extension if not exists pgcrypto;

create type public.order_status as enum ('new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned');
create type public.admin_role as enum ('owner', 'admin', 'operator');

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.admin_role not null default 'operator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
  brand text not null, manufacturer text not null, model text not null, description text,
  price bigint not null check (price >= 0), currency text not null default 'DZD' check (currency = 'DZD'),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(), full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text not null unique, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(), order_number text not null unique, submission_id uuid not null unique,
  customer_id uuid not null references public.customers(id), product_id uuid not null references public.products(id),
  quantity integer not null check (quantity between 1 and 99), unit_price bigint not null check (unit_price >= 0),
  total_amount bigint not null check (total_amount >= 0), currency text not null default 'DZD' check (currency = 'DZD'),
  wilaya text not null check (char_length(trim(wilaya)) between 1 and 80), commune text not null check (char_length(trim(commune)) between 1 and 120),
  address text not null check (char_length(trim(address)) between 3 and 300), notes text check (notes is null or char_length(notes) <= 1000),
  status public.order_status not null default 'new', payment_method text not null default 'cod' check (payment_method = 'cod'),
  shipping_provider text, tracking_reference text, shipping_status text,
  shipped_at timestamptz, delivered_at timestamptz, returned_at timestamptz,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text, fbclid text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint orders_total_matches_line check (total_amount = unit_price * quantity)
);

create index orders_created_at_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status);
create index orders_customer_id_idx on public.orders (customer_id);
create index orders_product_id_idx on public.orders (product_id);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger admin_users_updated_at before update on public.admin_users for each row execute function public.set_updated_at();

insert into public.products (name, slug, brand, manufacturer, model, description, price, currency)
values ('ACME model 320', 'acme-model-320', 'ACME', 'ACME', '320', 'ACME model 320 overlock machine.', 44000, 'DZD')
on conflict (slug) do update set name = excluded.name, brand = excluded.brand, manufacturer = excluded.manufacturer,
model = excluded.model, description = excluded.description, price = excluded.price, currency = excluded.currency, updated_at = now();

alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.admin_users enable row level security;
create policy products_public_read on public.products for select using (active = true);

create or replace function public.current_admin_role()
returns public.admin_role language sql stable security definer set search_path = public
as $$ select role from public.admin_users where user_id = auth.uid() $$;
revoke all on function public.current_admin_role() from public;
grant execute on function public.current_admin_role() to authenticated, service_role;
create policy admin_users_self_read on public.admin_users for select to authenticated using (user_id = auth.uid());

create sequence if not exists public.order_number_seq;

create or replace function public.create_order(
  p_submission_id uuid, p_product_slug text, p_full_name text, p_phone text, p_wilaya text, p_commune text,
  p_address text, p_quantity integer, p_notes text default null, p_utm_source text default null,
  p_utm_medium text default null, p_utm_campaign text default null, p_utm_content text default null,
  p_utm_term text default null, p_fbclid text default null
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
  insert into orders (order_number, submission_id, customer_id, product_id, quantity, unit_price, total_amount, currency, wilaya, commune, address, notes, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid)
  values (v_order_number, p_submission_id, v_customer.id, v_product.id, p_quantity, v_product.price, v_product.price * p_quantity, v_product.currency, trim(p_wilaya), trim(p_commune), trim(p_address), nullif(trim(p_notes), ''), p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term, p_fbclid)
  returning * into v_order;
  return query select v_order.id, v_order.order_number, v_order.total_amount, v_order.currency;
end;
$$;
revoke all on function public.create_order(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_order(uuid, text, text, text, text, text, text, integer, text, text, text, text, text, text, text) to service_role;

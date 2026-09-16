create table public.abandoned_orders (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique,
  full_name text,
  phone text,
  wilaya text,
  commune text,
  address text,
  notes text,
  status text not null default 'abandoned' check (status in ('abandoned', 'converted')),
  converted_order_id uuid references public.orders(id) on delete set null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index abandoned_orders_last_seen_idx on public.abandoned_orders (last_seen_at desc);
create index abandoned_orders_status_idx on public.abandoned_orders (status);

create trigger abandoned_orders_updated_at before update on public.abandoned_orders for each row execute function public.set_updated_at();

alter table public.abandoned_orders enable row level security;

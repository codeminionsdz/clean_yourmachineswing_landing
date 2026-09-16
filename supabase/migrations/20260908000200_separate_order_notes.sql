alter table public.orders add column if not exists seller_notes text check (seller_notes is null or char_length(seller_notes) <= 1000);
alter table public.abandoned_orders add column if not exists seller_notes text check (seller_notes is null or char_length(seller_notes) <= 1000);

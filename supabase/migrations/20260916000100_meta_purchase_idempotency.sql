alter table public.orders
  add column if not exists meta_purchase_status text check (meta_purchase_status in ('pending', 'sent'));

create or replace function public.claim_meta_purchase_delivery(
  p_order_id uuid,
  p_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_claimed boolean;
begin
  update public.orders
  set meta_purchase_status = 'pending',
      updated_at = now()
  where id = p_order_id
    and (meta_purchase_status is null or meta_purchase_status = 'pending')
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.mark_meta_purchase_delivery_sent(
  p_order_id uuid,
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set meta_purchase_status = 'sent',
      updated_at = now()
  where id = p_order_id
    and meta_purchase_status = 'pending';
end;
$$;

create or replace function public.reset_meta_purchase_delivery_pending(
  p_order_id uuid,
  p_event_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set meta_purchase_status = null,
      updated_at = now()
  where id = p_order_id
    and meta_purchase_status = 'pending';
end;
$$;

revoke all on function public.claim_meta_purchase_delivery(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_meta_purchase_delivery_sent(uuid, text) from public, anon, authenticated;
revoke all on function public.reset_meta_purchase_delivery_pending(uuid, text) from public, anon, authenticated;

grant execute on function public.claim_meta_purchase_delivery(uuid, text) to service_role;
grant execute on function public.mark_meta_purchase_delivery_sent(uuid, text) to service_role;
grant execute on function public.reset_meta_purchase_delivery_pending(uuid, text) to service_role;

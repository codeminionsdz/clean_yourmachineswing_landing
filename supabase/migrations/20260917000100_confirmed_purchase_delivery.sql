alter table public.orders alter column meta_purchase_status set default null;
alter table public.orders add column if not exists meta_purchase_browser_status text check (meta_purchase_browser_status in ('sent'));

update public.orders
set meta_purchase_status = null
where meta_purchase_status = 'pending'
  and not exists (
    select 1 from public.meta_purchase_attempts attempts
    where attempts.order_id = orders.id
  );

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
    and status = 'confirmed'
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
    and status = 'confirmed'
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
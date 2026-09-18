create or replace function public.record_meta_purchase_delivery_result(
  p_order_id uuid,
  p_event_id text,
  p_status text,
  p_meta_response_status integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('failed', 'skipped') then
    raise exception 'invalid_meta_purchase_delivery_status';
  end if;

  update public.orders
  set meta_purchase_status = null,
      updated_at = now()
  where id = p_order_id
    and order_number = p_event_id
    and meta_purchase_status = 'pending';

  update public.meta_purchase_attempts
  set status = p_status,
      meta_response_status = p_meta_response_status,
      completed_at = now(),
      accepted = false
  where order_id = p_order_id
    and event_id = p_event_id
    and status = 'claimed';
end;
$$;

revoke all on function public.record_meta_purchase_delivery_result(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.record_meta_purchase_delivery_result(uuid, text, text, integer) to service_role;
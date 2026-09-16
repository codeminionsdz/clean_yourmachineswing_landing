create table if not exists public.integration_settings (
  id boolean primary key default true check (id = true),
  zr_base_url text,
  zr_tenant_id text,
  zr_api_key text,
  meta_pixel_id text,
  meta_capi_access_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.integration_settings enable row level security;
create trigger integration_settings_updated_at before update on public.integration_settings for each row execute function public.set_updated_at();

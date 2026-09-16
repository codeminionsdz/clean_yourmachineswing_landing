import 'server-only'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type IntegrationSettings = {
  id: boolean
  zr_base_url: string | null
  zr_tenant_id: string | null
  zr_api_key: string | null
  meta_pixel_id: string | null
  meta_capi_access_token: string | null
}

export async function getIntegrationSettings() {
  const { data, error } = await getSupabaseAdmin().from('integration_settings').select('*').eq('id', true).maybeSingle()
  if (error) throw error
  return data as IntegrationSettings | null
}

export function maskSecret(value: string | null | undefined) {
  return value ? '********' : ''
}

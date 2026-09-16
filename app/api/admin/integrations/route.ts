import { NextResponse } from 'next/server'
import { verifyAdminApi } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getIntegrationSettings, maskSecret } from '@/lib/integration-settings'

function publicSettings(settings: Awaited<ReturnType<typeof getIntegrationSettings>>) {
  return {
    zrBaseUrl: settings?.zr_base_url ?? '', zrTenantId: settings?.zr_tenant_id ?? '', zrApiKey: maskSecret(settings?.zr_api_key),
    metaPixelId: settings?.meta_pixel_id ?? '', metaAccessToken: maskSecret(settings?.meta_capi_access_token),
    zrConfigured: Boolean(settings?.zr_base_url && settings?.zr_tenant_id && settings?.zr_api_key),
    metaConfigured: Boolean(settings?.meta_pixel_id && settings?.meta_capi_access_token),
  }
}

export async function GET() {
  if (!await verifyAdminApi(new Request('http://local'))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try { return NextResponse.json({ settings: publicSettings(await getIntegrationSettings()) }) }
  catch { return NextResponse.json({ error: 'settings_unavailable' }, { status: 500 }) }
}

export async function PUT(request: Request) {
  if (!await verifyAdminApi(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const current = await getIntegrationSettings()
  const value = (key: string) => typeof body[key] === 'string' ? body[key].trim() : ''
  const update = {
    id: true, zr_base_url: value('zrBaseUrl'), zr_tenant_id: value('zrTenantId'),
    zr_api_key: value('zrApiKey') && value('zrApiKey') !== '********' ? value('zrApiKey') : current?.zr_api_key ?? null,
    meta_pixel_id: value('metaPixelId'),
    meta_capi_access_token: value('metaAccessToken') && value('metaAccessToken') !== '********' ? value('metaAccessToken') : current?.meta_capi_access_token ?? null,
  }
  const { error } = await getSupabaseAdmin().from('integration_settings').upsert(update, { onConflict: 'id' })
  if (error) { console.error('integration settings save failed'); return NextResponse.json({ error: 'save_failed' }, { status: 500 }) }
  return NextResponse.json({ settings: publicSettings({ ...current, ...update } as Awaited<ReturnType<typeof getIntegrationSettings>>) })
}

export async function POST(request: Request) {
  if (!await verifyAdminApi(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null); const provider = body?.provider
  const settings = await getIntegrationSettings()
  try {
    if (provider === 'zr') {
      if (!settings?.zr_base_url || !settings.zr_tenant_id || !settings.zr_api_key) return NextResponse.json({ status: 'not_configured' })
      const response = await fetch(settings.zr_base_url, { method: 'GET', headers: { 'X-Tenant': settings.zr_tenant_id, 'X-Api-Key': settings.zr_api_key }, cache: 'no-store' })
      return NextResponse.json({ status: response.ok ? 'connected' : 'connection_failed' })
    }
    if (provider === 'meta') {
      if (!settings?.meta_pixel_id || !settings.meta_capi_access_token) return NextResponse.json({ status: 'not_configured' })
      const response = await fetch(`https://graph.facebook.com/v20.0/${encodeURIComponent(settings.meta_pixel_id)}?access_token=${encodeURIComponent(settings.meta_capi_access_token)}`, { cache: 'no-store' })
      return NextResponse.json({ status: response.ok ? 'configured' : 'configuration_error' })
    }
    return NextResponse.json({ error: 'invalid_provider' }, { status: 400 })
  } catch { return NextResponse.json({ status: provider === 'zr' ? 'connection_failed' : 'configuration_error' }) }
}

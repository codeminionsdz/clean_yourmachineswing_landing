import { NextResponse } from 'next/server'
import { verifyAdminApi } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getIntegrationSettings } from '@/lib/integration-settings'

type ZrTerritory = { id?: string; name?: string | null; nameArabic?: string | null; level?: string | null; parentId?: string | null }
type ZrTerritoryPage = { items?: ZrTerritory[]; pageNumber?: number; totalPages?: number }
type TerritoryDiagnostic = { requestedWilaya: string; requestedCommune: string; cityCandidates: ZrTerritory[]; districtCandidates: ZrTerritory[] }

class TerritoryResolutionError extends Error {
  constructor(public readonly code: 'zr_territories_unavailable' | 'zr_territory_not_found', public readonly diagnostic?: TerritoryDiagnostic) {
    super(code)
  }
}

function zrApiUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/$/, '')
  const versionedBase = /\/api\/v[^/]+$/i.test(base) ? base : `${base}/api/v1.0`
  return `${versionedBase}${path}`
}

function normalizeTerritoryName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/[ؤئ]/g, 'ء').replace(/[’']/g, '').replace(/[.,،؛:()[\]{}]/g, ' ').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function territoryLevel(item: ZrTerritory) {
  return normalizeTerritoryName(item.level ?? '')
}

function territoryMatchesName(item: ZrTerritory, requested: string) {
  return [item.name, item.nameArabic].some(name => normalizeTerritoryName(name ?? '') === requested)
}

function territorySummary(item: ZrTerritory) {
  return { id: item.id, name: item.name, nameArabic: item.nameArabic, level: item.level, parentId: item.parentId }
}

async function resolveTerritories(baseUrl: string, tenantId: string, apiKey: string, wilaya: string, commune: string) {
  const territories: ZrTerritory[] = []
  let pageNumber = 1
  let totalPages = 1
  do {
    const response = await fetch(zrApiUrl(baseUrl, '/territories/search'), {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'X-Tenant': tenantId, 'X-Api-Key': apiKey },
      body: JSON.stringify({ pageNumber, pageSize: 1000, orderBy: ['code asc'] }),
      cache: 'no-store',
    })
    const result = await response.json().catch(() => null) as ZrTerritoryPage | null
    if (!response.ok || !Array.isArray(result?.items)) throw new TerritoryResolutionError('zr_territories_unavailable')
    territories.push(...result.items)
    totalPages = result.totalPages || pageNumber
    pageNumber += 1
  } while (pageNumber <= totalPages)

  const requestedWilaya = normalizeTerritoryName(wilaya)
  const requestedCommune = normalizeTerritoryName(commune)
  const cityCandidates = territories.filter(item => territoryLevel(item) === 'wilaya' && territoryMatchesName(item, requestedWilaya))
  const city = cityCandidates[0]
  const districtCandidates = territories.filter(item => territoryLevel(item) === 'commune' && (city?.id ? item.parentId === city.id : territoryMatchesName(item, requestedCommune)))
  const district = districtCandidates.find(item => territoryMatchesName(item, requestedCommune))
  if (!city?.id || !district?.id) {
    const diagnostic = { requestedWilaya: wilaya, requestedCommune: commune, cityCandidates: cityCandidates.map(territorySummary), districtCandidates: districtCandidates.map(territorySummary) }
    console.warn('ZR territory resolution failed', diagnostic)
    throw new TerritoryResolutionError('zr_territory_not_found', diagnostic)
  }
  return { cityTerritoryId: city.id, districtTerritoryId: district.id }
}

type ZrSettings = { zr_base_url: string; zr_tenant_id: string; zr_api_key: string }

async function sendOrder(orderId: string, db: ReturnType<typeof getSupabaseAdmin>, settings: ZrSettings) {
  const { data: order, error } = await db.from('orders').select('*, customers(full_name,phone), products(name)').eq('id', orderId).maybeSingle()
  if (error || !order) return { ok: false as const, error: 'order_not_found', message: 'Order not found.' }
  if (order.tracking_reference) return { ok: false as const, error: 'already_sent', message: 'Already sent.' }
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  if (!customer?.full_name || !customer?.phone || !order.wilaya || !order.commune || !order.address) return { ok: false as const, error: 'order_missing_delivery_data', message: 'Order is missing delivery data.' }
  try {
    const product = Array.isArray(order.products) ? order.products[0] : order.products
    const territories = await resolveTerritories(settings.zr_base_url, settings.zr_tenant_id, settings.zr_api_key, order.wilaya, order.commune)
    const response = await fetch(zrApiUrl(settings.zr_base_url, '/parcels'), { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'X-Tenant': settings.zr_tenant_id, 'X-Api-Key': settings.zr_api_key }, body: JSON.stringify({ customer: { customerId: crypto.randomUUID(), name: customer.full_name, phone: { number1: customer.phone } }, deliveryAddress: { ...territories, street: order.address }, orderedProducts: [{ productName: product?.name, unitPrice: Number(order.unit_price), quantity: order.quantity, stockType: 'none' }], amount: Number(order.total_amount), description: product?.name, deliveryType: 'home', externalId: order.order_number }), cache: 'no-store' })
    const result = await response.json().catch(() => null)
    if (!response.ok) return { ok: false as const, error: 'zr_request_failed', message: typeof result?.detail === 'string' ? result.detail : 'ZR Express rejected the parcel.' }
    const tracking = result?.id
    if (typeof tracking !== 'string' || !tracking) return { ok: false as const, error: 'zr_missing_tracking_reference', message: 'ZR Express did not return a parcel id.' }
    const { error: saveError } = await db.from('orders').update({ shipping_provider: 'ZR Express', tracking_reference: tracking, shipping_status: 'sent', shipped_at: new Date().toISOString(), status: order.status === 'new' ? 'processing' : order.status }).eq('id', order.id).is('tracking_reference', null)
    if (saveError) return { ok: false as const, error: 'shipment_save_failed', message: 'Shipment was created but could not be saved.' }
    return { ok: true as const, orderId, trackingReference: tracking }
  } catch (error) {
    const code = error instanceof TerritoryResolutionError ? error.code : error instanceof Error ? error.message : 'zr_request_failed'
    const messages: Record<string, string> = { zr_territories_unavailable: 'ZR Express territory data is unavailable. Please retry.', zr_territory_not_found: 'Wilaya/commune not found in ZR Express territories. Please verify the delivery information.' }
    return { ok: false as const, error: code, message: messages[code] ?? 'Unable to create the ZR Express parcel. Please retry.' }
  }
}

export async function POST(request: Request) {
  if (!await verifyAdminApi(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const orderIds = Array.isArray(body?.orderIds) ? body.orderIds.filter((id: unknown): id is string => typeof id === 'string') : typeof body?.orderId === 'string' ? [body.orderId] : []
  if (!orderIds.length || orderIds.length !== (Array.isArray(body?.orderIds) ? body.orderIds.length : 1)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const settings = await getIntegrationSettings()
  if (!settings?.zr_base_url || !settings.zr_tenant_id || !settings.zr_api_key) return NextResponse.json({ error: 'zr_not_configured' }, { status: 400 })
  const zrSettings: ZrSettings = { zr_base_url: settings.zr_base_url, zr_tenant_id: settings.zr_tenant_id, zr_api_key: settings.zr_api_key }
  const db = getSupabaseAdmin()
  const results = []
  for (const orderId of orderIds) results.push(await sendOrder(orderId, db, zrSettings))
  if (orderIds.length === 1) {
    const result = results[0]
    return result.ok ? NextResponse.json({ trackingReference: result.trackingReference }) : NextResponse.json(result, { status: result.error === 'already_sent' ? 409 : 502 })
  }
  return NextResponse.json({ results, sent: results.filter(result => result.ok).length, failed: results.filter(result => !result.ok).length })
}

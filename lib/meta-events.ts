import 'server-only'
import { createHash } from 'crypto'
import { getIntegrationSettings } from '@/lib/integration-settings'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export type PurchaseEvent = { eventName: 'Purchase'; eventTime: number; eventId: string; actionSource: 'website'; eventSourceUrl: string; value: number; currency: string; fbclid?: string; userData?: { ph?: string[]; fn?: string[]; fbp?: string; fbc?: string; client_ip_address?: string; client_user_agent?: string } }
export type BrowserPurchase = { eventId: string; value: number; currency: string }
function normalizePurchaseValue(value: unknown) {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('invalid_purchase_value')
  return amount
}
export function validatePurchaseEvent(event: Partial<PurchaseEvent>): boolean {
  return typeof event?.eventId === 'string' && event.eventId.trim().length > 0 && event.currency === 'DZD' && typeof event.value === 'number' && Number.isFinite(event.value) && event.value > 0
}
export function buildPurchaseEvent(order: { order_number: string; total_amount: unknown; currency: string }, requestUrl: string, customer?: { phone?: string; fullName?: string }, attribution: Record<string, string | undefined> = {}, client?: { clientIp?: string; clientUserAgent?: string }): PurchaseEvent {
  const hash = (value: string) => createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
  const normalizePhone = (value: string) => {
    const digits = value.replace(/\D/g, '')
    return digits.startsWith('0') ? `213${digits.slice(1)}` : digits
  }
  const value = normalizePurchaseValue(order.total_amount)
  if (order.currency !== 'DZD') throw new Error('invalid_purchase_currency')
  return {
    eventName: 'Purchase', eventTime: Math.floor(Date.now() / 1000), eventId: order.order_number,
    actionSource: 'website', eventSourceUrl: requestUrl, value, currency: order.currency, fbclid: attribution.fbclid,
    userData: {
      ph: customer?.phone ? [hash(normalizePhone(customer.phone))] : undefined,
      fn: customer?.fullName ? [hash(customer.fullName.replace(/\s+/g, ' '))] : undefined,
      fbp: attribution.fbp, fbc: attribution.fbc,
      client_ip_address: client?.clientIp, client_user_agent: client?.clientUserAgent,
    },
  }
}

export async function claimMetaPurchaseSend(orderId: string, eventId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('claim_meta_purchase_delivery', { p_order_id: orderId, p_event_id: eventId })
  if (error) throw error
  const claimed = Boolean(data)
  console.info('[MetaPurchase] claim_result', { order_id: orderId, event_id: eventId, claimed })
  if (!claimed) return false

  const { data: attempt, error: attemptError } = await getSupabaseAdmin()
    .from('meta_purchase_attempts')
    .select('id, order_number, event_id, status')
    .eq('order_id', orderId)
    .eq('event_id', eventId)
    .eq('status', 'claimed')
    .maybeSingle()
  if (attemptError) throw attemptError
  if (!attempt) {
    console.error('[MetaPurchase] audit_insert_missing', { order_id: orderId, event_id: eventId })
    throw new Error('meta_purchase_audit_insert_missing')
  }
  console.info('[MetaPurchase] audit_insert', { order_id: orderId, event_id: eventId, attempt_id: attempt.id })
  return true
}

export async function markMetaPurchaseSent(orderId: string, eventId: string, metaResponseStatus?: number) {
  const { error } = await getSupabaseAdmin().rpc('mark_meta_purchase_delivery_sent', {
    p_order_id: orderId,
    p_event_id: eventId,
    p_meta_response_status: metaResponseStatus ?? null,
  })
  if (error) throw error
}

export async function recordMetaPurchaseResult(orderId: string, eventId: string, status: 'failed' | 'skipped', metaResponseStatus?: number) {
  const { error } = await getSupabaseAdmin().rpc('record_meta_purchase_delivery_result', {
    p_order_id: orderId,
    p_event_id: eventId,
    p_status: status,
    p_meta_response_status: metaResponseStatus ?? null,
  })
  if (error) throw error
}

export async function markMetaPurchaseRequestSent(orderId: string, eventId: string) {
  const { error } = await getSupabaseAdmin().from('meta_purchase_attempts').update({ request_sent_at: new Date().toISOString() }).eq('order_id', orderId).eq('event_id', eventId).eq('status', 'claimed')
  if (error) throw error
}

export async function deliverConfirmedPurchase(orderId: string, eventSourceUrl: string): Promise<BrowserPurchase | null> {
  const db = getSupabaseAdmin()
  const { data: order, error: orderError } = await db.from('orders')
    .select('id, order_number, total_amount, currency, status, fbclid, fbp, fbc, customers(full_name, phone)')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) throw orderError
  if (!order || order.status !== 'confirmed') return null
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  const purchaseEvent = buildPurchaseEvent(order, eventSourceUrl, { phone: customer?.phone, fullName: customer?.full_name }, { fbclid: order.fbclid, fbp: order.fbp, fbc: order.fbc })
  const claimed = await claimMetaPurchaseSend(order.id, purchaseEvent.eventId)
  if (!claimed) return null
  try {
    await markMetaPurchaseRequestSent(order.id, purchaseEvent.eventId)
    const result = await sendPurchaseToConversionsApi(purchaseEvent)
    if (!result.sent) {
      await recordMetaPurchaseResult(order.id, purchaseEvent.eventId, 'skipped')
      return null
    }
    await markMetaPurchaseSent(order.id, purchaseEvent.eventId, result.metaResponseStatus)
    return { eventId: purchaseEvent.eventId, value: purchaseEvent.value, currency: purchaseEvent.currency }
  } catch (error) {
    const metaResponseStatus = error instanceof Error && 'metaResponseStatus' in error && typeof error.metaResponseStatus === 'number' ? error.metaResponseStatus : undefined
    try {
      await recordMetaPurchaseResult(order.id, purchaseEvent.eventId, 'failed', metaResponseStatus)
    } catch (auditError) {
      console.error('[MetaPurchase] result_record_failed', { order_id: order.id, event_id: purchaseEvent.eventId, error: auditError instanceof Error ? auditError.message : 'unknown_error' })
    }
    console.error('meta conversion event failed')
    return null
  }
}

export async function sendPurchaseToConversionsApi(event: PurchaseEvent) {
  const settings = await getIntegrationSettings().catch(() => null)
  const pixelId = settings?.meta_pixel_id || process.env.META_PIXEL_ID
  const accessToken = settings?.meta_capi_access_token || process.env.META_ACCESS_TOKEN
  const configured = Boolean(pixelId && accessToken)
  console.info('[MetaPurchase] capi_config', { event_id: event.eventId, configured })
  if (!pixelId || !accessToken) return { sent: false, configured: false }
  if (process.env.META_ATTRIBUTION_DEBUG === 'true') {
    let diagnosticUrl = 'invalid'
    try {
      const url = new URL(event.eventSourceUrl)
      diagnosticUrl = `${url.origin}${url.pathname}`
    } catch { /* keep the safe placeholder */ }
    console.info('meta attribution diagnostics', {
      fbclid: Boolean(event.fbclid),
      capi_fbp: Boolean(event.userData?.fbp),
      capi_fbc: Boolean(event.userData?.fbc),
      phone_matching: Boolean(event.userData?.ph?.length),
      event_id: event.eventId,
      event_source_url: diagnosticUrl,
    })
  }
  if (!validatePurchaseEvent(event)) {
    const invalidEvent = event as Partial<PurchaseEvent>
    const invalidEventId = typeof invalidEvent.eventId === 'string' ? invalidEvent.eventId : null
    const invalidValue = typeof invalidEvent.value === 'number' && Number.isFinite(invalidEvent.value) ? invalidEvent.value : null
    const invalidCurrency = typeof invalidEvent.currency === 'string' ? invalidEvent.currency : null
    console.error('meta_capi_invalid_purchase_event', { event_id: invalidEventId, value: invalidValue, currency: invalidCurrency })
    return { sent: false, configured: true, reason: 'invalid_purchase_event' }
  }
  const version = process.env.META_GRAPH_API_VERSION || 'v20.0'
  console.info('[MetaPurchase] capi_request', { event_id: event.eventId, graph_api_version: version })
  const response = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: [{ event_name: event.eventName, event_time: event.eventTime, event_id: event.eventId, action_source: event.actionSource, event_source_url: event.eventSourceUrl, user_data: event.userData, custom_data: { value: event.value, currency: event.currency } }] }), cache: 'no-store' })
  const responseBody = await response.json().catch(() => null) as { events_received?: unknown } | null
  console.info('[MetaPurchase] capi_response', { event_id: event.eventId, status: response.status, events_received: typeof responseBody?.events_received === 'number' ? responseBody.events_received : null })
  if (!response.ok) {
    console.error('meta_capi_request_failed', { status: response.status, event_id: event.eventId })
    const error = new Error('meta_capi_request_failed') as Error & { metaResponseStatus?: number }
    error.metaResponseStatus = response.status
    throw error
  }
  const accepted = typeof responseBody?.events_received === 'number' && responseBody.events_received > 0
  if (!accepted) {
    console.error('meta_capi_request_not_accepted', { status: response.status, event_id: event.eventId })
    const error = new Error('meta_capi_request_not_accepted') as Error & { metaResponseStatus?: number }
    error.metaResponseStatus = response.status
    throw error
  }
  return { sent: true, configured: true, metaResponseStatus: response.status }
}

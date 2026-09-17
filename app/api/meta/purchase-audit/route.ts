import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyAdminApi } from '@/lib/admin-auth'

export async function POST(request: Request) {
  if (!await verifyAdminApi(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : ''
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  if (!orderNumber || eventId !== orderNumber) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })

  const { data: order, error: orderError } = await getSupabaseAdmin().from('orders').select('status').eq('order_number', orderNumber).maybeSingle()
  if (orderError || order?.status !== 'confirmed') return NextResponse.json({ error: 'invalid_order' }, { status: 400 })

  const { data: recorded, error } = await getSupabaseAdmin().rpc('record_meta_purchase_browser_call', {
    p_order_number: orderNumber,
    p_event_id: eventId,
  })
  if (error) {
    console.error('meta browser purchase audit failed', { event_id: eventId })
    return NextResponse.json({ error: 'audit_failed' }, { status: 500 })
  }
  return NextResponse.json({ recorded: Boolean(recorded) })
}
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyAdminApi } from '@/lib/admin-auth'
import territories from '@/data/algeria-wilayas-communes.json'
export async function GET(request: Request) {
  if (!await verifyAdminApi(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const status = (url.searchParams.get('status') || '').trim()
  const sort = url.searchParams.get('sort') === 'asc' ? 'asc' : 'desc'
  const page = Number(url.searchParams.get('page') || '1')
  const pageSize = Number(url.searchParams.get('pageSize') || '20')
  const orderId = url.searchParams.get('orderId')
  if (orderId) {
    const { data: order, error } = await getSupabaseAdmin().from('orders').select('id, quantity, unit_price, total_amount').eq('id', orderId).maybeSingle()
    if (error || !order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
    return NextResponse.json({ order })
  }
  const allowed = ['new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned']
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || (status && !allowed.includes(status)) || q.length > 120) return NextResponse.json({ error: 'invalid_query' }, { status: 400 })
  const { data, error } = await getSupabaseAdmin().from('orders').select('*, customers(full_name, phone), products(name)').order('created_at', { ascending: sort === 'asc' })
  if (error) { console.error('admin order list failed', error); return NextResponse.json({ error: 'request_failed' }, { status: 500 }) }
  const filtered = (data ?? []).filter(order => { const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers; return (!status || order.status === status) && (!q || order.order_number.toLowerCase().includes(q.toLowerCase()) || String(customer?.full_name || '').toLowerCase().includes(q.toLowerCase()) || String(customer?.phone || '').includes(q)) })
  const from = (page - 1) * pageSize
  return NextResponse.json({ orders: filtered.slice(from, from + pageSize), pagination: { page, pageSize, total: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) } })
}
export async function PATCH(request: Request) {
  if (!await verifyAdminApi(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const allowed = ['new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned']
  if (!body || typeof body.orderId !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  if (typeof body.status === 'string') {
    if (!allowed.includes(body.status)) return NextResponse.json({ error: 'invalid_status' }, { status: 400 })
    const { data, error } = await getSupabaseAdmin().from('orders').update({ status: body.status }).eq('id', body.orderId).select('id, order_number, status').single()
    if (error) { console.error('admin order update failed', error); return NextResponse.json({ error: 'request_failed' }, { status: 500 }) }
    return NextResponse.json({ order: data })
  }
  const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
  const fullName = text(body.fullName); const phone = text(body.phone); const wilayaCode = text(body.wilayaCode)
  const commune = text(body.commune); const address = text(body.address); const sellerNotes = text(body.sellerNotes)
  const quantity = Number(body.quantity); const unitPrice = Number(body.unitPrice); const totalAmount = Number(body.totalAmount)
  const wilaya = territories.find(item => String(item.code) === wilayaCode)
  const validCommune = wilaya?.communes.find(item => item.ascii === commune)
  if (fullName.length < 2 || fullName.length > 120 || !phone || !wilaya || !validCommune || address.length < 3 || address.length > 300 || sellerNotes.length > 1000 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 || !Number.isInteger(unitPrice) || unitPrice < 0 || !Number.isInteger(totalAmount) || totalAmount < 0 || totalAmount !== quantity * unitPrice) return NextResponse.json({ error: 'invalid_order_details' }, { status: 400 })
  const db = getSupabaseAdmin(); const { data: order, error: orderLookupError } = await db.from('orders').select('customer_id').eq('id', body.orderId).maybeSingle()
  if (orderLookupError || !order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 })
  const { error: customerError } = await db.from('customers').update({ full_name: fullName, phone }).eq('id', order.customer_id)
  if (customerError) return NextResponse.json({ error: 'customer_update_failed' }, { status: 400 })
  const { data, error } = await db.from('orders').update({ quantity, unit_price: unitPrice, total_amount: totalAmount, wilaya: wilaya.ascii, commune: validCommune.ascii, address, seller_notes: sellerNotes || null }).eq('id', body.orderId).select('id, order_number, quantity, unit_price, total_amount, wilaya, commune, address, notes, seller_notes').single()
  if (error) { console.error('admin order details update failed', error); return NextResponse.json({ error: 'request_failed' }, { status: 500 }) }
  return NextResponse.json({ order: data, customer: { full_name: fullName, phone } })
}

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body.sessionId !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const sessionId = body.sessionId.trim()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  const db = getSupabaseAdmin()
  const { data: existing } = await db.from('abandoned_orders').select('status').eq('session_id', sessionId).maybeSingle()
  if (existing?.status === 'converted') return NextResponse.json({ saved: true })
  const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
  const payload = {
    session_id: sessionId,
    full_name: text(body.fullName, 120) || null,
    phone: text(body.phone, 30) || null,
    wilaya: text(body.wilaya, 80) || null,
    commune: text(body.commune, 120) || null,
    address: text(body.address, 300) || null,
    notes: text(body.notes, 1000) || null,
    last_seen_at: new Date().toISOString(),
    status: 'abandoned',
  }
  const { error } = await db.from('abandoned_orders').upsert(payload, { onConflict: 'session_id' })
  if (error) { console.error('abandoned order save failed'); return NextResponse.json({ error: 'save_failed' }, { status: 500 }) }
  return NextResponse.json({ saved: true })
}

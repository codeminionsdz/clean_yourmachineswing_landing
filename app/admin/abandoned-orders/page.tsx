import { requireAdmin } from '@/lib/admin-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { DeleteAbandonedOrderButton } from '@/components/delete-abandoned-order-button'

export default async function AbandonedOrdersPage() {
  await requireAdmin()
  const { data, error } = await getSupabaseAdmin().from('abandoned_orders').select('*').eq('status', 'abandoned').order('last_seen_at', { ascending: false })
  const rows = data ?? []
  return <main className="admin-content" dir="ltr"><section className="admin-panel"><h2>Abandoned orders</h2><p className="admin-muted">Customers who started the form but did not complete the order.</p>{error ? <div className="admin-error">Unable to load abandoned orders. Apply the Supabase migration first.</div> : rows.length === 0 ? <div className="admin-empty">No abandoned orders yet.</div> : <table className="admin-table"><thead><tr><th>Customer</th><th>Phone</th><th>Wilaya</th><th>Commune</th><th>Address</th><th>Customer note</th><th>Last activity</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.full_name || '—'}</td><td>{row.phone || '—'}</td><td>{row.wilaya || '—'}</td><td>{row.commune || '—'}</td><td>{row.address || '—'}</td><td>{row.notes || '—'}</td><td>{new Date(row.last_seen_at).toLocaleString()}</td><td><DeleteAbandonedOrderButton id={row.id}/></td></tr>)}</tbody></table>}</section></main>
}

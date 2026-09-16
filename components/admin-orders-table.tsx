'use client'

import Link from 'next/link'
import { useState } from 'react'

const statuses = ['new', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned']
type Order = { id: string; order_number: string; quantity: number; total_amount: number; status: string; created_at: string; wilaya: string; customer: { full_name?: string; phone?: string } | null }

export function AdminOrdersTable({ orders }: { orders: Order[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const allSelected = orders.length > 0 && selected.length === orders.length

  function toggle(id: string) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  function toggleAll() { setSelected(allSelected ? [] : orders.map(order => order.id)) }

  async function updateStatus(ids: string[], status: string) {
    if (!ids.length || busy) return
    setBusy(true)
    const response = await fetch('/api/admin/orders', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderIds: ids, status }) })
    setBusy(false)
    if (!response.ok) window.alert('Unable to update order status.')
    else window.location.reload()
  }

  async function remove(ids: string[]) {
    if (!ids.length || busy || !window.confirm(`Delete ${ids.length} order${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return
    setBusy(true)
    const response = await fetch('/api/admin/orders', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderIds: ids }) })
    setBusy(false)
    if (!response.ok) window.alert('Unable to delete orders.')
    else window.location.reload()
  }

  return <>
    {selected.length > 0 && <div className="admin-bulk-bar"><strong>{selected.length} selected</strong><select className="admin-select" defaultValue="" disabled={busy} onChange={event => { if (event.target.value) updateStatus(selected, event.target.value) }}><option value="">Change status...</option>{statuses.map(status => <option key={status}>{status}</option>)}</select><button className="admin-button danger" type="button" disabled={busy} onClick={() => remove(selected)}>Delete selected</button></div>}
    <table className="admin-table"><thead><tr><th><input aria-label="Select all orders" type="checkbox" checked={allSelected} onChange={toggleAll} /></th><th>Order number</th><th>Customer</th><th>Phone</th><th>Wilaya</th><th>Qty</th><th>Total</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td><input aria-label={`Select ${order.order_number}`} type="checkbox" checked={selected.includes(order.id)} onChange={() => toggle(order.id)} /></td><td><Link href={`/admin/orders/${order.id}`}>{order.order_number}</Link></td><td>{order.customer?.full_name}</td><td>{order.customer?.phone}</td><td>{order.wilaya}</td><td>{order.quantity}</td><td>{Number(order.total_amount).toLocaleString()} DZD</td><td><select className="admin-select admin-status-select" value={order.status} disabled={busy} onChange={event => updateStatus([order.id], event.target.value)}>{statuses.map(status => <option key={status}>{status}</option>)}</select></td><td>{new Date(order.created_at).toLocaleDateString()}</td><td><button className="admin-button danger admin-small-button" type="button" disabled={busy} onClick={() => remove([order.id])}>Delete</button></td></tr>)}</tbody></table>
  </>
}
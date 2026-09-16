'use client'

import { useState } from 'react'

export function DeleteAbandonedOrderButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false)
  async function remove() {
    if (busy || !window.confirm('Delete this abandoned order?')) return
    setBusy(true)
    const response = await fetch('/api/admin/abandoned-orders', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
    if (response.ok) window.location.reload()
    setBusy(false)
  }
  return <button className="admin-button danger" type="button" disabled={busy} onClick={remove}>{busy ? 'Deleting...' : 'Delete'}</button>
}
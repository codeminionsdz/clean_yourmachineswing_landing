'use client'
import { useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
export function AdminLogout() { const [busy, setBusy] = useState(false); return <button className="admin-button secondary" disabled={busy} onClick={async () => { setBusy(true); await getSupabaseBrowser().auth.signOut(); window.location.href = '/admin/login' }}>Logout</button> }

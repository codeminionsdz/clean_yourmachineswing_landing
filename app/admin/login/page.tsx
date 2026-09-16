'use client'
import { FormEvent, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase-browser'
import '../admin.css'
export default function AdminLogin() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); const { error } = await getSupabaseBrowser().auth.signInWithPassword({ email, password }); if (error) { setError('Invalid email or password.'); setBusy(false); return } window.location.href = '/admin' }
  return <main className="admin-login" dir="ltr"><form onSubmit={submit}><h1>yourmachinesewing Admin</h1><p>Sign in to manage orders and store operations.</p>{error && <div className="error">{error}</div>}<label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label><label>Password<input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label><button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form></main>
}

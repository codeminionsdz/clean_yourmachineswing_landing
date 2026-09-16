import 'server-only'
import { redirect } from 'next/navigation'
import { getSupabaseServer } from '@/lib/supabase-server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function requireAdmin() {
  const auth = await getSupabaseServer()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) redirect('/admin/login')
  const { data: admin, error } = await getSupabaseAdmin().from('admin_users').select('role').eq('user_id', user.id).maybeSingle()
  if (error || !admin) redirect('/admin/login?error=unauthorized')
  return { user, role: admin.role as 'owner' | 'admin' | 'operator' }
}

export async function verifyAdminApi(request: Request) {
  const auth = await getSupabaseServer()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const { data: admin } = await getSupabaseAdmin().from('admin_users').select('role').eq('user_id', user.id).maybeSingle()
  return admin ? { user, role: admin.role as 'owner' | 'admin' | 'operator' } : null
}

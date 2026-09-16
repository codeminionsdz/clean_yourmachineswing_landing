import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => { items.forEach(({ name, value }) => { request.cookies.set(name, value); response = NextResponse.next({ request }); response.cookies.set(name, value) }) } },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user && (request.nextUrl.pathname === '/admin' || request.nextUrl.pathname.startsWith('/admin/') && request.nextUrl.pathname !== '/admin/login')) return NextResponse.redirect(new URL('/admin/login', request.url))
  if (!user && request.nextUrl.pathname.startsWith('/api/admin/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  return response
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] }

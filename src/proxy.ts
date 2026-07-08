import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/session'

/**
 * The Next 16 proxy (the middleware rename; see
 * node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md).
 *
 * Coarse gate only: refresh the Supabase session on every matched
 * request and bounce signed-out visitors to /login. Membership and
 * permission checks live in the layouts, route handlers, and RLS; the
 * proxy never resolves scope.
 */

const PUBLIC_PATHS = ['/login', '/auth']

export async function proxy(req: NextRequest) {
  const { response, hasUser } = await updateSession(req)

  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!hasUser && !isPublic) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Everything except static assets and images.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}

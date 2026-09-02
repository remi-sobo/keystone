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

// Machine endpoints carry no session by design; each authenticates its
// own bearer secret inside the route and fails closed without it. A
// session bounce here would 307 their callers to /login. (FLAG, Phase 6
// recon: /api/digest, /api/notify, and /api/calendar/refresh sit behind
// the bounce today; latent only because their secrets are not set yet.
// Their carve-out is a one-line addition once confirmed wanted.)
const MACHINE_PATHS = ['/api/hub']

export async function proxy(req: NextRequest) {
  const { response, hasUser } = await updateSession(req)

  const { pathname } = req.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  const isMachine = MACHINE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  // The client hub's door (specs/epayl-fundraising-hub.md) renders
  // signed-out at /<org-slug>, and slugs are rows, not code, so the
  // coarse gate lets any single-segment path through. This narrows the
  // proxy only: every Keystone layout still bounces a signed-out
  // visitor itself (checked structurally), the hub layout 404s a slug
  // the door RPC does not know, and RLS reads zero rows regardless.
  const isDoorCandidate = /^\/[a-z0-9-]+$/.test(pathname)

  if (!hasUser && !isPublic && !isMachine && !isDoorCandidate) {
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

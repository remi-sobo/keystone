import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'

/**
 * Refreshes the Supabase session and reports whether the request carries
 * a signed-in user. Copied from BloomOS (ambition-angels
 * lib/supabase/middleware.ts).
 *
 * NEXT 16 NOTE: middleware was renamed to proxy (root file proxy.ts, same
 * behavior; see node_modules/next/dist/docs/01-app/01-getting-started/
 * 16-proxy.md). Ring 1 wires this helper from src/proxy.ts. The proxy is
 * a coarse gate only: membership and permission checks live in route
 * handlers plus RLS.
 */
export async function updateSession(req: NextRequest): Promise<{
  response: NextResponse
  hasUser: boolean
}> {
  let response = NextResponse.next({ request: req })

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return { response, hasUser: false }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
        response = NextResponse.next({ request: req })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { response, hasUser: !!user }
}

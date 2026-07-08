import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

/**
 * User-scoped Supabase client for Server Components, Route Handlers, and
 * Server Actions. Copied from the BloomOS cookie-auth stack
 * (ambition-angels lib/supabase/server.ts).
 *
 * Reads the session from request cookies; RLS applies to every query,
 * unlike lib/supabaseAdmin.ts which bypasses it. This is the ONLY data
 * client the client surface, app/(client), may use.
 *
 * In Server Components, cookie writes are unavailable. Token refresh is
 * handled by the root proxy (src/proxy.ts, wired in Ring 1; Next 16
 * renamed middleware to proxy), so the setAll failure here is safely
 * ignored.
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component context: the proxy refreshes sessions.
        }
      },
    },
  })
}

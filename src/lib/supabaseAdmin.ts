import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

/**
 * Service-role Supabase client. Copied from Trellis lib/supabaseAdmin.ts
 * with the scope nouns renamed for Keystone's two-level tenancy.
 *
 * SECURITY CONTRACT: read this before importing.
 *
 * 1. This client uses the SUPABASE_SERVICE_ROLE_KEY, which BYPASSES every
 *    Row Level Security policy. Any query made through this client can
 *    read or write any row in any table.
 *
 * 2. NEVER use this client in code that runs in the browser. Use the anon
 *    `supabase` export from lib/supabase.ts there. This file is server-only.
 *
 * 3. NEVER import this client anywhere under the client surface,
 *    app/(client) and its route handlers. That surface is pure-RLS by
 *    design (specs/keystone.md section 5) and a CI guard fails the build
 *    on any service-role import there.
 *
 * 4. Every practice-surface API route that imports this client MUST
 *    verify the caller first (lib/auth.ts: requirePracticeMember) BEFORE
 *    issuing any query.
 *
 * 5. Every query that touches scoped data MUST be scoped by the
 *    requesting user's practice_id, and by client_id where the row
 *    carries one, with both resolved server-side from the authenticated
 *    user. Trust nothing the client sends as a practiceId or clientId
 *    without a membership check. Practice A must not read Practice B,
 *    and Client A must not read Client B even inside one practice.
 *
 * 6. Do not create another service-role client elsewhere in the codebase.
 *    Always import this one. A single chokepoint makes the surface area
 *    auditable in one grep.
 *
 * Implementation note: the underlying client is lazily instantiated on
 * first property access via a Proxy. Build environments often do not
 * carry the production service-role key, and an eager createClient would
 * throw at module load and fail the build. Lazy init defers the key
 * check until an actual query runs, at which point a loud failure is
 * exactly what we want.
 */

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_client) return _client
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      '[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY is not set. Server-only operations cannot proceed without the service-role key.'
    )
  }
  _client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  return _client
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

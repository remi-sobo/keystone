import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Ring 2 isolation: sessions, availability_windows, google_connections.
 * Static policy pinning (the live half runs in the seeded matrix,
 * supabase/tests/isolation-seed.sql). The enumeration ratchet reads the
 * table names from this file.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const sql = norm(read('supabase/migrations/0003_ring2_sessions.sql'))

test.describe('sessions carry the two-level wall', () => {
  test('RLS is enabled on all three tables', () => {
    for (const t of ['sessions', 'availability_windows', 'google_connections']) {
      expect(sql.includes(`alter table public.${t} enable row level security`)).toBe(true)
    }
  })

  test('the sessions read policy carries both dimensions', () => {
    expect(sql).toMatch(
      /create policy sessions_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
  })

  test('booking writes go through the permission authority with the client dimension', () => {
    // Insert and update both demand engagement.write OR session.book,
    // and both calls carry client_id, so a client member's permission
    // can never reach another client's rows.
    expect(sql).toMatch(
      /create policy sessions_write[^;]*keystone_can\(practice_id, client_id, 'engagement\.write'\)[^;]*keystone_can\(practice_id, client_id, 'session\.book'\)/
    )
    expect(sql).toMatch(
      /create policy sessions_update[^;]*keystone_can\(practice_id, client_id, 'session\.book'\)/
    )
  })

  test('the double-booking wall is a DB exclusion constraint, not UI logic', () => {
    expect(sql).toContain('sessions_no_overlap')
    expect(sql).toMatch(/exclude using gist \( practice_id with =, tstzrange\(starts_at, ends_at\) with && \)/)
    expect(sql).toMatch(/where \(status in \('booked','held'\)\)/)
  })
})

test.describe('availability and busy intervals disclose minimally', () => {
  test('windows are readable practice-wide (clients need them to book) and consultant-written', () => {
    expect(sql).toMatch(
      /create policy availability_windows_read[^;]*is_practice_member\(practice_id\)[^;]*is_client_member_of_practice\(practice_id\)/
    )
    expect(sql).toMatch(
      /create policy availability_windows_write[^;]*keystone_can\(practice_id, null, 'engagement\.write'\)/
    )
  })

  test('keystone_busy_intervals returns bare intervals behind a membership check', () => {
    // SECURITY DEFINER with pinned search_path, membership predicate in
    // the body, and a column list that carries no identity.
    expect(sql).toMatch(
      /function public\.keystone_busy_intervals\(p_practice uuid\) returns table\(starts_at timestamptz, ends_at timestamptz\)[^$]*security definer[^$]*set search_path = ''/
    )
    expect(sql).toMatch(
      /is_practice_member\(p_practice\) or private\.is_client_member_of_practice\(p_practice\)/
    )
    expect(sql).toContain('revoke all on function public.keystone_busy_intervals(uuid) from public, anon')
  })
})

test.describe('google_connections is deny-all (tokens are credentials)', () => {
  test('zero policies on the token table', () => {
    expect(
      new RegExp('create policy [a-z0-9_"]* on (public\\.)?google_connections\\b').test(sql)
    ).toBe(false)
  })

  test('tokens are stored encrypted and only encrypted', () => {
    // The table has no plaintext token columns.
    expect(sql).toContain('access_token_enc')
    expect(sql).toContain('refresh_token_enc')
    expect(sql).not.toMatch(/access_token\s+text/)
    expect(sql).not.toMatch(/refresh_token\s+text/)
  })
})

test.describe('the calendar routes are practice-surface and safe', () => {
  test('connect and callback resolve membership and verify the signed state', () => {
    const connect = read('src/app/(practice)/api/calendar/connect/route.ts')
    expect(connect).toContain('requirePracticeMember')
    expect(connect).toContain('signOAuthState(ctx.userId)')

    const callback = read('src/app/(practice)/api/calendar/callback/route.ts')
    expect(callback).toContain('requirePracticeMember')
    expect(callback).toContain('verifyOAuthState')
    expect(callback).toContain('stateUid !== ctx.userId')
    expect(callback).toContain('encryptToken')
  })

  test('the client booking surface never touches the service role', () => {
    for (const f of [
      'src/app/(client)/sessions/actions.ts',
      // Slot assembly moved to lib in V2 3H (both surfaces use it); it
      // stays under this guard because the client surface imports it.
      'src/lib/slotAssembly.ts',
      'src/app/(client)/sessions/page.tsx',
    ]) {
      const src = stripJsComments(read(f))
      expect(src, `${f} must stay pure RLS`).not.toMatch(/supabaseadmin|service_role/i)
    }
  })

  test('booking validates the slot server-side and books only the resolved client', () => {
    const actions = read('src/app/(client)/sessions/actions.ts')
    expect(actions).toContain('isOfferedSlot')
    expect(actions).toContain('client_id: client.clientId')
    // The exclusion-constraint race is handled honestly.
    expect(actions).toContain("'23P01'")
  })
})

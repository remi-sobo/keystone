import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Ring 5 isolation: message_threads and messages. Static policy
 * pinning; the live half runs in the seeded matrix (cross-client and
 * cross-practice zero, forged authorship refused, the wrong wall
 * refused, body immutability, the notify RPC's minimal disclosure).
 * The enumeration ratchet reads the table names here.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const sql = norm(read('supabase/migrations/0007_ring5_messages.sql'))

test.describe('the two tables carry the wall', () => {
  test('RLS is enabled on both', () => {
    for (const t of ['message_threads', 'messages']) {
      expect(sql.includes(`alter table public.${t} enable row level security`)).toBe(true)
    }
  })

  test('reads carry both dimensions', () => {
    expect(sql).toMatch(
      /create policy message_threads_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
    expect(sql).toMatch(
      /create policy messages_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
  })

  test('you write only as yourself, from your own wall, inside your scope', () => {
    expect(sql).toMatch(/create policy messages_insert[^;]*author_user_id = auth\.uid\(\)/)
    expect(sql).toMatch(
      /create policy messages_insert[^;]*author_side = 'practice' and private\.is_practice_member\(practice_id\)/
    )
    expect(sql).toMatch(
      /create policy messages_insert[^;]*author_side = 'client'[^;]*is_member_of_client\(client_id\)[^;]*keystone_can\(practice_id, client_id, 'message\.write'\)/
    )
  })

  test('the client thread open rides the permission authority', () => {
    expect(sql).toMatch(
      /create policy message_threads_insert[^;]*keystone_can\(practice_id, client_id, 'message\.write'\)/
    )
    expect(sql).toContain("('client_member', 'message.write')")
  })

  test('a message body is immutable and undeletable to every session', () => {
    // Column-level grant: UPDATE narrows to read_at only.
    expect(sql).toContain('revoke update on public.messages from authenticated')
    expect(sql).toContain('grant update (read_at) on public.messages to authenticated')
    // No delete policy exists: the correspondence is a record.
    expect(sql).not.toMatch(/create policy [a-z0-9_]+ on public\.(messages|message_threads) for delete/)
  })
})

test.describe('the notify RPC is minimal disclosure', () => {
  test('membership-checked, pinned search_path, owner emails only, revoked from anon', () => {
    expect(sql).toMatch(
      /function public\.keystone_message_notify_targets\(p_engagement uuid\)[^$]*security definer/
    )
    expect(sql).toMatch(/keystone_message_notify_targets[^$]*set search_path = ''/)
    // The caller must be a member of the engagement's own client.
    expect(sql).toMatch(/cm\.user_id = auth\.uid\(\)/)
    expect(sql).toMatch(/pm\.role = 'owner'/)
    expect(sql).toContain(
      'revoke all on function public.keystone_message_notify_targets(uuid) from public, anon'
    )
  })
})

test.describe('the surfaces hold their enforcement model', () => {
  test('the client messages surface stays pure RLS', () => {
    for (const f of ['src/app/(client)/messages/page.tsx', 'src/app/(client)/messages/actions.ts']) {
      const src = stripJsComments(read(f))
      expect(src, `${f} must stay pure RLS`).not.toMatch(/supabaseadmin|service_role/i)
    }
  })

  test('both send paths are rate-limited and never fake a successful email', () => {
    const client = read('src/app/(client)/messages/actions.ts')
    const practice = read('src/app/(practice)/engagements/[id]/actions.ts')
    for (const src of [client, practice]) {
      expect(src).toContain('MESSAGES_PER_MIN')
      expect(src).toContain('MESSAGES_PER_HOUR')
      // The honest degrade: a saved message with a failed email says so.
      expect(src).toContain('sent_no_email')
    }
    // The client path gets its targets from the RPC, not a table read.
    expect(client).toContain('keystone_message_notify_targets')
  })
})

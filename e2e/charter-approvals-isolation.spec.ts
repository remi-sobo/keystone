import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 5D + 2A (specs/keystone-v2-approvals.md, keystone-v2-charter.md):
 * the approvals and engagement_charters walls in migration 0012, pinned
 * statically. The live half is the charter-and-approvals block at the
 * end of supabase/tests/isolation-seed.sql: cross-practice and
 * cross-client zero-reads, the draft wall, the trigger-stamped decide,
 * and immutability of decided approvals and published charters.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const sql = norm(read('supabase/migrations/0012_v2_approvals_charter.sql'))

test.describe('approvals: the record of assent', () => {
  test('both scoped ids ride the table and RLS is on', () => {
    expect(sql).toMatch(
      /create table if not exists public\.approvals \([^;]*practice_id uuid not null[^;]*client_id uuid not null[^;]*engagement_id uuid not null/
    )
    expect(sql).toContain('alter table public.approvals enable row level security')
  })

  test('the decider is stamped by trigger from the session, never the payload', () => {
    expect(sql).toContain('create or replace function private.approvals_stamp_decider')
    expect(sql).toMatch(/new\.decided_by := auth\.uid\(\)/)
    expect(sql).toMatch(/new\.decided_by_email := nullif\(auth\.jwt\(\) ->> 'email', ''\)/)
    // Sessions may write ONLY the decision status and the note.
    expect(sql).toContain('revoke update on public.approvals from authenticated')
    expect(sql).toContain('grant update (status, note_md) on public.approvals to authenticated')
  })

  test('updates exist only for pending rows, split by side', () => {
    expect(sql).toMatch(
      /create policy approvals_client_decide[^;]*status = 'pending' and private\.is_member_of_client\(client_id\)[^;]*status in \('approved','not_yet'\)/
    )
    expect(sql).toMatch(
      /create policy approvals_practice_withdraw[^;]*status = 'pending'[^;]*status = 'withdrawn'/
    )
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.approvals\s*for delete/)
  })
})

test.describe('engagement_charters: the versioned constitution', () => {
  test('drafts are invisible to client members by policy', () => {
    expect(sql).toMatch(
      /create policy engagement_charters_read[^;]*is_practice_member\(practice_id\)[^;]*status <> 'draft' and private\.is_member_of_client\(client_id\)/
    )
  })

  test('sessions edit drafts only; publish is a service-role transition', () => {
    expect(sql).toMatch(
      /create policy engagement_charters_update[^;]*using \(status = 'draft'[^;]*with check \(status = 'draft'/
    )
    expect(sql).toMatch(
      /create policy engagement_charters_insert[^;]*status = 'draft'/
    )
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.engagement_charters\s*for delete/)
  })

  test('one live published version per engagement, held by the database', () => {
    expect(sql).toMatch(
      /create unique index if not exists engagement_charters_one_published on public\.engagement_charters \(engagement_id\) where \(status = 'published'\)/
    )
    expect(sql).toContain('unique (engagement_id, version)')
  })
})

test.describe('the live matrix covers both walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')

  test('the seed asserts the draft wall, the stamped decide, immutability, and both scope walls', () => {
    expect(seed).toContain('LEAK: a client member reads a charter draft')
    expect(seed).toContain('the decide did not stamp the decider from the session')
    expect(seed).toContain('HOLE: a decided approval was re-decided')
    expect(seed).toContain('HOLE: the practice rewrote a decided approval')
    expect(seed).toContain('HOLE: a session flipped a charter draft to published')
    expect(seed).toContain('HOLE: member_a2 decided a sibling approval')
    expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a charters')
    expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 approvals')
    expect(seed).toContain('HOLE: a session deleted an approval')
  })
})

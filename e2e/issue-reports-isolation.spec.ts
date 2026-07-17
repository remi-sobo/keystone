import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Help FAB, the report half (specs/keystone-v2-help-fab.md): the
 * issue_reports table in migration 0036, pinned statically. The live
 * half is the issue-report block in supabase/tests/isolation-seed.sql:
 * both scope walls, the self-authorship wall, the cross-client forge
 * refusal, and the no-rewrite no-delete assertions that make "filed
 * means filed" structural.
 *
 * The report SURFACE assertions (pure RLS on the client action, the
 * notify RPC, rate limiting) land with the action itself in the next
 * commit of this branch.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const sql = norm(read('supabase/migrations/0036_v2_issue_reports.sql'))

test.describe('issue reports: the FAB report flow, walled and immutable', () => {
  test('both scoped ids ride the table and RLS is on', () => {
    expect(sql).toMatch(
      /create table if not exists public\.issue_reports \([^;]*practice_id uuid not null[^;]*client_id uuid not null/
    )
    expect(sql).toContain('alter table public.issue_reports enable row level security')
  })

  test('read carries both walls', () => {
    expect(sql).toMatch(
      /create policy issue_reports_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
  })

  test('you file only as yourself, from your own wall, inside your scope', () => {
    expect(sql).toMatch(/create policy issue_reports_insert[^;]*created_by = auth\.uid\(\)/)
    expect(sql).toMatch(
      /create policy issue_reports_insert[^;]*reported_side = 'client'[^;]*is_member_of_client\(client_id\)[^;]*keystone_can\(practice_id, client_id, 'issue\.write'\)/
    )
    expect(sql).toContain("('client_member', 'issue.write')")
  })

  test('ZERO update and ZERO delete policies: a report is a record', () => {
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.issue_reports\s*for update/)
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.issue_reports\s*for delete/)
  })
})

test.describe('the live matrix covers the issue-report walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')

  test('the seed asserts both scope walls, forged authorship, and immutability', () => {
    expect(seed).toContain('HOLE: a client member rewrote an issue report')
    expect(seed).toContain('HOLE: a client member deleted an issue report')
    expect(seed).toContain('HOLE: a client member forged issue authorship')
    expect(seed).toContain('HOLE: member_a2 filed into client_a1 scope')
    expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 issue reports')
    expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a issue reports')
  })
})

test.describe('the report surface holds its enforcement model', () => {
  const action = 'src/app/(client)/report/actions.ts'

  test('the client report action stays pure RLS', () => {
    const src = stripJsComments(read(action))
    expect(src, `${action} must stay pure RLS`).not.toMatch(/supabaseadmin|service_role/i)
  })

  test('the report path is rate-limited and gets its targets from the RPC', () => {
    const src = read(action)
    expect(src).toContain('ISSUE_REPORTS_PER_MIN')
    expect(src).toContain('ISSUE_REPORTS_PER_HOUR')
    // Targets come from the minimal-disclosure RPC, not a practice_members read.
    expect(src).toContain('keystone_message_notify_targets')
    // The report files as the caller, on the client wall, in their scope.
    expect(src).toContain("reported_side: 'client'")
    expect(src).toContain('created_by: viewer.user.id')
  })

  test('the honest email degrade is preserved (no fake success)', () => {
    const src = read(action)
    expect(src).toContain('emailed')
  })

  test('the FAB is mounted on the client surface only', () => {
    const clientLayout = read('src/app/(client)/layout.tsx')
    expect(clientLayout).toContain('HelpFab')
  })
})

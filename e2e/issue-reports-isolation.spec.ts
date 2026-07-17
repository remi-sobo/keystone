import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Help FAB reports (specs/keystone-v2-help-fab.md): the issue_reports
 * table (migration 0036) and its owner-only hardening (migration 0037),
 * pinned statically. The live half is the issue-report block in
 * supabase/tests/isolation-seed.sql: a client leader and a practice
 * consultant each file but cannot read; only the owner reads; the
 * cross-client and cross-practice walls hold; a filed report is a
 * record. The surface assertions pin the two report actions and the two
 * mounts.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const sql = norm(read('supabase/migrations/0036_v2_issue_reports.sql'))
const sql37 = norm(read('supabase/migrations/0037_v2_issue_reports_owner_only.sql'))

test.describe('issue reports: the table, walled and immutable', () => {
  test('practice_id rides the table and RLS is on', () => {
    expect(sql).toMatch(
      /create table if not exists public\.issue_reports \([^;]*practice_id uuid not null/
    )
    expect(sql).toContain('alter table public.issue_reports enable row level security')
  })

  test('you file only as yourself, from your own wall, inside your scope', () => {
    expect(sql).toMatch(/create policy issue_reports_insert[^;]*created_by = auth\.uid\(\)/)
    expect(sql).toMatch(
      /create policy issue_reports_insert[^;]*reported_side = 'client'[^;]*is_member_of_client\(client_id\)[^;]*keystone_can\(practice_id, client_id, 'issue\.write'\)/
    )
    expect(sql).toMatch(
      /create policy issue_reports_insert[^;]*reported_side = 'practice' and private\.is_practice_member\(practice_id\)/
    )
    expect(sql).toContain("('client_member', 'issue.write')")
  })

  test('a practice-authored report needs no engagement; a client one stays fully scoped', () => {
    expect(sql37).toContain('alter column engagement_id drop not null')
    expect(sql37).toContain('alter column client_id drop not null')
    expect(sql37).toMatch(
      /issue_reports_scope_shape check \(\s*\(reported_side = 'client' and client_id is not null and engagement_id is not null\)/
    )
  })

  test('ZERO update and ZERO delete policies: a report is a record', () => {
    for (const s of [sql, sql37]) {
      expect(s).not.toMatch(/create policy [a-z0-9_]* on public\.issue_reports\s*for update/)
      expect(s).not.toMatch(/create policy [a-z0-9_]* on public\.issue_reports\s*for delete/)
    }
  })
})

test.describe('read is the owner’s alone (migration 0037)', () => {
  test('the read policy asks the permission authority for issue.read', () => {
    expect(sql37).toMatch(
      /create policy issue_reports_read[^;]*keystone_can\(practice_id, null, 'issue\.read'\)/
    )
  })

  test('issue.read is granted to owner and to no other role', () => {
    expect(sql37).toContain("('owner', 'issue.read')")
    expect(sql37).not.toMatch(/\('consultant', 'issue\.read'\)/)
    expect(sql37).not.toMatch(/\('client_member', 'issue\.read'\)/)
  })

  test('the practice notify RPC is minimal disclosure', () => {
    expect(sql37).toMatch(
      /function public\.keystone_issue_notify_targets\(p_practice uuid\)[^$]*security definer/
    )
    expect(sql37).toMatch(/keystone_issue_notify_targets[^$]*set search_path = ''/)
    expect(sql37).toMatch(/caller\.user_id = auth\.uid\(\)/)
    expect(sql37).toMatch(/pm\.role = 'owner'/)
    expect(sql37).toContain(
      'revoke all on function public.keystone_issue_notify_targets(uuid) from public, anon'
    )
  })
})

test.describe('the live matrix covers the issue-report walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')

  test('a client leader and a consultant file but cannot read; only the owner reads', () => {
    expect(seed).toContain('LEAK: a client member reads issue reports (owner-only)')
    expect(seed).toContain('LEAK: a consultant reads issue reports (owner-only)')
    expect(seed).toContain('owner_a must read every report of their practice')
  })

  test('self-authorship, the cross-client forge, immutability, and both scope walls', () => {
    expect(seed).toContain('HOLE: a client member forged issue authorship')
    expect(seed).toContain('HOLE: member_a2 filed into client_a1 scope')
    expect(seed).toContain('HOLE: a session rewrote an issue report')
    expect(seed).toContain('HOLE: a session deleted an issue report')
    expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 issue reports')
    expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a issue reports')
  })
})

test.describe('the report surfaces hold their enforcement model', () => {
  const clientAction = 'src/app/(client)/report/actions.ts'
  const practiceAction = 'src/app/(practice)/report/actions.ts'

  test('the client report action stays pure RLS', () => {
    const src = stripJsComments(read(clientAction))
    expect(src, `${clientAction} must stay pure RLS`).not.toMatch(/supabaseadmin|service_role/i)
  })

  test('the client report path is rate-limited and files on the client wall', () => {
    const src = read(clientAction)
    expect(src).toContain('ISSUE_REPORTS_PER_MIN')
    expect(src).toContain('keystone_message_notify_targets')
    expect(src).toContain("reported_side: 'client'")
    expect(src).toContain('created_by: viewer.user.id')
    expect(src).toContain('emailed')
  })

  test('the practice report path files on the practice wall and emails the owner', () => {
    const src = read(practiceAction)
    expect(src).toContain('ISSUE_REPORTS_PER_MIN')
    expect(src).toContain("reported_side: 'practice'")
    expect(src).toContain('keystone_issue_notify_targets')
    expect(src).toContain('created_by: viewer.user.id')
    expect(src).toContain('emailed')
  })

  test('the FAB is on the client surface and a report button on the practice surface', () => {
    expect(read('src/app/(client)/layout.tsx')).toContain('HelpFab')
    expect(read('src/app/(practice)/layout.tsx')).toContain('PracticeReportFab')
  })
})

test.describe('the practice triage screen is the owner’s', () => {
  const page = 'src/app/(practice)/issues/page.tsx'

  test('the Reported issues page gates to the practice owner and reads issue_reports', () => {
    const src = read(page)
    expect(src).toContain("viewer.practice.role !== 'owner'")
    expect(src).toContain("from('issue_reports')")
  })

  test('the Issues nav item is owner-only and desktop-only', () => {
    const nav = read('src/components/nav.ts')
    expect(nav).toMatch(/role === 'owner'[\s\S]*href: '\/issues'/)
    expect(nav).not.toMatch(/href: '\/issues'[^}]*mobile: true/)
  })
})

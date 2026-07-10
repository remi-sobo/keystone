import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 3H (specs/keystone-v2-group-scheduling.md): the date poll. Pins
 * the 0018 shape (three scoped tables: session_polls,
 * session_poll_options, session_poll_marks; one open poll per
 * engagement; self-authored retractable marks; no client poll writes)
 * and the live matrix's assertions.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0018_v2_session_polls.sql'))
const seed = read('supabase/tests/isolation-seed.sql')

test('0018: three scoped tables, one open poll per engagement', () => {
  for (const t of ['session_polls', 'session_poll_options', 'session_poll_marks']) {
    expect(mig).toMatch(
      new RegExp(
        `create table if not exists public\\.${t}[\\s\\S]*?practice_id\\s+uuid not null[\\s\\S]*?client_id\\s+uuid not null`
      )
    )
    expect(mig).toContain(`alter table public.${t} enable row level security`)
  }
  expect(mig).toContain(
    "create unique index if not exists session_polls_one_open on public.session_polls (engagement_id) where (status = 'open')"
  )
  expect(mig).toContain('unique (option_id, client_member_id)')
})

test('0018: the practice writes polls; the client only marks, as itself, while open', () => {
  // Poll and option writes ride the permission authority.
  expect(mig).toMatch(/session_polls_insert[\s\S]*?keystone_can/)
  expect(mig).toMatch(/session_poll_options_insert[\s\S]*?keystone_can/)
  // No session deletes a poll or an option; closing is a status.
  expect(mig).not.toMatch(/create policy \S+ on public\.session_polls\s+for delete/)
  expect(mig).not.toMatch(/create policy \S+ on public\.session_poll_options\s+for delete/)
  // Marks: self-authored, scope-matched to the parent, open poll only.
  expect(mig).toMatch(
    /session_poll_marks_insert[\s\S]*?owns_client_membership\(client_member_id\)[\s\S]*?p\.status = 'open'/
  )
  expect(mig).toMatch(
    /session_poll_marks_delete[\s\S]*?owns_client_membership\(client_member_id\)[\s\S]*?p\.status = 'open'/
  )
  // Never edited, only placed and retracted.
  expect(mig).not.toMatch(/create policy \S+ on public\.session_poll_marks\s+for update/)
})

test('the live matrix asserts every wall of the poll', () => {
  expect(seed).toContain("member_a1 must read the teammate''s mark (the tally has names)")
  expect(seed).toContain("LEAK: a member forged a teammate''s poll mark")
  expect(seed).toContain("LEAK: a member deleted a teammate''s poll mark")
  expect(seed).toContain('a member must be able to retract their own mark')
  expect(seed).toContain('LEAK: a client member created a poll')
  expect(seed).toContain('LEAK: a client member added a poll option')
  expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 polls')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a polls')
  expect(seed).toContain('HOLE: a mark landed on a closed poll')
  expect(seed).toContain('HOLE: a mark was retracted from a closed poll')
})

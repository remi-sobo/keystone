import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 2C (specs/keystone-v2-outcomes.md): outcomes and outcome_evidence
 * in migration 0015, pinned statically. The live half is the outcomes
 * block in supabase/tests/isolation-seed.sql: both scope walls on both
 * tables, the client write walls, no session delete on outcomes, and
 * evidence-link removal never touching the artifact.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const sql = norm(read('supabase/migrations/0015_v2_outcomes.sql'))

test.describe('outcomes and evidence carry both walls', () => {
  test('both tables carry both scoped ids and RLS is on', () => {
    for (const t of ['outcomes', 'outcome_evidence']) {
      expect(sql).toMatch(
        new RegExp(
          `create table if not exists public\\.${t} \\([^;]*practice_id uuid not null[^;]*client_id uuid not null`
        )
      )
      expect(sql).toContain(`alter table public.${t} enable row level security`)
    }
  })

  test('reads are two-walled; writes are the practice authority', () => {
    for (const t of ['outcomes', 'outcome_evidence']) {
      expect(sql).toMatch(
        new RegExp(
          `create policy ${t}_read[^;]*is_practice_member\\(practice_id\\)[^;]*is_member_of_client\\(client_id\\)`
        )
      )
      expect(sql).toMatch(
        new RegExp(`create policy ${t}_insert[^;]*keystone_can\\(practice_id, null, 'engagement\\.write'\\)`)
      )
    }
  })

  test('outcomes never session-delete; evidence never edits', () => {
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.outcomes\s*for delete/)
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.outcome_evidence\s*for update/)
    expect(sql).toMatch(/create policy outcome_evidence_delete[^;]*keystone_can/)
  })

  test('evidence kinds are the record shapes and nothing else', () => {
    expect(sql).toMatch(
      /check \(kind in \('deliverable','session','action_item','decision'\)\)/
    )
  })
})

test.describe('the live matrix covers the outcome walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')

  test('the seed asserts both walls, the write walls, and the humane deletes', () => {
    expect(seed).toContain('HOLE: a client member wrote an outcome standing')
    expect(seed).toContain('HOLE: a client member created an outcome')
    expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 outcomes')
    expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a outcomes')
    expect(seed).toContain('HOLE: a session deleted an outcome')
    expect(seed).toContain('removing an evidence link must never touch the artifact')
  })
})

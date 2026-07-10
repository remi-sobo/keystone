import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 2B (specs/keystone-v2-decision-log.md): the decisions table in
 * migration 0013, pinned statically. The live half is the decision-log
 * block in supabase/tests/isolation-seed.sql: both scope walls, the
 * client insert wall, and the no-rewrite no-delete assertions that
 * make "logged means logged" structural.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const sql = norm(read('supabase/migrations/0013_v2_decision_log.sql'))

test.describe('decisions: immutable first-class rows', () => {
  test('both scoped ids ride the table and RLS is on', () => {
    expect(sql).toMatch(
      /create table if not exists public\.decisions \([^;]*practice_id uuid not null[^;]*client_id uuid not null/
    )
    expect(sql).toContain('alter table public.decisions enable row level security')
  })

  test('read carries both walls; insert is the practice authority', () => {
    expect(sql).toMatch(
      /create policy decisions_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
    expect(sql).toMatch(
      /create policy decisions_insert[^;]*keystone_can\(practice_id, null, 'engagement\.write'\)/
    )
  })

  test('ZERO update and ZERO delete policies: logged means logged', () => {
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.decisions\s*for update/)
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.decisions\s*for delete/)
  })

  test('supersession is a pointer on the successor, and 3A wiring is ready', () => {
    expect(sql).toContain('supersedes    uuid references public.decisions(id)'.replace(/\s+/g, ' ').toLowerCase())
    expect(sql).toMatch(/check \(source in \('manual','accepted_proposal'\)\)/)
    expect(sql).toContain('proposal_id')
  })
})

test.describe('the live matrix covers the decision walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')

  test('the seed asserts immutability on both sides and both scope walls', () => {
    expect(seed).toContain('HOLE: a session rewrote a logged decision')
    expect(seed).toContain('HOLE: a session deleted a logged decision')
    expect(seed).toContain('HOLE: a client member rewrote a decision')
    expect(seed).toContain('HOLE: a client member logged a decision')
    expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 decisions')
    expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a decisions')
  })
})

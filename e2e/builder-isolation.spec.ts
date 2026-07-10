import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 1B: the Engagement Builder's draft wall
 * (specs/keystone-v2-engagement-builder.md). engagement_drafts is a
 * practice-only table: a draft about a client must be invisible to
 * that client's own members, which is a cross-client and cross-practice
 * isolation guarantee proven live in supabase/tests/isolation-seed.sql
 * and pinned statically here.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const sql = norm(read('supabase/migrations/0010_v2_1b_engagement_drafts.sql'))

test.describe('engagement_drafts is practice-only by construction', () => {
  test('RLS is enabled and the read policy is practice membership alone', () => {
    expect(sql).toContain('alter table public.engagement_drafts enable row level security')
    expect(sql).toMatch(
      /create policy engagement_drafts_read[^;]*is_practice_member\(practice_id\)/
    )
  })

  test('no policy grants client members anything', () => {
    // The client-side predicates must not appear in any 0010 policy:
    // client_id on this table is a target reference, never a read grant.
    expect(sql).not.toMatch(/create policy[^;]*is_member_of_client/)
    expect(sql).not.toMatch(/create policy[^;]*is_client_member_of_practice/)
  })

  test('writes ride the engagement.write authority', () => {
    expect(sql).toMatch(
      /create policy engagement_drafts_insert[^;]*keystone_can\(practice_id, null, 'engagement\.write'\)/
    )
    expect(sql).toMatch(
      /create policy engagement_drafts_update[^;]*keystone_can\(practice_id, null, 'engagement\.write'\)/
    )
  })

  test('there is no delete policy: discard is a status', () => {
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.engagement_drafts\s*for delete/)
    expect(sql).toMatch(/check \(status in \('draft','published','discarded'\)\)/)
  })

  test('the denormalization rule holds: practice_id rides the table', () => {
    expect(sql).toMatch(
      /create table if not exists public\.engagement_drafts \([^;]*practice_id uuid not null/
    )
  })
})

test.describe('the live matrix covers the draft wall', () => {
  const seed = read('supabase/tests/isolation-seed.sql')

  test('the seed asserts the same-client zero-read, both write walls, and no delete', () => {
    expect(seed).toContain('LEAK: a client member reads a draft about their own client')
    expect(seed).toContain('HOLE: a client member wrote an engagement draft')
    expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a drafts')
    expect(seed).toContain('HOLE: a session deleted an engagement draft')
  })
})

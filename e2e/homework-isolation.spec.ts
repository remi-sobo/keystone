import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 3C (specs/keystone-v2-homework.md): the homework accountability
 * loop and its two walls. The V2-4 buyer wall is structural: the loop
 * state lives ONLY in homework_activity, whose read policy admits the
 * practice and the assigned coachee, never a teammate or buyer; the
 * item row keeps just open/done. The audience wall (3A-1, transferred
 * by 3C-5) hides internal practice tasks from client sessions. This
 * gate pins the 0017 shape and the live matrix's assertions.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0017_v2_homework_loop.sql'))
const seed = read('supabase/tests/isolation-seed.sql')

test('0017: the item row never carries loop state; the loop table is scoped', () => {
  // The three item columns land; status stays untouched (open/done).
  expect(mig).toContain('add column if not exists body_md text')
  expect(mig).toContain('add column if not exists review_requested boolean not null default false')
  expect(mig).toContain("check (audience in ('client','practice'))")
  expect(mig).not.toMatch(/alter table public\.action_items[\s\S]*?\bstatus\b/)
  // homework_activity carries the full denormalized scope.
  expect(mig).toMatch(
    /create table if not exists public\.homework_activity[\s\S]*?practice_id\s+uuid not null[\s\S]*?client_id\s+uuid not null/
  )
  expect(mig).toContain('alter table public.homework_activity enable row level security')
})

test('0017: the read policy is the V2-4 wall, not a membership read', () => {
  const readPolicy = mig.slice(
    mig.indexOf('create policy homework_activity_read'),
    mig.indexOf('create policy homework_activity_client_insert')
  )
  expect(readPolicy).toContain('owns_client_membership(ai.assigned_client_member_id)')
  // The one predicate that would hand the trail to every teammate and
  // buyer must NOT appear in the read policy.
  expect(readPolicy).not.toContain('is_member_of_client')
})

test('0017: the trail is append-only; the client write is self-authored coachee kinds', () => {
  expect(mig).not.toMatch(/create policy \S+ on public\.homework_activity\s+for update/)
  expect(mig).not.toMatch(/create policy \S+ on public\.homework_activity\s+for delete/)
  expect(mig).toContain("kind in ('comment','submission','blocked','unblocked')")
  expect(mig).toContain('private.owns_client_membership(author_client_member_id)')
  // The practice mirror stamps its own membership too.
  expect(mig).toContain('private.owns_practice_membership(author_practice_member_id)')
})

test('0017: the audience wall and the tightened check-off', () => {
  expect(mig).toContain("(audience = 'client' and private.is_member_of_client(client_id))")
  // A review item is never self-completed.
  expect(mig).toMatch(
    /action_items_checkoff[\s\S]*?owns_client_membership\(assigned_client_member_id\)\s+and review_requested = false/
  )
})

test('the live matrix asserts every wall of the loop', () => {
  // The headline: the same-client teammate reads zero trail rows.
  expect(seed).toContain("LEAK V2-4: a teammate reads a coachee''s homework trail")
  expect(seed).toContain("LEAK V2-4: a teammate wrote into a coachee''s loop")
  // Both classic dimensions.
  expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 homework trail')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a homework trail')
  // The audience wall, the self-completion wall, append-only, revocation.
  expect(seed).toContain('LEAK: client member reads an internal practice task')
  expect(seed).toContain('HOLE: a coachee self-completed a review item')
  expect(seed).toContain('HOLE: a coachee rewrote the trail')
  expect(seed).toContain('HOLE: a practice session rewrote the trail')
  expect(seed).toContain('LEAK: revoked client member reads their homework trail')
})

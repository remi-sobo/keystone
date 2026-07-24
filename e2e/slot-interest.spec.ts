import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Standing availability marks (0042): slot_interest, pick-a-date
 * without a poll. The client team marks times off the practice's live
 * offer, the operator confirms, the booking rides the 4I rails. This
 * gate pins the migration shape (both scope ids, the 0018 marks wall:
 * self-authored inserts on future times only, no update path), the
 * matrix assertions, and the surface contract on both sides: the
 * client surface marks instead of instant-booking, every mark and
 * every confirm re-verifies the server-recomputed offer, and confirm
 * sweeps the round.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const migration = norm(read('supabase/migrations/0042_slot_interest.sql'))
const matrix = read('supabase/tests/isolation-seed.sql')
const clientPage = read('src/app/(client)/sessions/page.tsx')
const clientActions = read('src/app/(client)/sessions/actions.ts')
const practicePage = read('src/app/(practice)/engagements/[id]/page.tsx')
const practiceActions = read('src/app/(practice)/engagements/[id]/actions.ts')

test('0042 carries both scope ids and the member key on slot_interest', () => {
  const body = migration.slice(migration.indexOf('create table if not exists public.slot_interest'))
  const head = body.slice(0, body.indexOf(');'))
  expect(head).toContain('practice_id uuid not null references public.practices(id)')
  expect(head).toContain('client_id uuid not null references public.clients(id)')
  expect(head).toContain('engagement_id uuid not null references public.engagements(id)')
  expect(head).toContain('client_member_id uuid not null references public.client_members(id)')
  expect(head).toContain('unique (engagement_id, client_member_id, starts_at, duration_minutes)')
})

test('0042 policies: both walls read, self-authored future inserts, no update path', () => {
  expect(migration).toContain('alter table public.slot_interest enable row level security')
  expect(migration).toContain(
    'create policy slot_interest_read on public.slot_interest for select to authenticated using ( private.is_practice_member(practice_id) or private.is_member_of_client(client_id) )'
  )
  expect(migration).toContain('private.owns_client_membership(client_member_id)')
  expect(migration).toContain('slot_interest.starts_at > now()')
  expect(migration).toContain('create policy slot_interest_delete on public.slot_interest')
  expect(migration).not.toContain('create policy slot_interest_update')
})

test('the matrix holds every slot_interest wall', () => {
  for (const pin of [
    "member_a1 must read the teammate''s availability mark",
    "LEAK: a member forged a teammate''s availability mark",
    'HOLE: an availability mark landed on a past time',
    "LEAK: a member marked into another client''s engagement",
    "LEAK: a member deleted a teammate''s availability mark",
    'a member must be able to retract their own availability mark',
    'LEAK cross-client: member_a2 reads client_a1 availability marks',
    'LEAK cross-practice: owner_b reads practice_a availability marks',
    "LEAK: a practice session authored a client''s availability mark",
    'the practice must sweep the round at confirm',
  ]) {
    expect(matrix).toContain(pin)
  }
})

test('the client surface marks the offer instead of instant-booking', () => {
  expect(clientPage).toContain('toggleSlotInterest')
  expect(clientPage).not.toMatch(/action=\{bookSession\}/)
  expect(clientPage).toContain('Pick the next time together')
  // Rescheduling an already-confirmed session keeps its direct path.
  expect(clientPage).toContain('rescheduleSession')
})

test('a mark only lands on a server-recomputed offered slot', () => {
  const action = clientActions.slice(clientActions.indexOf('export async function toggleSlotInterest'))
  expect(action).toContain('assembleSlots')
  expect(action).toContain('isOfferedSlot')
  expect(action).toContain("redirect('/sessions?state=slot_gone')")
})

test('the operator confirm re-verifies the offer, books on the 4I rails, and sweeps', () => {
  const action = practiceActions.slice(
    practiceActions.indexOf('export async function confirmSlotInterest')
  )
  const body = action.slice(0, action.indexOf('// ── Deliverable lifecycle'))
  expect(body).toContain('exactDurationMinutes: duration')
  expect(body).toContain('isOfferedSlot')
  expect(body).toContain('pushSessionById')
  expect(body).toContain("from('slot_interest')")
  expect(body).toContain('.delete()')
  expect(body).toContain('logAuditAction')
})

test('the practice page tallies marks and no longer opens polls', () => {
  expect(practicePage).toContain('confirmSlotInterest')
  expect(practicePage).toContain('no longer offered')
  expect(practicePage).not.toContain('action={createSessionPoll}')
})

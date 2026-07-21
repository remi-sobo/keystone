import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * The Confidence Check-in (0041): confidence_items, confidence_checkins,
 * confidence_participants, confidence_responses. This gate pins the
 * migration shape (both scope ids everywhere, the participant wall on
 * reads, self-authorship on response inserts, NO update or delete path
 * on responses), the live matrix's confidence assertions, and the
 * instrument seed (verbatim items, idempotency keys, voice rules), so
 * a coachee's self-rating can never quietly reach a founder, a
 * teammate, another client, or another practice.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const migration = norm(read('supabase/migrations/0041_confidence_checkins.sql'))
const matrix = read('supabase/tests/isolation-seed.sql')
const seed = read('supabase/seed-confidence-instrument.sql')

const TABLES = [
  'confidence_items',
  'confidence_checkins',
  'confidence_participants',
  'confidence_responses',
]

test('0041 carries both scope ids and RLS on all four confidence tables', () => {
  for (const table of TABLES) {
    const body = migration.slice(migration.indexOf(`create table if not exists public.${table}`))
    const head = body.slice(0, body.indexOf(');'))
    expect(head).toContain('practice_id uuid not null references public.practices(id)')
    expect(head).toContain('client_id uuid not null references public.clients(id)')
    expect(head).toContain('engagement_id uuid not null references public.engagements(id)')
    expect(migration).toContain(`alter table public.${table} enable row level security`)
  }
})

test('0041 reads are participant-walled, never is_member_of_client', () => {
  // The one client-side read predicate on the instrument and schedule
  // is the participant check; a founder or teammate on the same client
  // matches nothing.
  expect(migration).not.toContain('is_member_of_client')
  expect(migration).toContain(
    'create policy confidence_items_read on public.confidence_items for select to authenticated using ( private.is_practice_member(practice_id) or private.is_confidence_participant(engagement_id) )'
  )
  expect(migration).toContain(
    'create policy confidence_checkins_read on public.confidence_checkins for select to authenticated using ( private.is_practice_member(practice_id) or private.is_confidence_participant(engagement_id) )'
  )
  // Responses: the practice or the person, nobody else.
  expect(migration).toContain(
    'create policy confidence_responses_read on public.confidence_responses for select to authenticated using ( private.is_practice_member(practice_id) or private.owns_client_membership(client_member_id) )'
  )
})

test('0041 response inserts demand self-authorship, participation, an open check-in, and kind agreement', () => {
  const insert = migration.slice(
    migration.indexOf('create policy confidence_responses_insert'),
    migration.indexOf('-- no update policy')
  )
  expect(insert).toContain('private.owns_client_membership(client_member_id)')
  expect(insert).toContain('from public.confidence_participants')
  expect(insert).toContain('cc.opens_at <= current_date')
  expect(insert).toContain("ci.kind = 'scale' and confidence_responses.score is not null")
  expect(insert).toContain("ci.kind = 'text' and confidence_responses.text_answer is not null")
})

test('0041 responses are point-in-time: no update or delete policy, resubmission blocked by the unique key', () => {
  expect(migration).not.toContain('create policy confidence_responses_update')
  expect(migration).not.toContain('create policy confidence_responses_delete')
  expect(migration).toContain('unique (checkin_id, item_id, client_member_id)')
})

test('the live matrix asserts the confidence walls in every dimension', () => {
  for (const assertion of [
    'LEAK: a teammate/buyer reads a coachee',
    'LEAK: a non-participant teammate reads the confidence instrument',
    'HOLE: a non-participant inserted a confidence response',
    'HOLE: a teammate forged a response as the coachee',
    'HOLE: resubmission of the same check-in item was not blocked',
    'HOLE: a coachee answered a check-in before it opened',
    'HOLE: a coachee rewrote a submitted confidence response',
    'HOLE: an operator rewrote a confidence response',
    'HOLE: a client member inserted a confidence item',
    'LEAK cross-client: member_a2 reads client_a1 confidence responses',
    'LEAK cross-practice: owner_b reads practice_a confidence responses',
    'LEAK: a membershipless session reads confidence rows',
  ]) {
    expect(matrix).toContain(assertion)
  }
})

test('the instrument seed is idempotent, complete, and on the right people', () => {
  // Reuse, never duplicate: the three idempotency keys.
  expect(seed.toLowerCase()).toContain('on conflict (engagement_id, sort_order) do nothing')
  expect(seed.toLowerCase()).toContain('on conflict (engagement_id, label) do nothing')
  expect(seed.toLowerCase()).toContain('on conflict (engagement_id, client_member_id) do nothing')
  // Fifteen scale items, two open text items, in the fixed order.
  expect(seed.match(/'scale', \d+\)/g)).toHaveLength(15)
  expect(seed.match(/'text', \d+\)/g)).toHaveLength(2)
  for (const phrase of [
    'Make a direct ask for a specific dollar amount.',
    'Ask a donor for a multi-year commitment.',
    'Tell the impact story with evidence a funder would trust.',
    'Walk into a room of funders feeling like a partner, not someone asking for a favor.',
    'What feels most solid for you right now?',
    'What feels shakiest?',
  ]) {
    expect(seed).toContain(phrase)
  }
  // Seven check-ins: Baseline through Final, the agreement's cadence.
  for (const label of ['Baseline', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Final']) {
    expect(seed).toContain(`('${label}'`)
  }
  expect(seed).toContain("'2027-01-08', '2027-01-15'")
  // The two coachees by their real emails; never the test personas.
  expect(seed).toContain('aris@safespace.org')
  expect(seed).toContain('jasmine@safespace.org')
  expect(seed).not.toContain('remi+')
  expect(seed).not.toContain('susan@safespace.org')
  // The voice rule holds in everything client-visible.
  expect(seed).not.toContain('—')
})

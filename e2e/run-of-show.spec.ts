import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 3B (specs/keystone-v2-run-of-show.md): the run of show. Pins the
 * 0021 shape: the new session columns, the column grant that closes
 * the recon finding (a session may update exactly the reschedule
 * verbs), the session_reminder kind, and the live matrix and cron
 * contracts.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0021_v2_run_of_show.sql'))
const seed = read('supabase/tests/isolation-seed.sql')
const cron = read('src/app/api/notify/route.ts')
const clientActions = read('src/app/(client)/sessions/actions.ts')

test('0021: the structure columns land and the grant is exact', () => {
  for (const col of ['purpose text', 'agenda_md text', 'moves_to_stage text', 'reschedule_note text']) {
    expect(mig).toContain(`add column if not exists ${col}`)
  }
  expect(mig).toContain('moves_workstream_id uuid references public.workstreams(id)')
  expect(mig).toContain('revoke update on public.sessions from authenticated')
  expect(mig).toContain(
    'grant update (starts_at, ends_at, tz, status, updated_at, reschedule_note) on public.sessions to authenticated'
  )
  expect(mig).toContain("'session_reminder'")
})

test('the live matrix asserts the grant from both sides of the wall', () => {
  expect(seed).toContain('HOLE 3B: a client session wrote the run of show')
  expect(seed).toContain('HOLE 3B: a practice session wrote the run of show (service role only)')
  expect(seed).toContain('the reschedule note must stay a session write')
  expect(seed).toContain('the service role must write the run of show')
})

test('the reminder is one dedupe-keyed touch the day before, both sides', () => {
  expect(cron).toContain("kind: 'session_reminder' as const")
  expect(cron).toContain('dedupeKey: `session_reminder:${s.id}`')
  expect(cron).toContain('Tomorrow: ${s.purpose}')
})

test('reschedule shifts linked homework by the honest delta (gate 3B-2)', () => {
  expect(clientActions).toContain('shiftSessionHomework')
  // The old date is read BEFORE the update, so the delta is real.
  expect(clientActions).toMatch(/before\b[\s\S]*?starts_at[\s\S]*?isOfferedSlot/)
  const lib = read('src/lib/rescheduleShift.ts')
  expect(lib).toContain("in('timing', ['before_session', 'after_session'])")
  expect(lib).toContain("eq('status', 'open')")
  expect(lib).toContain('session.homework_shifted')
})

import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * The six-month roadmap (0038): engagement_phases and
 * engagement_sessions, the client's day-one map. This gate pins the
 * migration shape (both scope ids on every row, the 0011 policy shape:
 * practice full access, client SELECT only), the live matrix's roadmap
 * assertions, and the seed's idempotency guards, so the roadmap can
 * never quietly lose a wall or duplicate on re-run.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const migration = norm(read('supabase/migrations/0038_roadmap.sql'))
const seed = read('supabase/tests/isolation-seed.sql')

test('0038 carries both scope ids on both roadmap tables', () => {
  for (const table of ['engagement_phases', 'engagement_sessions']) {
    const body = migration.slice(migration.indexOf(`create table if not exists public.${table}`))
    const head = body.slice(0, body.indexOf(');'))
    expect(head).toContain('practice_id uuid not null references public.practices(id)')
    expect(head).toContain('client_id uuid not null references public.clients(id)')
    expect(head).toContain('engagement_id uuid not null references public.engagements(id)')
  }
})

test('0038 policies: practice full, client SELECT only, on both tables', () => {
  for (const table of ['engagement_phases', 'engagement_sessions']) {
    expect(migration).toContain(`alter table public.${table} enable row level security`)
    // The one policy that admits a client member is the read.
    expect(migration).toContain(
      `create policy ${table}_read on public.${table} for select to authenticated using ( private.is_practice_member(practice_id) or private.is_member_of_client(client_id) )`
    )
    // Writes are the practice's alone.
    for (const verb of ['insert', 'update', 'delete']) {
      expect(migration).toContain(`create policy ${table}_${verb} on public.${table}`)
    }
    const writes = migration
      .split('create policy')
      .filter((p) => p.startsWith(` ${table}_insert`) || p.startsWith(` ${table}_update`) || p.startsWith(` ${table}_delete`))
    expect(writes).toHaveLength(3)
    for (const p of writes) expect(p).not.toContain('is_member_of_client')
  }
})

test('0038 unique keys make the seed re-runnable without duplicates', () => {
  expect(migration).toContain(
    'create unique index if not exists engagement_phases_order_uniq on public.engagement_phases (engagement_id, sort_order)'
  )
  expect(migration).toContain(
    'create unique index if not exists engagement_sessions_code_uniq on public.engagement_sessions (engagement_id, code)'
  )
})

test('the live matrix asserts the roadmap walls in both dimensions', () => {
  expect(seed).toContain('member_a1 must read their own roadmap phase')
  expect(seed).toContain('HOLE: a client member wrote a roadmap session')
  expect(seed).toContain('HOLE: a client member inserted a roadmap phase')
  expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 roadmap phases')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a roadmap phases')
  expect(seed).toContain('LEAK: a membershipless session reads roadmap rows')
})

test('the SafeSpace roadmap seed is idempotent and complete', () => {
  const roadmap = read('supabase/seed-safespace-roadmap.sql')
  // Reuse, never duplicate: phases key on (engagement, sort_order) and
  // sessions on (engagement, code) via on conflict do nothing.
  expect(roadmap.toLowerCase()).toContain('on conflict (engagement_id, sort_order) do nothing')
  expect(roadmap.toLowerCase()).toContain('on conflict (engagement_id, code) do nothing')
  // The whole arc: six phases, twenty-eight sessions, exactly one
  // active (S1), verbatim phase titles from the scope and sequence.
  for (let i = 1; i <= 28; i++) {
    expect(roadmap).toContain(`'S${i}'`)
  }
  for (const title of [
    'Foundation & the Program',
    'The Budget & the Math of the Ask',
    'The Fundraising Plan',
    'The Season: Execution',
    'Peak & Operations',
    'Stabilize & Handoff',
  ]) {
    expect(roadmap).toContain(title)
  }
  expect(roadmap.match(/, 'active'\)/g)).toHaveLength(1)
  // Shannon joins the budget and operations sessions, Kendra the impact
  // touchpoints and the teach-back.
  expect(roadmap.match(/\+ Shannon/g)).toHaveLength(4)
  expect(roadmap.match(/\+ Kendra/g)).toHaveLength(3)
  // The voice rule holds in client-visible copy.
  expect(roadmap).not.toContain('—')
})

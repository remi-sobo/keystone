import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { session1Slides } from '../src/lib/deck/session1'

/**
 * Session deck slides (0039): session_slides, the presenter's system of
 * record. This gate pins the migration shape (both scope ids plus
 * engagement and session keys on every row, the 0038 policy shape:
 * practice full access, client SELECT only), the live matrix's deck
 * assertions, the seed's idempotency guard, and the seed's verbatim
 * agreement with the in-repo fixture, so the deck can never quietly
 * lose a wall, duplicate on re-run, or drift from the standalone file.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const migration = norm(read('supabase/migrations/0039_session_slides.sql'))
const matrix = read('supabase/tests/isolation-seed.sql')
const seed = read('supabase/seed-session1-deck.sql')

test('0039 carries both scope ids and both parent keys on session_slides', () => {
  const body = migration.slice(migration.indexOf('create table if not exists public.session_slides'))
  const head = body.slice(0, body.indexOf(');'))
  expect(head).toContain('practice_id uuid not null references public.practices(id)')
  expect(head).toContain('client_id uuid not null references public.clients(id)')
  expect(head).toContain('engagement_id uuid not null references public.engagements(id)')
  expect(head).toContain(
    'engagement_session_id uuid not null references public.engagement_sessions(id)'
  )
})

test('0039 policies: practice full, client SELECT only', () => {
  expect(migration).toContain('alter table public.session_slides enable row level security')
  expect(migration).toContain(
    'create policy session_slides_read on public.session_slides for select to authenticated using ( private.is_practice_member(practice_id) or private.is_member_of_client(client_id) )'
  )
  for (const verb of ['insert', 'update', 'delete']) {
    expect(migration).toContain(`create policy session_slides_${verb} on public.session_slides`)
  }
  const writes = migration
    .split('create policy')
    .filter(
      (p) =>
        p.startsWith(' session_slides_insert') ||
        p.startsWith(' session_slides_update') ||
        p.startsWith(' session_slides_delete')
    )
  expect(writes).toHaveLength(3)
  for (const p of writes) expect(p).not.toContain('is_member_of_client')
})

test('0039 slide types are the eight the renderer knows, unique key makes the seed re-runnable', () => {
  expect(migration).toContain(
    "check (slide_type in ('cover','section','idea','agenda','tracks','loop','homework','close'))"
  )
  expect(migration).toContain(
    'create unique index if not exists session_slides_order_uniq on public.session_slides (engagement_session_id, sort_order)'
  )
})

test('the live matrix asserts the deck walls in both dimensions', () => {
  expect(matrix).toContain('member_a1 must read their own deck slides')
  expect(matrix).toContain('HOLE: a client member wrote a deck slide')
  expect(matrix).toContain('HOLE: a client member inserted a deck slide')
  expect(matrix).toContain('LEAK cross-client: member_a2 reads client_a1 deck slides')
  expect(matrix).toContain('LEAK cross-practice: owner_b reads practice_a deck slides')
  expect(matrix).toContain('LEAK: a membershipless session reads deck slides')
})

test('the presenter enforces the walls at the route layer', () => {
  // The shell admits both memberships; the pages decide what each wall
  // may see. Practice: any of its own decks plus the fixture preview.
  // Client: a deck only once its session is done (Remi 2026-07-17), so
  // upcoming teaching stays in the room.
  const layout = read('src/app/(present)/layout.tsx')
  expect(layout).toContain('!viewer.practice && !viewer.client')
  const present = read('src/app/(present)/session/[id]/present/page.tsx')
  expect(present).toContain(
    "if (!viewer.practice && session.status !== 'done') redirect('/home')"
  )
  const preview = read('src/app/(present)/session/preview/page.tsx')
  expect(preview).toContain("if (!viewer.practice) redirect('/home')")
  // The client entry point mirrors the same wall: the roadmap link
  // renders only for a done session that has a deck.
  const roadmap = read('src/components/Roadmap.tsx')
  expect(roadmap).toContain("s.status === 'done' && s.has_deck")
})

test('the Session 1 deck seed is idempotent, complete, and verbatim to the fixture', () => {
  expect(seed.toLowerCase()).toContain(
    'on conflict (engagement_session_id, sort_order) do nothing'
  )
  // Fourteen rows in fixture order, each payload the exact fixture
  // slide minus its slide_type column.
  session1Slides.forEach((s, i) => {
    const { slide_type, ...payload } = s
    expect(seed).toContain(`(${i + 1}, '${slide_type}', '${JSON.stringify(payload)}')`)
  })
  // The voice rule holds in client-visible copy.
  expect(seed).not.toContain('—')
})

import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 client profile (specs/keystone-v2-client-profiles.md). The profile
 * is a practice-only composition riding the clients walls proven since
 * Ring 1; this gate pins the 0034 column-only shape, the owner-only
 * write, the money boundary (the fee is the engagement's own
 * fee_display, never a cross-engagement total), the client surface
 * staying clear of the new columns, and the live matrix's profile
 * assertions.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

test('0034 adds the four client-facts columns and nothing else', () => {
  const sql = norm(read('supabase/migrations/0034_v2_client_profile.sql'))
  expect(sql).toContain('alter table public.clients')
  expect(sql).toContain('add column if not exists relationship_note text')
  expect(sql).toContain('add column if not exists primary_contact_member_id uuid')
  expect(sql).toContain('references public.client_members(id) on delete set null')
  expect(sql).toContain('add column if not exists website text')
  expect(sql).toContain('add column if not exists relationship_started_on date')
  // Columns only: the clients walls already stand.
  expect(sql).not.toContain('create table')
  expect(sql).not.toContain('create policy')
  expect(sql).not.toMatch(/\bgrant\b/i)
})

test('the profile edit verifies owner and the client against the caller', () => {
  const actions = read('src/app/(practice)/clients/[id]/actions.ts')
  expect(actions).toContain("viewer.practice!.role !== 'owner'")
  expect(actions).toContain("from('clients')")
  expect(actions).toContain("eq('practice_id', viewer.practice!.practiceId)")
  // A chosen primary contact must belong to THIS client.
  expect(actions).toContain("from('client_members')")
  expect(actions).toContain("eq('client_id', client.id)")
  // The relationship note is voice-swept like every note we save.
  expect(actions).toContain('validateVoice')
})

test('the client surface never reads the new client-record columns', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name)
      return d.isDirectory() ? walk(p) : [p]
    })
  for (const f of walk(path.join(process.cwd(), 'src/app/(client)'))) {
    const src = fs.readFileSync(f, 'utf-8')
    for (const col of ['relationship_note', 'primary_contact_member_id', 'relationship_started_on']) {
      expect(src, `${f} must not read ${col}`).not.toContain(col)
    }
  }
})

test('the profile shows a single engagement fee, never a computed total', () => {
  const page = read('src/app/(practice)/clients/[id]/page.tsx')
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  // The fee is the engagement's own field, rendered per card.
  expect(code).toContain('e.fee_display')
  // No summing of fees across engagements, no money aggregate (checked
  // on code with comments stripped, so prose about the boundary is fine).
  expect(code).not.toMatch(/reduce\([^)]*fee/i)
  expect(code).not.toMatch(/fee[^;\n]*\+[^;\n]*fee/i)
  // The boundary is stated, pointing at Trellis.
  expect(page).toContain('Trellis')
})

test('/clients links each client into its profile with the health phrase', () => {
  const list = read('src/app/(practice)/clients/page.tsx')
  expect(list).toContain('/clients/${c.id}')
  expect(list).toContain('assembleHealth')
})

test('the live matrix asserts the profile read and the client write wall', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('member_a1 must read their own client profile row')
  expect(seed).toContain('HOLE client-profile: a client member wrote the client record')
  expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 profile row')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a client profile rows')
})

test('both surfaces share one health assembly (no drift)', () => {
  const lib = read('src/lib/healthInputs.ts')
  expect(lib).toContain('export function assembleHealth')
  for (const f of [
    'src/app/(practice)/clients/[id]/page.tsx',
    'src/app/(practice)/clients/page.tsx',
    'src/app/(practice)/engagements/page.tsx',
  ]) {
    expect(read(f)).toContain("from '@/lib/healthInputs'")
  }
})

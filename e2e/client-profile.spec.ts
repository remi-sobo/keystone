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

test('0034 creates a practice-only client_profiles table (never columns on clients)', () => {
  const raw = read('supabase/migrations/0034_v2_client_profile.sql')
  // Strip SQL line comments: the header prose names is_member_of_client
  // to explain why this table avoids it, which is not the DDL.
  const ddl = norm(raw.replace(/^\s*--.*$/gm, ''))
  // The facts live on their OWN table, not on the client-readable
  // clients row (RLS is row-level; a note on clients would leak to the
  // client member who can read their own client row).
  expect(ddl).toContain('create table if not exists public.client_profiles')
  expect(ddl).not.toContain('alter table public.clients')
  // Both scope dimensions carried (the per-feature gate).
  expect(ddl).toContain('client_id')
  expect(ddl).toContain('practice_id')
  expect(ddl).toContain('relationship_note text')
  expect(ddl).toContain('references public.client_members(id) on delete set null')
  // RLS on, and the read policy is practice-only: is_practice_member,
  // NEVER is_member_of_client (that is the leak this table avoids).
  expect(ddl).toContain('alter table public.client_profiles enable row level security')
  expect(ddl).toContain('is_practice_member(practice_id)')
  expect(ddl).not.toContain('is_member_of_client')
  // Writes are owner-only (practice.manage).
  expect(ddl).toMatch(/keystone_can\(practice_id, null, 'practice\.manage'\)/)
})

test('the profile edit verifies owner and the client against the caller', () => {
  const actions = read('src/app/(practice)/clients/[id]/actions.ts')
  expect(actions).toContain("viewer.practice!.role !== 'owner'")
  expect(actions).toContain("eq('practice_id', viewer.practice!.practiceId)")
  // The write lands on the practice-only table, upserted per client.
  expect(actions).toContain("from('client_profiles')")
  expect(actions).toContain('upsert')
  // A chosen primary contact must belong to THIS client.
  expect(actions).toContain("from('client_members')")
  expect(actions).toContain("eq('client_id', client.id)")
  // The relationship note is voice-swept like every note we save.
  expect(actions).toContain('validateVoice')
})

test('the client surface never touches the practice-only profile table', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name)
      return d.isDirectory() ? walk(p) : [p]
    })
  for (const f of walk(path.join(process.cwd(), 'src/app/(client)'))) {
    const src = fs.readFileSync(f, 'utf-8')
    for (const needle of ['client_profiles', 'relationship_note', 'primary_contact_member_id']) {
      expect(src, `${f} must not touch ${needle}`).not.toContain(needle)
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

test('the live matrix proves the profile is practice-only, both walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  // The client's OWN member reads nothing here (the axis the spec promises).
  expect(seed).toContain('LEAK client-profile: a client member reads the practice-only client profile')
  expect(seed).toContain('HOLE client-profile: a client member wrote the client profile')
  // Owner writes, consultant reads-not-writes, and both classic walls.
  expect(seed).toContain('HOLE client-profile: a consultant wrote the profile (owner-only)')
  expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 profile')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a client profile')
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

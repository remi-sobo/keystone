import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 5A (specs/keystone-v2-closeout.md): the closeout room. The gate
 * pins the walls: only the six sections are stored (the room READS
 * the record), drafts are invisible to the client by policy, no
 * delete exists, the sign-off rides 5D unchanged, and the matrix
 * proves the room from every seat.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('0031: six sections, the charter read pattern, no delete', () => {
  const mig = read('supabase/migrations/0031_v2_closeout.sql')
  for (const col of ['risks_md', 'ownership_md', 'maintenance_md', 'training_md', 'breaks_md', 'next_md']) {
    expect(mig).toContain(col)
  }
  expect(mig).toContain('create table if not exists public.closeouts')
  // Derived-room law: no copied outcome or deliverable columns on the
  // TABLE (comments explain the law; the 4F kind list downstream may
  // name deliverable_shipped).
  const tableDdl = mig
    .slice(0, mig.indexOf('alter table public.notifications'))
    .replace(/^\s*--.*$/gm, '')
  expect(tableDdl).not.toMatch(/outcome|deliverable_/)
  expect(mig).toContain("(status = 'published' and private.is_member_of_client(client_id))")
  expect(mig).not.toContain('for delete')
  // One per engagement.
  expect(mig).toContain('unique references public.engagements(id)')
})

test('the sign-off rides the 5D approvals primitive unchanged', () => {
  const actions = read('src/app/(practice)/engagements/[id]/closeout/actions.ts')
  expect(actions).toContain("subject_type: 'closeout'")
  expect(actions).toContain(".in('status', ['pending', 'approved'])")
  // Publish before asking; asked once.
  expect(actions).toContain("redirect(`${back}?state=publish_first`)")
  expect(actions).toContain("redirect(`${back}?state=already_asked`)")
  // Everything rides the session client here.
  expect(actions).not.toContain('supabaseAdmin')
})

test('the client room is pure RLS and the breaks section leads', () => {
  const page = read('src/app/(client)/closeout/page.tsx')
  expect(page).not.toContain('supabaseAdmin')
  const breaksAt = page.indexOf("'What to do if it breaks'")
  const risksAt = page.indexOf('Open risks')
  expect(breaksAt).toBeGreaterThan(-1)
  expect(risksAt).toBeGreaterThan(breaksAt)
  expect(page).toContain("value=\"/closeout\"")
})

test('the matrix proves the closeout walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('LEAK 5A: a client member reads a draft closeout')
  expect(seed).toContain('a published closeout must reach the client team')
  expect(seed).toContain('LEAK cross-client: member_b reads client_a closeout')
  expect(seed).toContain('HOLE 5A: a closeout was deleted')
})

import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 4B (specs/keystone-v2-internal-tasks.md): the internal-vs-client
 * split made legible. The wall itself shipped in 0017 and the live
 * matrix proves it; this gate pins the surfaces: internal tasks are
 * check-offs with no ceremony, the client reads our commitments but
 * never checks them off, and no new audience value snuck in.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('the 0017 wall stands unchanged: client sessions read client-audience rows only', () => {
  const mig = read('supabase/migrations/0017_v2_homework_loop.sql')
  expect(mig).toContain("check (audience in ('client','practice'))")
  expect(mig).toContain("or (audience = 'client' and private.is_member_of_client(client_id))")
  // No later migration widens the HOMEWORK audience enum (resources
  // grew its own audience wall in 0029; that one is 4H's, not ours).
  const migs = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'))
  for (const f of migs) {
    if (f.slice(0, 4) <= '0017') continue
    const body = read(`supabase/migrations/${f}`)
    const touchesItems =
      body.includes('action_items') && /audience in \(/.test(body)
    expect(touchesItems, `${f} must not touch the action_items audience check`).toBe(false)
  }
})

test('the practice page splits the lists and internal tasks get the plain check-off', () => {
  const page = read('src/app/(practice)/engagements/[id]/page.tsx')
  expect(page).toContain('Internal tasks')
  expect(page).toContain('completeInternalTask')
  expect(page).toContain('reopenInternalTask')
  expect(page).toContain('our commitment')
})

test('internal completes are silent: no trail rows, no notifications', () => {
  const actions = read('src/app/(practice)/engagements/[id]/actions.ts')
  const complete = actions.slice(
    actions.indexOf('export async function completeInternalTask'),
    actions.indexOf('export async function acceptHomework')
  )
  expect(complete).toContain("item.audience !== 'practice'")
  expect(complete).not.toContain('notify(')
  expect(complete).not.toContain('homework_activity')
  expect(complete).not.toContain('sendEmail')
})

test('the client reads our commitments, read-only, never mislabeled', () => {
  const page = read('src/app/(client)/homework/page.tsx')
  expect(page).toContain('With your consultant team')
  expect(page).toContain('assigned_practice_member_id')
  // The commitments list renders no form: nothing for the client to
  // check off on our behalf.
  const strip = page.slice(
    page.indexOf('With your consultant team'),
    page.indexOf('The team</h2>')
  )
  expect(strip).not.toContain('<form')
  // Pure RLS holds: the client surface never mentions the practice
  // audience value at all; the policy is the wall.
  expect(page).not.toContain("'practice'")
})

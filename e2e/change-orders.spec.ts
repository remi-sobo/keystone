import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 5E (specs/keystone-v2-change-orders.md): change orders. The gate
 * pins the V2-6 line structurally (no fee column, no numbers), the
 * one-pen-per-side policies, the required written answer, and the
 * matrix cases.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('0033: scope words only, one pen per side, no delete', () => {
  const mig = read('supabase/migrations/0033_v2_change_orders.sql')
  const ddl = mig.replace(/^\s*--.*$/gm, '')
  expect(mig).toContain('create table if not exists public.change_orders')
  expect(ddl).not.toMatch(/\b(fee|amount|price|budget|numeric|money)\b/i)
  // The client writes only an open, unanswered, self-authored ask.
  expect(mig).toContain("status = 'open'")
  expect(mig).toContain('response_md is null')
  expect(mig).toContain('private.owns_client_membership(requested_by_client_member_id)')
  // Only the practice updates; nobody deletes.
  expect(mig).not.toContain('for delete')
})

test('the answer is required in writing, agree or decline', () => {
  const actions = read('src/app/(practice)/engagements/[id]/actions.ts')
  const block = actions.slice(
    actions.indexOf('const ChangeOrderDecideShape'),
    actions.indexOf('export async function setEngagementOwner')
  )
  expect(block).toContain('response: z.string().trim().min(1).max(4000)')
  expect(block).toContain("z.enum(['agreed', 'declined'])")
  expect(block).toContain("kind: 'change_order_decided'")
})

test('the client ask lives where the scope lives, pure RLS', () => {
  const page = read('src/app/(client)/charter/page.tsx')
  expect(page).toContain('Outside the lines')
  expect(page).toContain('requestChangeOrder')
  const actions = read('src/app/(client)/charter/actions.ts')
  expect(actions).toContain("kind: 'change_order_requested'")
  expect(actions).not.toContain('supabaseAdmin')
})

test('the matrix proves the change-order walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('HOLE 5E: a client member wrote a pre-decided change order')
  expect(seed).toContain('a change order is a shared page for the whole client team')
  expect(seed).toContain('LEAK cross-client: member_b reads client_a change orders')
  expect(seed).toContain('HOLE 5E: a client member decided a change order')
  expect(seed).toContain('HOLE 5E: a change order was deleted')
  expect(seed).toContain(
    'LEAK cross-client same practice: member_a2 reads client_a1 change orders'
  )
})

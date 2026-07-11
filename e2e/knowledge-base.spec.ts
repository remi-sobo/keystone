import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 4H (specs/keystone-v2-knowledge-base.md): the knowledge base is
 * an audience wall on the one catalog, not a second table. The gate
 * pins the wall in the policy, the safe default, the two-shelf
 * authoring surface, the untouched client page, and the matrix cases.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('0029: one table, the audience wall in the read policy, default client', () => {
  const mig = read('supabase/migrations/0029_v2_knowledge_base.sql')
  expect(mig).not.toContain('create table')
  expect(mig).toContain("audience text not null default 'client'")
  expect(mig).toContain(
    "or (audience = 'client' and private.is_client_member_of_practice(practice_id))"
  )
  // The practice side of the policy is unconditional; the client side
  // carries the wall.
  expect(mig).toContain('private.is_practice_member(practice_id)')
})

test('the kind list grew the knowledge-base shapes, one list for both forms', () => {
  const kinds = read('src/app/(practice)/library/authoring/kinds.ts')
  for (const k of ['sop', 'agenda_template', 'homework_template', 'deliverable_template', 'prompt_recipe', 'diagnostic']) {
    expect(kinds).toContain(`'${k}'`)
  }
  expect(read('src/app/(practice)/library/authoring/page.tsx')).toContain('KIND_OPTIONS')
  expect(read('src/app/(practice)/library/authoring/[id]/page.tsx')).toContain('KIND_OPTIONS')
  // The actions enum matches.
  const actions = read('src/app/(practice)/library/authoring/actions.ts')
  expect(actions).toContain("audience: z.enum(['client', 'practice'])")
  expect(actions).toContain("'prompt_recipe'")
})

test('the authoring index reads as two shelves', () => {
  const page = read('src/app/(practice)/library/authoring/page.tsx')
  expect(page).toContain('Client learning path')
  expect(page).toContain('Knowledge base')
  expect(page).toContain("audience === 'practice'")
})

test('the client library is untouched in code: the policy is the wall', () => {
  const page = read('src/app/(client)/library/page.tsx')
  expect(page).not.toContain('audience')
})

test('the matrix carries the audience wall cases', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('LEAK 4H: a client member reads the practice knowledge base')
  expect(seed).toContain('member_a1 must still read the client learning path, exactly')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a knowledge base')
})

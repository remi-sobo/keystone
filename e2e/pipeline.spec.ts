import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 4G (specs/keystone-v2-pipeline.md): pipeline-lite behind the
 * flag, per decided CONFIRM V2-5. The gate pins the bright line
 * structurally: no money columns, flag default false, actions fail
 * closed, conversion goes through the builder, the nav stays clean
 * for SOBO, and the matrix carries the deals cases.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('0028: no money columns, flag defaults false, no delete policy', () => {
  const mig = read('supabase/migrations/0028_v2_pipeline.sql')
  expect(mig).toContain('pipeline_enabled boolean not null default false')
  // The V2-5 bright line, enforced by the schema: nowhere to put
  // money. The SQL comments may SAY money (they explain the line);
  // the DDL itself may not.
  const ddl = mig.replace(/^\s*--.*$/gm, '')
  expect(ddl).not.toMatch(/fee|amount|price|budget|numeric|money|revenue/i)
  expect(mig).toContain("keystone_can(practice_id, null, 'engagement.write')")
  expect(mig).not.toContain('for delete')
  // Practice-only: no client_id column (there is no client yet).
  expect(mig).not.toMatch(/client_id\s+uuid/)
})

test('every pipeline action fails closed on the flag, server-side', () => {
  const actions = read('src/app/(practice)/pipeline/actions.ts')
  expect(actions).toContain('guardPipeline')
  expect(actions).toContain("if (!practice?.pipeline_enabled) redirect('/today')")
  // Each exported action goes through the guard.
  const exported = actions.match(/export async function (\w+)/g) ?? []
  expect(exported.length).toBeGreaterThanOrEqual(3)
  for (const fn of ['addDeal', 'moveDeal', 'convertDeal']) {
    const body = actions.slice(actions.indexOf(`export async function ${fn}`))
    expect(body.slice(0, 400), `${fn} guards the flag`).toContain('guardPipeline()')
  }
})

test('conversion goes through the builder: a draft, never a live engagement', () => {
  const actions = read('src/app/(practice)/pipeline/actions.ts')
  const convert = actions.slice(actions.indexOf('export async function convertDeal'))
  expect(convert).toContain("from('engagement_drafts')")
  expect(convert).not.toContain("from('engagements')")
  expect(convert).toContain("deal.stage !== 'verbal_yes'")
})

test('the page carries the honest off state and the nav stays clean for SOBO', () => {
  const page = read('src/app/(practice)/pipeline/page.tsx')
  expect(page).toContain('Pipeline is off for this practice.')
  expect(page).not.toMatch(/fee|amount|price|\$|revenue/i)
  expect(read('src/components/nav.ts')).not.toContain('/pipeline')
})

test('the matrix carries the deals wall cases', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('LEAK 4G: a client member reads the practice pipeline')
  expect(seed).toContain('HOLE 4G: a client member wrote a deal')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a deals')
  expect(seed).toContain('HOLE 4G: a deal was deleted')
})

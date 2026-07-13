import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Planned deliverables (migration 0035): promises get structure. Pins
 * the two-state shape (a planned row can never smuggle a payload, a
 * shipped row can never lack one), the fulfill flip landing on the
 * SAME row, acceptance staying shipped-only, every record-shaped read
 * site filtering to shipped, and the SafeSpace ledger graduating out
 * of the practice-wide library (the last client-named row there).
 * RLS is deliberately untouched: both walls have been on deliverables
 * since 0006 and planned rows ride the same policies, so the existing
 * matrix cases cover them.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0035_v2_planned_deliverables.sql'))
const actions = read('src/app/(practice)/engagements/[id]/actions.ts')
const graduation = read('supabase/seed-planned-deliverables.sql')
const pilot = read('supabase/seed-safespace-pilot.sql')

test('0035: the two-state shape, no policy changes', () => {
  expect(mig).toContain("check (status in ('planned','shipped'))")
  expect(mig).toContain("default 'shipped'")
  // The shipped side keeps the 0006 payload law; the planned side
  // forbids every payload column and the delivered date.
  expect(mig).toMatch(
    /status = 'shipped'[\s\S]*?kind in \('file','link'\)[\s\S]*?delivered_on is not null[\s\S]*?kind = 'file' and storage_path is not null[\s\S]*?kind = 'link' and url is not null/
  )
  expect(mig).toMatch(
    /status = 'planned'[\s\S]*?kind is null[\s\S]*?storage_path is null[\s\S]*?url is null[\s\S]*?delivered_on is null/
  )
  // One wall, no drift: the migration touches no policy.
  expect(mig).not.toContain('create policy')
  expect(mig).not.toContain('drop policy')
})

test('the plan is payload-free and the fulfill flips the same row', () => {
  // planDeliverable inserts status planned with no artifact shape.
  expect(actions).toMatch(
    /planDeliverable[\s\S]*?status: 'planned',\s*kind: null,\s*delivered_on: null/
  )
  // The fulfill path verifies the planned row inside THIS engagement,
  // then updates it to shipped; no second row.
  expect(actions).toMatch(
    /eq\('id', d\.plannedId\)[\s\S]*?eq\('engagement_id', engagement\.id\)[\s\S]*?eq\('status', 'planned'\)[\s\S]*?\.update\(\{\s*status: 'shipped'/
  )
  // Acceptance is for what shipped; the request refuses a plan.
  expect(actions).toMatch(
    /requestDeliverableAcceptance[\s\S]*?eq\('status', 'shipped'\)[\s\S]*?subject_type: 'deliverable'/
  )
})

test('every record-shaped read filters to shipped', () => {
  // The corpus, search, export, digest, case-study facts, closeout
  // ledgers, profile count, and the client latest-deliverable cards
  // must never present a promise as a receipt.
  for (const rel of [
    'src/lib/qaCorpus.ts',
    'src/lib/recordSearch.ts',
    'src/lib/exportRecord.ts',
    'src/app/api/digest/route.ts',
    'src/app/(practice)/engagements/[id]/case-study/actions.ts',
    'src/app/(practice)/engagements/[id]/closeout/page.tsx',
    'src/app/(practice)/clients/[id]/page.tsx',
    'src/app/(client)/closeout/page.tsx',
    'src/app/(client)/home/page.tsx',
  ]) {
    const src = read(rel)
    if (!src.includes("from('deliverables')")) continue
    expect(src, `${rel} must filter deliverables to shipped`).toContain(
      ".eq('status', 'shipped')"
    )
  }
  // The two timelines split explicitly instead of filtering, so the
  // client sees what is coming and the practice manages the plan.
  expect(read('src/app/(client)/deliverables/page.tsx')).toContain("status === 'planned'")
  expect(read('src/app/(practice)/engagements/[id]/page.tsx')).toContain(
    "filter((d) => d.status === 'planned')"
  )
})

test('the ledger graduates and the placeholder never comes back', () => {
  // Every seed doc section 8 item becomes a planned row on its
  // workstream; the library placeholder leaves with the graduation.
  expect(graduation).toContain("'planned'")
  expect(graduation).toContain('Fundraising strategy and plan document')
  expect(graduation).toContain('Board fundraising toolkit and introductions playbook')
  expect(graduation).toContain('Operating rhythms documented for handoff')
  expect(graduation).toMatch(
    /delete from resources r\s*where r\.title = 'Planned deliverables: the SafeSpace ledger'/
  )
  // The pilot seed re-run cannot resurrect it (the charter pattern).
  expect(pilot).toMatch(
    /Planned deliverables: the SafeSpace ledger'[\s\S]*?and not exists \(\s*select 1 from deliverables d/
  )
  // The website stays a change order, never a promise.
  expect(graduation).not.toMatch(/insert[\s\S]*?\('Public website/i)
})

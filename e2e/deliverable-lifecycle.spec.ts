import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 3D (specs/keystone-v2-deliverables.md): the deliverable
 * lifecycle. Pins the 0022 shape (About and the session link,
 * append-only deliverable_versions, the approval_decided kind), the
 * acceptance riding the 5D approvals machinery unchanged, and the
 * humane-data rule: no viewed-by tracking anywhere, ever.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0022_v2_deliverable_lifecycle.sql'))
const seed = read('supabase/tests/isolation-seed.sql')
const actions = read('src/app/(practice)/engagements/[id]/actions.ts')

test('0022: About, the session link, and append-only versions', () => {
  expect(mig).toContain('add column if not exists about_md text')
  expect(mig).toContain('add column if not exists session_id uuid references public.sessions(id)')
  expect(mig).toMatch(
    /create table if not exists public\.deliverable_versions[\s\S]*?practice_id\s+uuid not null[\s\S]*?client_id\s+uuid not null/
  )
  expect(mig).toContain('unique (deliverable_id, version)')
  expect(mig).not.toMatch(/create policy \S+ on public\.deliverable_versions\s+for update/)
  expect(mig).not.toMatch(/create policy \S+ on public\.deliverable_versions\s+for delete/)
  expect(mig).toContain("'approval_decided'")
})

test('acceptance rides the 5D machinery: no new approval schema, the charter discipline', () => {
  // The request checks for a live ask and inserts subject_type
  // 'deliverable' through the session client.
  expect(actions).toContain("subject_type: 'deliverable'")
  expect(actions).toMatch(/requestDeliverableAcceptance[\s\S]*?in\('status', \['pending', 'approved'\]\)/)
  // The replace records the OUTGOING version before the pointer moves.
  expect(actions).toMatch(
    /replaceDeliverableFile[\s\S]*?deliverable_versions[\s\S]*?storage_path: row\.storage_path[\s\S]*?from\('deliverables'\)\s*\.update\(\{ storage_path: storagePath \}\)/
  )
  // The new path stays inside the engagement's own folder.
  expect(actions).toMatch(
    /replaceDeliverableFile[\s\S]*?startsWith\(`\$\{row\.practice_id\}\/\$\{row\.client_id\}\/\$\{row\.engagement_id\}\/`\)/
  )
})

test('viewed-by tracking does not exist (gate 3D-5)', () => {
  for (const dir of ['src/app', 'src/lib', 'supabase/migrations']) {
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
      )
    for (const f of walk(path.join(process.cwd(), dir))) {
      const src = fs.readFileSync(f, 'utf-8')
      expect(src, `${f} must not track views`).not.toMatch(/viewed_by|view_count|last_viewed/i)
    }
  }
})

test('the live matrix asserts the history walls and the stamped acceptance', () => {
  expect(seed).toContain('member_a1 must read their deliverable history')
  expect(seed).toContain('HOLE 3D: a session rewrote version history')
  expect(seed).toContain('HOLE 3D: a session deleted version history')
  expect(seed).toContain('HOLE 3D: a practice session rewrote version history')
  expect(seed).toContain('LEAK 3D: a client member recorded a version')
  expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 deliverable history')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a deliverable history')
  expect(seed).toContain('HOLE 3D: the acceptance was not identity-stamped by the trigger')
})

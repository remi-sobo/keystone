import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 3C-4 (specs/keystone-v2-homework.md, the agreed follow-up):
 * evidence files on the homework trail. The gate pins the walls: the
 * storage policies carry the SAME coachee wall as the trail (V2-4),
 * the one storage-write policy admits only the coachee's own open
 * item's exact path, the client upload rides the session (pure RLS),
 * and the matrix proves it from every seat.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('0030: the coachee wall at the storage layer, append-only', () => {
  const mig = read('supabase/migrations/0030_v2_homework_evidence_files.sql')
  // Read: practice by path, or the assigned coachee through their row.
  expect(mig).toContain('private.is_practice_member(private.try_uuid((storage.foldername(name))[1]))')
  expect(mig).toContain('private.owns_client_membership(ai.assigned_client_member_id)')
  // Insert: own OPEN client-audience item, exact scope path.
  expect(mig).toContain("ai.status = 'open'")
  expect(mig).toContain("ai.audience = 'client'")
  // Append-only: no update, no delete.
  expect(mig).not.toContain('for update')
  expect(mig).not.toContain('for delete')
})

test('the client upload rides the session client with manners', () => {
  const actions = read('src/app/(client)/homework/actions.ts')
  expect(actions).toContain('EVIDENCE_MAX_BYTES')
  expect(actions).toContain('EVIDENCE_MIME')
  expect(actions).toContain(".from('homework-evidence')")
  // Pure RLS: the client surface holds no service role (the standing
  // guard also enforces this tree-wide).
  expect(actions).not.toContain('supabaseAdmin')
})

test('downloads stream through session clients on both sides', () => {
  const client = read('src/app/(client)/homework/[id]/evidence/[activityId]/route.ts')
  expect(client).toContain('requireClientMember')
  expect(client).not.toContain('supabaseAdmin')
  const practice = read(
    'src/app/(practice)/engagements/[id]/homework/[itemId]/evidence/[activityId]/route.ts'
  )
  expect(practice).toContain('requirePracticeMember')
  expect(practice).not.toContain('supabaseAdmin')
})

test('the matrix proves the evidence wall from every seat', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('LEAK 3C-4: a teammate reads a coachee evidence file')
  expect(seed).toContain('HOLE 3C-4: a teammate uploaded to a coachee item')
  expect(seed).toContain('HOLE 3C-4: a coachee uploaded under an item not assigned to them')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a evidence files')
})

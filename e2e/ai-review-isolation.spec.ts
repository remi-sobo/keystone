import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { decisionLines, decisionsBlock, draftFromPayload } from '../src/lib/aiReview'

/**
 * V2 3A (specs/keystone-v2-ai-review.md): the editable review. Law
 * one, pinned here: the AI's payload is immutable from the moment it
 * lands, for EVERY writer including the service role; edits live in
 * edited_payload. Also exercises the pure reshaping helpers.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0019_v2_ai_review.sql'))
const seed = read('supabase/tests/isolation-seed.sql')

test('0019: the edited copy lands beside an immutable payload', () => {
  expect(mig).toContain('add column if not exists edited_payload jsonb')
  expect(mig).toContain('add column if not exists edited_at timestamptz')
  expect(mig).toContain('add column if not exists edited_by uuid')
  // The trigger rejects any UPDATE that changes payload.
  expect(mig).toContain('new.payload is distinct from old.payload')
  expect(mig).toContain('raise exception')
  expect(mig).toMatch(
    /create trigger ai_proposals_payload_immutable before update on public\.ai_proposals/
  )
  // No policy changes here: ai_proposals keeps zero session writes.
  expect(mig).not.toContain('create policy')
})

test('the live matrix asserts immutability against the service role itself', () => {
  expect(seed).toContain('HOLE: ai_proposals.payload was rewritten')
  expect(seed).toContain('edited_payload must accept the human copy')
  expect(seed).toContain('LEAK: a session wrote ai_proposals directly')
})

test('decision lines split from the blob and rebuild for the note', () => {
  expect(decisionLines('- one\n* two\n\n  three ')).toEqual(['one', 'two', 'three'])
  expect(
    decisionsBlock([
      { text: 'one', log: true, decided_on: '2026-07-10', who: 'Remi' },
      { text: '  ', log: true, decided_on: '2026-07-10', who: '' },
      { text: 'two', log: false, decided_on: '2026-07-10', who: '' },
    ])
  ).toBe('- one (Remi)\n- two')
})

test('the first draft mirrors the payload with humane defaults', () => {
  const draft = draftFromPayload(
    {
      summary_md: 'the summary',
      decisions_md: '- decided a thing',
      action_items: [{ title: 'do it', timing: 'weird' }],
    },
    '2026-07-09'
  )
  expect(draft.summary_md).toBe('the summary')
  // Log toggles default ON (gate 3A-3); the date defaults to the session.
  expect(draft.decisions).toEqual([
    { text: 'decided a thing', log: true, decided_on: '2026-07-09', who: '' },
  ])
  // Items default to client homework, unassigned, timing repaired.
  expect(draft.action_items[0]).toMatchObject({
    disposition: 'homework',
    assigned_client_member_id: null,
    timing: 'standing',
    review_requested: false,
  })
})

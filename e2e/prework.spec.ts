import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Session 1 pre-work (2026-07-17): two assignments riding the existing
 * 3C homework model, NO new tables. This gate pins the decisions that
 * matter: the seed is idempotent and lands on the right people, the
 * home card offers reflection with a done toggle and NOWHERE to type
 * (notes come to the session, never into the platform), and the
 * everyday homework lists skip before-session items so the featured
 * card says each thing once.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')

const seed = read('supabase/seed-safespace-prework.sql')
const card = read('src/components/PreworkCard.tsx')
const home = read('src/app/(client)/home/page.tsx')

test('the pre-work seed rides action_items, guarded for re-run', () => {
  expect(seed).not.toMatch(/create\s+table/i)
  expect(seed).toContain("'before_session'")
  // Idempotency: each insert refuses when the assignee already carries
  // the item.
  expect(seed.match(/where not exists/g)).toHaveLength(2)
  // The coachee item and the founder item, titles verbatim.
  expect(seed).toContain("'Pre-work: Seeing it clearly'")
  expect(seed).toContain("'Pre-work: What you see'")
  // The right people: coachees on A, the founder on B, with the remi+
  // personas mirroring for the live confirm.
  expect(seed).toContain("'aris@safespace.org', 'jasmine@safespace.org'")
  expect(seed).toContain("'susan@safespace.org', 'remi+susan@ambitionangels.org'")
  // The voice rule holds in client-visible copy.
  expect(seed).not.toContain('—')
})

test('the pre-work card has a done toggle and nowhere to type', () => {
  // The one write is the existing assignment-walled check-off.
  expect(card).toContain('setHomeworkStatus')
  // No input surface: the only inputs are the hidden form fields of the
  // toggle; no textarea, no text input, no editor.
  expect(card).not.toMatch(/<textarea/i)
  expect(card).not.toMatch(/type="text"/i)
  expect(card).not.toContain('MarkdownEditor')
  expect(card.match(/type="hidden"/g)?.length).toBe(2)
  // Done is a quiet state, not a vanishing act.
  expect(card).toContain('Mark it open again')
  expect(card).not.toContain('—')
})

test('the home says each pre-work item once', () => {
  // The featured card reads before-session items in every status...
  expect(home).toContain(".eq('timing', 'before_session')")
  // ...and the everyday open-homework list excludes them.
  expect(home).toContain(".neq('timing', 'before_session')")
  expect(home).toContain('PreworkCard')
})

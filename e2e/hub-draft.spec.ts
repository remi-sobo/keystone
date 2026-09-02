import { test, expect } from '@playwright/test'
import {
  buildThankYouRequest,
  checkHubVoice,
  extractDraft,
  groundedFigures,
} from '../src/lib/hubDraft'
import { modelForTask } from '../src/lib/claudeModel'

/**
 * The hub's drafting guardrails (specs/epayl-fundraising-hub.md,
 * phase six). The guardrails matter more than the prompt, so they are
 * pure and pinned: an ungrounded dollar figure fails the draft, the
 * community is never described by what it lacks, the job rides the
 * fast tier through the one chokepoint, and the draft is render-only.
 */

test('the request is the small job on the fast tier, with the constraints in the system prompt', () => {
  const req = buildThankYouRequest({
    orgName: 'Org H1',
    household: 'Larkspur Household',
    greeting: 'Dana And Kim',
    gifts: [{ amount_cents: 5000000, gift_date: '2025-10-13', designation: null, kind: 'cash' }],
    touches: [],
  })
  expect(req.task).toBe('hub_draft')
  expect(modelForTask('hub_draft')).toBe(modelForTask('voice_sweep'))
  expect(req.maxTokens).toBeLessThanOrEqual(500)
  expect(req.system).toContain('ONLY the dollar figures provided')
  expect(req.system).toContain('Never describe the community by what it lacks')
  expect(req.system).toContain('Nothing you write is sent automatically')
  const user = JSON.stringify(req.messages)
  expect(user).toContain('$50,000')
})

test('an ungrounded figure fails the draft; grounded and figure-free drafts pass', () => {
  const allowed = [5000000, 250000]
  expect(groundedFigures('Thank you for your gift of $50,000 in October.', allowed).ok).toBe(true)
  expect(groundedFigures('Your $2,500 and $50,000 both landed well.', allowed).ok).toBe(true)
  const bad = groundedFigures('Your generous $55,000 gift changed everything.', allowed)
  expect(bad.ok).toBe(false)
  expect(bad.ungrounded).toEqual(['$55,000'])
  expect(groundedFigures('Thank you for standing with these kids.', allowed).ok).toBe(true)
  // No allowed figures at all means any figure is ungrounded.
  expect(groundedFigures('Your $100 gift mattered.', []).ok).toBe(false)
})

test('the hub voice wall fails a draft that describes the community by what it lacks', () => {
  expect(checkHubVoice('Thank you for helping kids be known by name.').ok).toBe(true)
  for (const bad of [
    'Your gift helps at-risk youth in the area.',
    'These underserved kids need you.',
    'Thank you for giving back.',
    'We will continue the cultivation of this relationship.',
  ]) {
    expect(checkHubVoice(bad).ok, bad).toBe(false)
  }
})

test('extractDraft reads the text block and nothing else', () => {
  expect(extractDraft({ content: [{ type: 'text', text: '  A note.  ' }] })).toBe('A note.')
  expect(extractDraft({ content: [{ type: 'tool_use' }] })).toBe(null)
  expect(extractDraft({})).toBe(null)
})

import { test, expect } from '@playwright/test'
import {
  buildDigestRequest,
  hasDigestContent,
  mondayOf,
  parseDigest,
  DIGEST_TOOL,
  type DigestFacts,
} from '../src/lib/digest'

/**
 * Unit tests for the pure digest builder and parser (no network, no
 * DB). Pins the AI-safety shape: the forced tool, the facts-as-record
 * guard, the empty-week refusal, and the re-validated parse.
 */

const EMPTY: DigestFacts = {
  sessionsHeld: [],
  deliverablesShipped: [],
  homeworkDone: [],
  stageChanges: [],
  upcomingSessions: [],
}

const FULL: DigestFacts = {
  sessionsHeld: ['working session on Tue, Jul 7, 10:00 AM'],
  deliverablesShipped: ['Donor journey map (2026-07-06)'],
  homeworkDone: ['Draft the ask email'],
  stageChanges: ['Fundraising system moved to build'],
  upcomingSessions: ['working session on Tue, Jul 14, 10:00 AM'],
}

const CTX = { clientName: 'SafeSpace', engagementTitle: 'Fundraising engagement', weekOf: '2026-07-06' }

test('an empty week is refused before any model call', () => {
  expect(hasDigestContent(EMPTY)).toBe(false)
  // Upcoming sessions alone do not make a week: the digest reports what
  // happened, not what might.
  expect(hasDigestContent({ ...EMPTY, upcomingSessions: FULL.upcomingSessions })).toBe(false)
  expect(hasDigestContent(FULL)).toBe(true)
  expect(hasDigestContent({ ...EMPTY, homeworkDone: ['one thing'] })).toBe(true)
})

test('the request forces the submit tool on the digest tier', () => {
  const req = buildDigestRequest(FULL, CTX)
  expect(req.toolChoice).toEqual({ type: 'tool', name: DIGEST_TOOL })
  expect(req.tools).toHaveLength(1)
  expect(req.task).toBe('digest')
})

test('the facts ride as a record with the data-not-instructions guard', () => {
  const req = buildDigestRequest(FULL, CTX)
  const body = String(req.messages![0].content)
  expect(body).toContain('<week_record>')
  expect(body).toContain('Donor journey map')
  expect(req.system).toContain('never directives')
  expect(req.system).toContain('never invent')
  expect(req.system).toContain('never')
})

test('the parse re-validates and rejects anything but a clean submission', () => {
  const good = {
    content: [
      { type: 'text', text: 'prose noise' },
      {
        type: 'tool_use',
        name: DIGEST_TOOL,
        input: { subject: 'This week at SafeSpace', draft_md: 'A real week happened.' },
      },
    ],
  }
  expect(parseDigest(good)).toEqual({
    subject: 'This week at SafeSpace',
    draft_md: 'A real week happened.',
  })
  expect(parseDigest({ content: [] })).toBeNull()
  expect(
    parseDigest({ content: [{ type: 'tool_use', name: DIGEST_TOOL, input: { subject: '' } }] })
  ).toBeNull()
  expect(
    parseDigest({ content: [{ type: 'tool_use', name: 'wrong_tool', input: { subject: 'x', draft_md: 'y' } }] })
  ).toBeNull()
})

test('mondayOf pins the reported week', () => {
  expect(mondayOf(new Date('2026-07-10T22:00:00Z'))).toBe('2026-07-06') // a Friday
  expect(mondayOf(new Date('2026-07-06T00:00:00Z'))).toBe('2026-07-06') // Monday itself
  expect(mondayOf(new Date('2026-07-12T12:00:00Z'))).toBe('2026-07-06') // Sunday closes the week
})

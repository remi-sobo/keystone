import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { engagementHealth, replyLag, reviewStanding, type HealthInputs } from '../src/lib/health'

/**
 * V2 4E (specs/keystone-v2-health.md): engagement health in voice.
 * Derived at render, never stored, so the gate exercises the lib with
 * fixtures: every rung of the ladder, first-match-wins, the both-ways
 * responsiveness law, the client-never-member law, the vocabulary, and
 * the no-migration pin.
 */

const NOW = Date.parse('2026-07-11T12:00:00Z')
const daysAgoIso = (n: number) => new Date(NOW - n * 86400000).toISOString()

const QUIET: HealthInputs = {
  now: NOW,
  clientName: 'SafeSpace',
  finalStage: 'stabilize',
  workstreamStages: ['build', 'design'],
  stageEventAts: [],
  pastSessionAts: [],
  itemsDone: [],
  overdueUnsubmitted: 0,
  awaitingReviewSince: [],
  replyOwedByUsDays: null,
  replyOwedByClientDays: null,
  openPoll: null,
  digest: { cadence: 'weekly', sentInLastTwoWeeks: 0 },
}

test('rung 1: every workstream at the final stage reads ready for closeout', () => {
  const out = engagementHealth({
    ...QUIET,
    workstreamStages: ['stabilize', 'stabilize'],
    // Even with lower rungs firing, closeout wins (first match).
    overdueUnsubmitted: 2,
    stageEventAts: [daysAgoIso(2)],
  })
  expect(out.phrase).toBe('ready for closeout')
})

test('rung 2: an unanswered client message a day old reads waiting on us', () => {
  const out = engagementHealth({ ...QUIET, replyOwedByUsDays: 3, replyOwedByClientDays: null })
  expect(out.phrase).toBe('waiting on us')
})

test('rung 2: a submission standing a day reads waiting on us, and outranks rung 3', () => {
  const out = engagementHealth({
    ...QUIET,
    awaitingReviewSince: [daysAgoIso(2)],
    overdueUnsubmitted: 1,
  })
  expect(out.phrase).toBe('waiting on us')
})

test('rung 3: overdue review homework with no submission names the client, never a member', () => {
  const out = engagementHealth({ ...QUIET, overdueUnsubmitted: 1 })
  expect(out.phrase).toBe('waiting on SafeSpace')
})

test('rung 3: a poll open past three days with marks missing waits on the client; a full tally does not', () => {
  const stale = engagementHealth({
    ...QUIET,
    openPoll: { openedDaysAgo: 5, marks: 2, teamSize: 4 },
  })
  expect(stale.phrase).toBe('waiting on SafeSpace')
  const full = engagementHealth({
    ...QUIET,
    openPoll: { openedDaysAgo: 5, marks: 4, teamSize: 4 },
    stageEventAts: [daysAgoIso(5)],
  })
  expect(full.phrase).toBe('moving')
})

test('rung 4: a stage event inside three weeks reads moving', () => {
  const out = engagementHealth({ ...QUIET, stageEventAts: [daysAgoIso(20)] })
  expect(out.phrase).toBe('moving')
  const past = engagementHealth({ ...QUIET, stageEventAts: [daysAgoIso(22)] })
  expect(past.phrase).not.toBe('moving')
})

test('rung 5: no stage move but a session or homework inside the window holds steady', () => {
  const bySession = engagementHealth({ ...QUIET, pastSessionAts: [daysAgoIso(8)] })
  expect(bySession.phrase).toBe('holding steady')
  const byHomework = engagementHealth({
    ...QUIET,
    itemsDone: [{ dueOn: null, doneAt: daysAgoIso(10) }],
  })
  expect(byHomework.phrase).toBe('holding steady')
})

test('rung 6: quiet counts weeks from the last event of any kind, in words', () => {
  const out = engagementHealth({ ...QUIET, pastSessionAts: [daysAgoIso(30)] })
  expect(out.phrase).toBe('quiet for 4 weeks')
  const never = engagementHealth(QUIET)
  expect(never.phrase).toBe('not started yet')
})

test('the facts render in prose regardless of phrase', () => {
  const out = engagementHealth({
    ...QUIET,
    pastSessionAts: [daysAgoIso(8)],
    itemsDone: [
      { dueOn: daysAgoIso(10).slice(0, 10), doneAt: daysAgoIso(11) },
      { dueOn: daysAgoIso(6).slice(0, 10), doneAt: daysAgoIso(5) },
    ],
    digest: { cadence: 'weekly', sentInLastTwoWeeks: 2 },
  })
  expect(out.lines).toContain('last session 8 days ago')
  expect(out.lines).toContain('1 of 2 homework items on time this month')
  expect(out.lines).toContain('the digest went out both of the last two weeks')
})

test('a cadence set to off says nothing about digests', () => {
  const out = engagementHealth({ ...QUIET, digest: { cadence: 'off', sentInLastTwoWeeks: 0 } })
  expect(out.lines.some((l) => l.includes('digest'))).toBe(false)
})

test('responsiveness renders both ways or not at all (gate 4E-5)', () => {
  const neither = engagementHealth(QUIET)
  expect(neither.lines.some((l) => l.startsWith('replies:'))).toBe(false)
  const oneSide = engagementHealth({ ...QUIET, replyOwedByClientDays: 4 })
  expect(oneSide.lines).toContain('replies: none owed by us; one owed by them, 4 days standing')
  const both = engagementHealth({ ...QUIET, replyOwedByUsDays: 1, replyOwedByClientDays: 0 })
  expect(both.lines).toContain('replies: one owed by us, a day standing; one owed by them, from today')
})

test('replyLag: the newest message per thread decides who owes', () => {
  const out = replyLag(
    [
      // Thread A: client spoke last, three days ago. We owe.
      { threadId: 'a', authorSide: 'practice', createdAt: daysAgoIso(5) },
      { threadId: 'a', authorSide: 'client', createdAt: daysAgoIso(3) },
      // Thread B: we spoke last, two days ago. They owe.
      { threadId: 'b', authorSide: 'client', createdAt: daysAgoIso(4) },
      { threadId: 'b', authorSide: 'practice', createdAt: daysAgoIso(2) },
    ],
    NOW
  )
  expect(out).toEqual({ replyOwedByUsDays: 3, replyOwedByClientDays: 2 })
  expect(replyLag([], NOW)).toEqual({ replyOwedByUsDays: null, replyOwedByClientDays: null })
})

test('reviewStanding: submissions stand at their own timestamp, overdue counts the rest', () => {
  const submittedAt = daysAgoIso(2)
  const out = reviewStanding(
    [
      { id: 'i1', dueOn: '2026-07-01' }, // submitted, standing
      { id: 'i2', dueOn: '2026-07-01' }, // sent back, past due, no submission standing
      { id: 'i3', dueOn: '2026-08-01' }, // assigned, not yet due
    ],
    [
      { action_item_id: 'i1', kind: 'submission', created_at: submittedAt },
      { action_item_id: 'i2', kind: 'submission', created_at: daysAgoIso(6) },
      { action_item_id: 'i2', kind: 'send_back', created_at: daysAgoIso(4) },
    ],
    NOW
  )
  expect(out.awaitingReviewSince).toEqual([submittedAt])
  expect(out.overdueUnsubmitted).toBe(1)
})

test('the vocabulary is ours: no score, no percent, no grade, no red, no behind', () => {
  // The rendered output across a spread of states.
  const rendered = [
    engagementHealth(QUIET),
    engagementHealth({ ...QUIET, overdueUnsubmitted: 3, replyOwedByClientDays: 9 }),
    engagementHealth({ ...QUIET, workstreamStages: ['stabilize'], finalStage: 'stabilize' }),
  ]
    .flatMap((h) => [h.phrase, ...h.lines])
    .join(' ')
  expect(rendered).not.toMatch(/score|percent|grade|\bred\b|behind|%/i)
  // The CODE never scores either; the doc comment saying so may.
  const lib = fs
    .readFileSync(path.join(process.cwd(), 'src/lib/health.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  expect(lib).not.toMatch(/score|percent|grade|badge|behind/i)
  // No member ever surfaces: the lib never touches an email or a
  // member name (gate 4E-3).
  expect(lib).not.toMatch(/email|member_name|first_name/i)
})

test('4E shipped with no migration and no client surface (gates 4E-1, 4E-4)', () => {
  const migs = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'))
  expect(migs.some((f) => /health/i.test(f))).toBe(false)
  // The two practice surfaces compose through the lib.
  const index = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(practice)/engagements/page.tsx'),
    'utf-8'
  )
  const detail = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(practice)/engagements/[id]/page.tsx'),
    'utf-8'
  )
  expect(index).toContain('engagementHealth')
  expect(detail).toContain('engagementHealth')
  // Nothing under the client surface, the digest path, or the notify
  // chokepoint reads health.
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name)
      return d.isDirectory() ? walk(p) : [p]
    })
  const walled = [
    ...walk(path.join(process.cwd(), 'src/app/(client)')),
    path.join(process.cwd(), 'src/app/api/digest/route.ts'),
    path.join(process.cwd(), 'src/lib/notify.ts'),
  ]
  for (const f of walled) {
    expect(fs.readFileSync(f, 'utf-8')).not.toContain('lib/health')
  }
})

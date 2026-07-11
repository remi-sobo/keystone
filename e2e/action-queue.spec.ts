import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { ageInProse, buildActionQueue, GROUP_ORDER, type QueueInputs } from '../src/lib/actionQueue'

/**
 * V2 4A (specs/keystone-v2-action-queue.md): the action queue. Pure
 * composition, so the gate exercises the lib with fixtures: the group
 * order, the ready-to-move rule, the prep rule, the empty case, and
 * the no-scoring language. No migration exists for this epic, and a
 * test pins that too.
 */

const NOW = Date.parse('2026-07-11T12:00:00Z')

const EMPTY: QueueInputs = {
  now: NOW,
  unansweredThreads: [],
  submittedItems: [],
  digestDrafts: [],
  upcomingSessions: [],
  heldMoves: [],
  overdueInternal: [],
  stalled: [],
}

test('an empty day is an empty queue, not a zero score', () => {
  expect(buildActionQueue(EMPTY)).toEqual([])
})

test('groups come out in the approved order, empty groups omitted', () => {
  const out = buildActionQueue({
    ...EMPTY,
    stalled: [{ engagementId: 'e', title: 'Program Rhythm', clientName: 'SafeSpace' }],
    unansweredThreads: [
      { engagementId: 'e', clientName: 'SafeSpace', lastAt: '2026-07-09T12:00:00Z' },
    ],
    digestDrafts: [{ clientName: 'SafeSpace', weekOf: '2026-07-06' }],
  })
  expect(out.map((g) => g.group)).toEqual(['waiting', 'digest', 'followup'])
  const order = out.map((g) => GROUP_ORDER.indexOf(g.group))
  expect([...order].sort((a, b) => a - b)).toEqual(order)
})

test('the ready-to-move rule: a landed move says nothing', () => {
  const out = buildActionQueue({
    ...EMPTY,
    heldMoves: [
      {
        engagementId: 'e1',
        workstreamTitle: 'Program Rhythm',
        movesToStage: 'build',
        currentStage: 'design',
        clientName: 'SafeSpace',
      },
      {
        engagementId: 'e1',
        workstreamTitle: 'Board Rhythm',
        movesToStage: 'build',
        currentStage: 'build',
        clientName: 'SafeSpace',
      },
    ],
  })
  expect(out).toHaveLength(1)
  expect(out[0].group).toBe('move')
  expect(out[0].items).toHaveLength(1)
  expect(out[0].items[0].line).toContain('Program Rhythm')
  expect(out[0].items[0].line).toContain('the arc still says design')
})

test('the prep rule: purpose AND agenda make a run of show', () => {
  const session = {
    id: 's1',
    startsAt: '2026-07-14T17:00:00Z',
    tz: 'America/Los_Angeles',
    clientName: 'SafeSpace',
  }
  const missing = buildActionQueue({
    ...EMPTY,
    upcomingSessions: [
      { ...session, purpose: 'move the rhythm', agendaMd: null },
      { ...session, id: 's2', purpose: 'ready', agendaMd: '## agenda' },
    ],
  })
  expect(missing).toHaveLength(1)
  expect(missing[0].group).toBe('prep')
  expect(missing[0].items).toHaveLength(1)
  expect(missing[0].items[0].href).toBe('/sessions/s1/notes')
})

test('age renders in prose, never in color or count-up badges', () => {
  expect(ageInProse('2026-07-11T09:00:00Z', NOW)).toBe('since today')
  expect(ageInProse('2026-07-10T09:00:00Z', NOW)).toBe('for a day')
  expect(ageInProse('2026-07-08T09:00:00Z', NOW)).toBe('for 3 days')
  // The CODE never scores; the doc comment saying so is allowed to.
  const lib = fs
    .readFileSync(path.join(process.cwd(), 'src/lib/actionQueue.ts'), 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  expect(lib).not.toMatch(/score|percent|badge/i)
})

test('4A shipped with no migration (gate 4A-1)', () => {
  const migs = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'))
  expect(migs.some((f) => /action.?queue|0025/.test(f))).toBe(false)
  // The page composes through the lib.
  const page = fs.readFileSync(
    path.join(process.cwd(), 'src/app/(practice)/today/page.tsx'),
    'utf-8'
  )
  expect(page).toContain('buildActionQueue')
  expect(page).toContain('What needs you today')
  expect(page).toContain('Nothing needs you today. The room is quiet.')
})

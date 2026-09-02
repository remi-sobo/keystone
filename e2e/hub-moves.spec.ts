import { test, expect } from '@playwright/test'
import { chooseHomeMoves, CAPACITY_THRESHOLD_CENTS } from '../src/lib/hubMoves'
import type { MoveTask } from '../src/lib/hubMoves'

/**
 * HOME's rule-chosen moves (specs/epayl-fundraising-hub.md). The
 * ordering is code, not a model, so it is testable line by line:
 * pins hold, overdue stewardship leads, blockers next, then the
 * strategy furthest behind, then the oldest untouched high-capacity
 * relationship, never a do-not-contact household, never more than
 * three, and every move carries its reason.
 */

const task = (over: Partial<MoveTask>): MoveTask => ({
  id: over.id ?? 't1',
  title: over.title ?? 'A task',
  why: over.why ?? 'A reason',
  owner: over.owner ?? null,
  area: over.area ?? null,
  source: over.source ?? 'manual',
  due_date: over.due_date ?? null,
  due_label: over.due_label ?? null,
  pinned_slot: over.pinned_slot ?? null,
})

const base = {
  today: '2026-09-02',
  tasks: [] as MoveTask[],
  collateral: [],
  strategies: [],
  committedByStrategy: new Map<string, number>(),
  donors: [],
}

test('three, never more, and every move carries a reason', () => {
  const moves = chooseHomeMoves({
    ...base,
    tasks: Array.from({ length: 6 }, (_, i) =>
      task({ id: `t${i}`, title: `Task ${i}`, due_date: `2026-09-0${i + 1}` })
    ),
  })
  expect(moves.length).toBe(3)
  for (const m of moves) expect(m.why.length).toBeGreaterThan(0)
})

test('a pin holds its slot until unpinned', () => {
  const moves = chooseHomeMoves({
    ...base,
    tasks: [
      task({ id: 'a', title: 'Pinned into two', pinned_slot: 2 }),
      task({ id: 'b', title: 'Soonest', due_date: '2026-09-03' }),
      task({ id: 'c', title: 'Later', due_date: '2026-09-10' }),
    ],
  })
  expect(moves[1].title).toBe('Pinned into two')
  expect(moves[1].pinned).toBe(true)
})

test('overdue stewardship leads, a blocker follows, then the strategy furthest behind', () => {
  const moves = chooseHomeMoves({
    ...base,
    tasks: [
      task({ id: 's', title: 'Thank the big gift', area: 'Stewardship', due_date: '2026-08-01' }),
      task({ id: 'x', title: 'Ordinary task', due_date: '2026-09-03' }),
    ],
    collateral: [
      {
        name: 'Case for support',
        owner: 'Remi',
        due_date: null,
        status: 'missing',
        blocks: 'church asks and major donor follow-up',
      },
    ],
    strategies: [
      { id: 'g1', name: 'Grants', owner: null, goal_cents: 1000000, next_move: 'Ask about the door' },
      { id: 'g2', name: 'Brunch', owner: null, goal_cents: 1000000, next_move: 'Pick the host' },
    ],
    committedByStrategy: new Map([
      ['g1', 0],
      ['g2', 900000],
    ]),
  })
  expect(moves[0].title).toBe('Thank the big gift')
  expect(moves[1].verb).toBe('UNBLOCK')
  expect(moves[1].why).toContain('Blocks church asks')
  // Grants is 100 percent behind; brunch only 10 percent.
  expect(moves[2].title).toBe('Ask about the door')
})

test('the untouched-relationship rule respects the wall and the floor', () => {
  const donors = [
    {
      id: 'd1',
      household: 'Flagged Household',
      capacity_5yr_cents: CAPACITY_THRESHOLD_CENTS * 2,
      do_not_contact: true,
      last_gift_date: '2010-01-01',
      touched: false,
    },
    {
      id: 'd2',
      household: 'Small Household',
      capacity_5yr_cents: 100,
      do_not_contact: false,
      last_gift_date: '2009-01-01',
      touched: false,
    },
    {
      id: 'd3',
      household: 'Quiet Household',
      capacity_5yr_cents: CAPACITY_THRESHOLD_CENTS,
      do_not_contact: false,
      last_gift_date: '2012-01-01',
      touched: false,
    },
  ]
  const moves = chooseHomeMoves({ ...base, donors })
  expect(moves.length).toBe(1)
  expect(moves[0].title).toContain('Quiet Household')
  expect(moves[0].title).not.toContain('Flagged')
})

test('a strategy with nothing to say suggests nothing: no move is invented', () => {
  const moves = chooseHomeMoves({
    ...base,
    strategies: [{ id: 'g1', name: 'Grants', owner: null, goal_cents: 1000000, next_move: null }],
    committedByStrategy: new Map([['g1', 0]]),
  })
  expect(moves.length).toBe(0)
})

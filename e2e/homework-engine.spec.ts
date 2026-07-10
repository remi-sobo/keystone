import { test, expect } from '@playwright/test'
import { deriveLoopState, loopStatesByItem } from '../src/lib/homework'

/**
 * V2 3C: the derived loop state (gate 3C-2). Pure function, so the
 * gate exercises the state machine directly: newest state-changing row
 * wins, comments never move state, and an unblock clears every older
 * block on the way down.
 */

const at = (i: number) => `2026-07-${String(i).padStart(2, '0')}T12:00:00Z`
const ev = (kind: string, i: number) => ({ kind, created_at: at(i) })

test('an untouched item is assigned; comments never move state', () => {
  expect(deriveLoopState([])).toBe('assigned')
  expect(deriveLoopState([ev('comment', 1), ev('comment', 2)])).toBe('assigned')
  expect(deriveLoopState([ev('submission', 1), ev('comment', 2)])).toBe('submitted')
})

test('the loop: submit, send back, resubmit, accept', () => {
  expect(deriveLoopState([ev('submission', 1)])).toBe('submitted')
  expect(deriveLoopState([ev('submission', 1), ev('send_back', 2)])).toBe('needs_revision')
  expect(deriveLoopState([ev('submission', 1), ev('send_back', 2), ev('submission', 3)])).toBe(
    'submitted'
  )
  expect(
    deriveLoopState([ev('submission', 1), ev('send_back', 2), ev('submission', 3), ev('acceptance', 4)])
  ).toBe('accepted')
})

test('blocked wins while standing; an unblock falls through to the state beneath', () => {
  expect(deriveLoopState([ev('submission', 1), ev('blocked', 2)])).toBe('blocked')
  expect(deriveLoopState([ev('submission', 1), ev('blocked', 2), ev('unblocked', 3)])).toBe(
    'submitted'
  )
  expect(deriveLoopState([ev('blocked', 1), ev('unblocked', 2)])).toBe('assigned')
  // A fresh block after an old unblock still blocks.
  expect(deriveLoopState([ev('blocked', 1), ev('unblocked', 2), ev('blocked', 3)])).toBe('blocked')
  // A new submission clears the standing block by itself.
  expect(deriveLoopState([ev('blocked', 1), ev('submission', 2)])).toBe('submitted')
})

test('grouping derives each item independently', () => {
  const states = loopStatesByItem([
    { action_item_id: 'a', ...ev('submission', 1) },
    { action_item_id: 'b', ...ev('blocked', 1) },
    { action_item_id: 'a', ...ev('acceptance', 2) },
  ])
  expect(states.get('a')).toBe('accepted')
  expect(states.get('b')).toBe('blocked')
  expect(states.get('c')).toBeUndefined()
})

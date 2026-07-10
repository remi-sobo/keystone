/**
 * lib/homework.ts
 *
 * The homework loop state, derived (V2 3C, gate 3C-2). The item row
 * carries only open/done because every client member can read it; the
 * granular state lives in homework_activity behind the V2-4 wall, so
 * the loop state is computed from the trail, never stored on the item.
 * Pure functions: no client, no I/O.
 */

export type LoopEvent = { kind: string; created_at: string }

export type LoopState = 'assigned' | 'submitted' | 'needs_revision' | 'blocked' | 'accepted'

/**
 * Newest state-changing row wins. Comments never change state; an
 * unblock clears every older block on the way down, so the state falls
 * through to the newest submission, send-back, or acceptance beneath.
 */
export function deriveLoopState(events: LoopEvent[]): LoopState {
  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at))
  let blockCleared = false
  for (const e of sorted) {
    switch (e.kind) {
      case 'unblocked':
        blockCleared = true
        break
      case 'blocked':
        if (!blockCleared) return 'blocked'
        break
      case 'submission':
        return 'submitted'
      case 'send_back':
        return 'needs_revision'
      case 'acceptance':
        return 'accepted'
      default:
        break
    }
  }
  return 'assigned'
}

/** The chip beside an item; assigned renders nothing (no nagging). */
export const LOOP_LABEL: Record<LoopState, string | null> = {
  assigned: null,
  submitted: 'With the consultant',
  needs_revision: 'Sent back with a note',
  blocked: 'Blocked',
  accepted: 'Accepted',
}

/** The line a trail row opens with; comments speak for themselves. */
export const KIND_LABEL: Record<string, string | null> = {
  comment: null,
  submission: 'Submitted',
  send_back: 'Sent back',
  acceptance: 'Accepted',
  blocked: 'Marked blocked',
  unblocked: 'Cleared the block',
}

/** Group trail rows by item and derive each item's state. */
export function loopStatesByItem(
  rows: Array<LoopEvent & { action_item_id: string }>
): Map<string, LoopState> {
  const byItem = new Map<string, LoopEvent[]>()
  for (const r of rows) {
    const list = byItem.get(r.action_item_id) ?? []
    list.push(r)
    byItem.set(r.action_item_id, list)
  }
  const out = new Map<string, LoopState>()
  for (const [id, events] of byItem) out.set(id, deriveLoopState(events))
  return out
}

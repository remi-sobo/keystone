/**
 * lib/aiReview.ts (V2 3A)
 *
 * The shapes and pure transforms of the review workspace. The AI's
 * original payload is immutable from the moment it lands (a DB trigger
 * says so); every human edit lives in edited_payload, this shape.
 * Publish reads the edited copy; "what the AI said" versus "what you
 * published" stays recoverable forever. Pure functions: no client,
 * no I/O.
 */

export interface ExtractionPayload {
  summary_md: string
  decisions_md: string
  action_items: Array<{ title: string; assignee_hint?: string; due_hint?: string; timing: string }>
}

export interface ReviewDecision {
  text: string
  log: boolean
  decided_on: string
  who: string
}

export type ItemDisposition = 'homework' | 'internal' | 'drop'

export interface ReviewItem {
  title: string
  disposition: ItemDisposition
  assigned_client_member_id: string | null
  assigned_practice_member_id: string | null
  due_on: string | null
  timing: string
  review_requested: boolean
}

export interface EditedPayload {
  summary_md: string
  decisions: ReviewDecision[]
  action_items: ReviewItem[]
}

/** Split the extraction's decisions blob into reviewable lines. */
export function decisionLines(decisionsMd: string): string[] {
  return decisionsMd
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter((l) => l.length > 0)
}

/**
 * The first draft of the review: the AI's payload reshaped for human
 * hands. Every decision line starts toggled ON (gate 3A-3: the log
 * missing a decision costs more than reviewing one extra line); every
 * item starts as client homework, today's behavior.
 */
export function draftFromPayload(payload: ExtractionPayload, sessionDate: string): EditedPayload {
  return {
    summary_md: payload.summary_md,
    decisions: decisionLines(payload.decisions_md).map((text) => ({
      text,
      log: true,
      decided_on: sessionDate,
      who: '',
    })),
    action_items: payload.action_items.map((item) => ({
      title: item.title,
      disposition: 'homework' as const,
      assigned_client_member_id: null,
      assigned_practice_member_id: null,
      due_on: null,
      timing: ['before_session', 'after_session', 'standing'].includes(item.timing)
        ? item.timing
        : 'standing',
      review_requested: false,
    })),
  }
}

/** The published note's decisions block, rebuilt from the review rows
 *  (every row, logged or not: toggled-off lines stay in the note). */
export function decisionsBlock(decisions: ReviewDecision[]): string {
  return decisions
    .filter((d) => d.text.trim().length > 0)
    .map((d) => `- ${d.text.trim()}${d.who.trim() ? ` (${d.who.trim()})` : ''}`)
    .join('\n')
}

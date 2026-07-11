/**
 * lib/health.ts (V2 4E)
 *
 * Momentum in voice: one phrase per engagement from a deterministic
 * ladder, first match wins, with supporting facts in prose. Derived
 * at render, never stored (gate 4E-1). The vocabulary is ours and the
 * gate greps it: nothing here ever says score, percent, grade, red,
 * or behind, and no line ever names a member: clients and artifacts
 * only (gate 4E-3). Pure: no client, no I/O; the walls are the
 * calling pages' (both practice-only).
 */

import { deriveLoopState } from './homework'

const WINDOW_DAYS = 21

export interface HealthInputs {
  /** The render's wall clock, passed in so the lib stays pure. */
  now: number
  clientName: string
  finalStage: string
  workstreamStages: string[]
  stageEventAts: string[]
  /** Sessions that took place: held, or booked with a past start. */
  pastSessionAts: string[]
  itemsDone: Array<{ dueOn: string | null; doneAt: string }>
  /** Open review items past due with no submission standing. */
  overdueUnsubmitted: number
  /** Submissions standing unreviewed, oldest first. */
  awaitingReviewSince: string[]
  /** The oldest unanswered thread age per side, in days; null = none. */
  replyOwedByUsDays: number | null
  replyOwedByClientDays: number | null
  openPoll: { openedDaysAgo: number; marks: number; teamSize: number } | null
  digest: { cadence: 'weekly' | 'biweekly' | 'off'; sentInLastTwoWeeks: number }
}

export interface Health {
  phrase: string
  lines: string[]
}

const DAY = 86400000

function daysAgo(iso: string, now: number): number {
  return Math.floor((now - Date.parse(iso)) / DAY)
}

/**
 * The mirror, both ways (gate 4E-5): the newest message in each thread
 * decides who owes the reply. Client spoke last, we owe; we spoke
 * last, they owe. Each side reports its OLDEST standing age in days.
 */
export function replyLag(
  messages: Array<{ threadId: string; authorSide: string; createdAt: string }>,
  now: number
): { replyOwedByUsDays: number | null; replyOwedByClientDays: number | null } {
  const latest = new Map<string, { authorSide: string; createdAt: string }>()
  for (const m of [...messages].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (!latest.has(m.threadId)) latest.set(m.threadId, m)
  }
  let us: number | null = null
  let them: number | null = null
  for (const m of latest.values()) {
    const age = daysAgo(m.createdAt, now)
    if (m.authorSide === 'client') us = us == null ? age : Math.max(us, age)
    else them = them == null ? age : Math.max(them, age)
  }
  return { replyOwedByUsDays: us, replyOwedByClientDays: them }
}

/**
 * The homework loop read for health: per open review item, the trail
 * decides (lib/homework). A standing submission joins
 * awaitingReviewSince at its OWN timestamp; an item past due with no
 * submission standing counts overdue. Trail rows for other items pass
 * through harmlessly.
 */
export function reviewStanding(
  openReviewItems: Array<{ id: string; dueOn: string | null }>,
  trail: Array<{ action_item_id: string; kind: string; created_at: string }>,
  now: number
): { overdueUnsubmitted: number; awaitingReviewSince: string[] } {
  const byItem = new Map<string, Array<{ kind: string; created_at: string }>>()
  for (const r of trail) {
    const list = byItem.get(r.action_item_id) ?? []
    list.push(r)
    byItem.set(r.action_item_id, list)
  }
  const today = new Date(now).toISOString().slice(0, 10)
  let overdue = 0
  const since: string[] = []
  for (const it of openReviewItems) {
    const events = byItem.get(it.id) ?? []
    if (deriveLoopState(events) === 'submitted') {
      const sub = events
        .filter((e) => e.kind === 'submission')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
      if (sub) since.push(sub.created_at)
    } else if (it.dueOn && it.dueOn < today) {
      overdue += 1
    }
  }
  return { overdueUnsubmitted: overdue, awaitingReviewSince: since.sort() }
}

export function engagementHealth(i: HealthInputs): Health {
  const lines: string[] = []

  // The facts, phrase-independent.
  const lastSession = i.pastSessionAts
    .map((at) => daysAgo(at, i.now))
    .sort((a, b) => a - b)[0]
  lines.push(
    lastSession == null
      ? 'no sessions held yet'
      : lastSession === 0
        ? 'last session today'
        : lastSession === 1
          ? 'last session a day ago'
          : `last session ${lastSession} days ago`
  )

  const recentDone = i.itemsDone.filter((it) => daysAgo(it.doneAt, i.now) <= 30)
  const withDue = recentDone.filter((it) => it.dueOn)
  if (withDue.length > 0) {
    const onTime = withDue.filter(
      (it) => Date.parse(it.doneAt) <= Date.parse(`${it.dueOn}T23:59:59Z`)
    ).length
    lines.push(`${onTime} of ${withDue.length} homework items on time this month`)
  }

  if (i.digest.cadence !== 'off') {
    lines.push(
      i.digest.sentInLastTwoWeeks >= 2
        ? 'the digest went out both of the last two weeks'
        : i.digest.sentInLastTwoWeeks === 1
          ? 'the digest went out once in the last two weeks'
          : 'no digest in the last two weeks'
    )
  }

  // Responsiveness renders both ways or not at all (gate 4E-5).
  if (i.replyOwedByUsDays != null || i.replyOwedByClientDays != null) {
    const side = (days: number | null, who: string) =>
      days == null
        ? `none owed by ${who}`
        : days <= 0
          ? `one owed by ${who}, from today`
          : `one owed by ${who}, ${days === 1 ? 'a day' : `${days} days`} standing`
    lines.push(`replies: ${side(i.replyOwedByUsDays, 'us')}; ${side(i.replyOwedByClientDays, 'them')}`)
  }

  // The ladder. First match wins (gate 4E-2).
  const allDone =
    i.workstreamStages.length > 0 && i.workstreamStages.every((s) => s === i.finalStage)
  if (allDone) return { phrase: 'ready for closeout', lines }

  const oldestOwedByUs = i.replyOwedByUsDays ?? -1
  const oldestSubmission = i.awaitingReviewSince
    .map((at) => daysAgo(at, i.now))
    .sort((a, b) => b - a)[0]
  if (oldestOwedByUs >= 1 || (oldestSubmission ?? -1) >= 1) {
    return { phrase: 'waiting on us', lines }
  }

  const pollStale =
    i.openPoll != null && i.openPoll.openedDaysAgo > 3 && i.openPoll.marks < i.openPoll.teamSize
  if (i.overdueUnsubmitted > 0 || pollStale) {
    return { phrase: `waiting on ${i.clientName}`, lines }
  }

  const movedRecently = i.stageEventAts.some((at) => daysAgo(at, i.now) <= WINDOW_DAYS)
  if (movedRecently) return { phrase: 'moving', lines }

  const rhythmHolds =
    i.pastSessionAts.some((at) => daysAgo(at, i.now) <= WINDOW_DAYS) ||
    i.itemsDone.some((it) => daysAgo(it.doneAt, i.now) <= WINDOW_DAYS)
  if (rhythmHolds) return { phrase: 'holding steady', lines }

  // Quiet: counted from the last event of ANY kind, in words.
  const lastAnything = [
    ...i.stageEventAts,
    ...i.pastSessionAts,
    ...i.itemsDone.map((it) => it.doneAt),
    ...i.awaitingReviewSince,
  ]
    .map((at) => daysAgo(at, i.now))
    .sort((a, b) => a - b)[0]
  const weeks = lastAnything == null ? null : Math.max(1, Math.floor(lastAnything / 7))
  return {
    phrase:
      weeks == null
        ? 'not started yet'
        : weeks === 1
          ? 'quiet for a week'
          : `quiet for ${weeks} weeks`,
    lines,
  }
}

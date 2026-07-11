/**
 * lib/actionQueue.ts (V2 4A)
 *
 * The one prioritized queue: what needs me today, in order. Pure
 * composition (gate 4A-1): the page fetches rows the practice session
 * may already read, this lib turns them into ordered groups of
 * one-line facts with links. Nothing here is a score, a percentage,
 * or a badge; age renders in prose, never in color. No client, no I/O.
 */

export type QueueGroup = 'waiting' | 'digest' | 'prep' | 'move' | 'followup'

/** People before paper, paper before intentions, intentions before
 *  housekeeping (gate 4A-2). */
export const GROUP_ORDER: QueueGroup[] = ['waiting', 'digest', 'prep', 'move', 'followup']

export const GROUP_TITLES: Record<QueueGroup, string> = {
  waiting: 'A client is waiting on us',
  digest: 'Digest to approve',
  prep: 'Session prep needed',
  move: 'Ready to move',
  followup: 'Follow-up overdue',
}

export interface QueueItem {
  line: string
  href: string
}

export interface QueueInputs {
  /** The render's wall clock, passed in so the lib stays pure. */
  now: number
  unansweredThreads: Array<{ engagementId: string; clientName: string; lastAt: string }>
  submittedItems: Array<{ id: string; engagementId: string; title: string; clientName: string }>
  digestDrafts: Array<{ clientName: string; weekOf: string }>
  upcomingSessions: Array<{
    id: string
    startsAt: string
    tz: string
    clientName: string
    purpose: string | null
    agendaMd: string | null
  }>
  heldMoves: Array<{
    engagementId: string
    workstreamTitle: string
    movesToStage: string
    currentStage: string
    clientName: string
  }>
  overdueInternal: Array<{ id: string; engagementId: string; title: string; dueOn: string }>
  stalled: Array<{ engagementId: string; title: string; clientName: string }>
}

export function ageInProse(iso: string, now: number): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'since today'
  if (days === 1) return 'for a day'
  return `for ${days} days`
}

function fmtDay(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
  }).format(new Date(iso))
}

export function buildActionQueue(
  i: QueueInputs
): Array<{ group: QueueGroup; title: string; items: QueueItem[] }> {
  const groups: Record<QueueGroup, QueueItem[]> = {
    waiting: [],
    digest: [],
    prep: [],
    move: [],
    followup: [],
  }

  for (const t of i.unansweredThreads) {
    groups.waiting.push({
      line: `${t.clientName} has been waiting on a message ${ageInProse(t.lastAt, i.now)}`,
      href: `/engagements/${t.engagementId}#messages`,
    })
  }
  for (const s of i.submittedItems) {
    groups.waiting.push({
      line: `${s.clientName}: "${s.title}" is submitted for your review`,
      href: `/engagements/${s.engagementId}/homework/${s.id}`,
    })
  }

  for (const d of i.digestDrafts) {
    groups.digest.push({
      line: `${d.clientName}: the digest for the week of ${d.weekOf} waits below`,
      href: '#digest-queue',
    })
  }

  for (const s of i.upcomingSessions) {
    // The run of show is a purpose AND an agenda; missing either is
    // walking in without one.
    if (s.purpose && s.agendaMd) continue
    groups.prep.push({
      line: `${fmtDay(s.startsAt, s.tz)} with ${s.clientName} has no run of show yet`,
      href: `/sessions/${s.id}/notes`,
    })
  }

  for (const m of i.heldMoves) {
    // The ready-to-move rule (gate 4A-3): a held session NAMED this
    // move and the arc has not changed since. If the stage already
    // matches, the move landed; nothing to say.
    if (m.currentStage === m.movesToStage) continue
    groups.move.push({
      line: `${m.clientName}: a session named the move of ${m.workstreamTitle} toward ${m.movesToStage}; the arc still says ${m.currentStage}`,
      href: `/engagements/${m.engagementId}`,
    })
  }

  for (const it of i.overdueInternal) {
    groups.followup.push({
      line: `Internal: "${it.title}" was due ${it.dueOn}`,
      href: `/engagements/${it.engagementId}/homework/${it.id}`,
    })
  }
  for (const w of i.stalled) {
    groups.followup.push({
      line: `${w.clientName}: ${w.title} has not moved in three weeks`,
      href: `/engagements/${w.engagementId}`,
    })
  }

  return GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => ({
    group: g,
    title: GROUP_TITLES[g],
    items: groups[g],
  }))
}

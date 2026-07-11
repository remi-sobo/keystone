/**
 * lib/healthInputs.ts
 *
 * The bridge between the practice session's bulk reads and the pure
 * `engagementHealth` ladder in lib/health.ts. The /engagements list and
 * the client profile both fetch the same signal rows in full under
 * standing RLS, then need the same per-engagement assembly. Factoring
 * it here keeps the two surfaces from drifting (gate CP-1): one place
 * turns rows into a Health phrase, so a fix to how momentum reads lands
 * on both pages at once.
 *
 * Pure: no client, no I/O. The walls belong to the calling pages, both
 * practice-only.
 */

import {
  engagementHealth,
  replyLag,
  reviewStanding,
  type Health,
} from './health'

/** The signal rows a practice session reads in full, unfiltered by
 *  engagement. Each field mirrors one bulk query the caller runs. */
export interface HealthSignalRows {
  stageEvents: Array<{ engagement_id: string; at: string }>
  pastSessions: Array<{ engagement_id: string; starts_at: string }>
  doneItems: Array<{ engagement_id: string; due_on: string | null; done_at: string | null }>
  openReview: Array<{ id: string; engagement_id: string; due_on: string | null }>
  hwTrail: Array<{ action_item_id: string; kind: string; created_at: string }>
  msgs: Array<{ thread_id: string; engagement_id: string; author_side: string; created_at: string }>
  polls: Array<{ id: string; engagement_id: string; client_id: string; created_at: string }>
  marks: Array<{ poll_id: string; client_member_id: string }>
  /** Sent digests inside the last two weeks. */
  sentDigests: Array<{ engagement_id: string }>
  /** Live members per client, for open-poll completeness. */
  teamSizeByClient: Map<string, number>
}

/** The minimum an engagement must carry for its health to be read. */
export interface HealthEngagement {
  id: string
  client_id: string
  clientName: string
  finalStage: string
  digest_cadence?: string | null
  workstreamStages: string[]
}

const DAY = 86400000

/** Turn one engagement plus the shared signal rows into its Health. */
export function assembleHealth(
  e: HealthEngagement,
  rows: HealthSignalRows,
  now: number
): Health {
  const poll = rows.polls.find((p) => p.engagement_id === e.id)
  const markers = poll
    ? new Set(rows.marks.filter((m) => m.poll_id === poll.id).map((m) => m.client_member_id))
    : null

  return engagementHealth({
    now,
    clientName: e.clientName,
    finalStage: e.finalStage,
    workstreamStages: e.workstreamStages,
    stageEventAts: rows.stageEvents.filter((s) => s.engagement_id === e.id).map((s) => s.at),
    pastSessionAts: rows.pastSessions.filter((s) => s.engagement_id === e.id).map((s) => s.starts_at),
    itemsDone: rows.doneItems
      .filter((it) => it.engagement_id === e.id && it.done_at)
      .map((it) => ({ dueOn: it.due_on, doneAt: it.done_at as string })),
    ...reviewStanding(
      rows.openReview.filter((it) => it.engagement_id === e.id).map((it) => ({ id: it.id, dueOn: it.due_on })),
      rows.hwTrail,
      now
    ),
    ...replyLag(
      rows.msgs
        .filter((m) => m.engagement_id === e.id)
        .map((m) => ({ threadId: m.thread_id, authorSide: m.author_side, createdAt: m.created_at })),
      now
    ),
    openPoll:
      poll && markers
        ? {
            openedDaysAgo: Math.floor((now - Date.parse(poll.created_at)) / DAY),
            marks: markers.size,
            teamSize: rows.teamSizeByClient.get(poll.client_id) ?? 0,
          }
        : null,
    digest: {
      cadence: (e.digest_cadence as 'weekly' | 'biweekly' | 'off') ?? 'weekly',
      sentInLastTwoWeeks: rows.sentDigests.filter((d) => d.engagement_id === e.id).length,
    },
  })
}

import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { decideDigest, markAllNotificationsRead } from './actions'
import { loopStatesByItem } from '@/lib/homework'
import { buildActionQueue } from '@/lib/actionQueue'

/**
 * Practice Home, the Monday screen (Ring 3.5, spec 5.2): one view
 * across every client. This week's sessions, homework awaiting review,
 * the digest queue (Ring 6), unanswered messages with age (Ring 5), and
 * the stall flag: any workstream with no stage event, session, or
 * completed homework in three weeks (CONFIRM 11 may tighten this).
 * The queue is aspirational, what landed is factual, the gap is the
 * signal. Descriptive, never red-badged.
 */

const STALL_DAYS = 21

function fmt(dt: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dt))
}

const STATES: Record<string, string> = {
  digest_sent: 'Approved and sent to the client.',
  digest_no_email: 'Approved and recorded, but the email did not go out to everyone. Check the logs.',
  digest_dismissed: 'Dismissed. No email went anywhere.',
  digest_gone: 'That draft was already decided.',
  digest_failed: 'The approval did not finish. Try again.',
  digest_invalid: 'That request did not parse.',
}

export default async function PracticeHomePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const supabase = await createServerSupabase()
  // Per-request wall clock is intended: the Monday screen is "this
  // week" as of THIS render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const weekOut = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const stallCutoff = new Date(now - STALL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [sessions, workstreams, events, doneItems, recentSessions, lastMessages] =
    await Promise.all([
      supabase
        .from('sessions')
        .select('id, starts_at, tz, kind, engagement_id, purpose, agenda_md, clients(name)')
        .eq('status', 'booked')
        .gte('starts_at', nowIso)
        .lt('starts_at', weekOut)
        .order('starts_at'),
      supabase
        .from('workstreams')
        .select('id, title, stage, engagement_id, created_at, clients(name)')
        .neq('stage', 'done'),
      supabase
        .from('workstream_stage_events')
        .select('workstream_id, engagement_id, at')
        .gte('at', stallCutoff),
      supabase
        .from('action_items')
        .select('engagement_id, done_at')
        .eq('status', 'done')
        .gte('done_at', stallCutoff),
      supabase
        .from('sessions')
        .select('engagement_id, starts_at')
        .in('status', ['booked', 'held'])
        .gte('starts_at', stallCutoff),
      supabase
        .from('messages')
        .select('thread_id, engagement_id, author_side, created_at, clients(name)')
        .order('created_at', { ascending: false })
        .limit(200),
    ])

  // V2 3C: real review work is a SUBMISSION, derived from the trail
  // (the practice reads it in full under RLS across every client).
  const [{ data: openReviewItems }, { data: reviewTrail }] = await Promise.all([
    supabase
      .from('action_items')
      .select('id, title, engagement_id, clients(name), client_members:assigned_client_member_id(email)')
      .eq('status', 'open')
      .eq('review_requested', true),
    supabase.from('homework_activity').select('action_item_id, kind, created_at'),
  ])
  const loopStates = loopStatesByItem(reviewTrail ?? [])
  const submitted = (openReviewItems ?? []).filter((i) => loopStates.get(i.id) === 'submitted')

  // 4F: your own notifications (the recipient wall returns only yours).
  const { data: inbox } = await supabase
    .from('notifications')
    .select('id, title, href, created_at')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(20)

  // 4A signals the cards never had: past sessions that named a move
  // whose stage has not changed, and overdue internal follow-ups.
  const [{ data: heldMoves }, { data: overdueInternal }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, engagement_id, moves_to_stage, clients(name), workstreams:moves_workstream_id(title, stage)')
      .not('moves_workstream_id', 'is', null)
      .lt('starts_at', nowIso)
      .in('status', ['booked', 'held']),
    supabase
      .from('action_items')
      .select('id, engagement_id, title, due_on')
      .eq('audience', 'practice')
      .eq('status', 'open')
      .lt('due_on', nowIso.slice(0, 10)),
  ])

  const { data: digestQueue } = await supabase
    .from('ai_proposals')
    .select('id, payload, model_used, created_at, clients(name)')
    .eq('kind', 'digest')
    .eq('status', 'proposed')
    .order('created_at', { ascending: false })

  // Unanswered: the last word in a thread is the client's. An
  // unanswered message with age is the gap made visible.
  const latestByThread = new Map<string, NonNullable<typeof lastMessages.data>[number]>()
  for (const m of lastMessages.data ?? []) {
    if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, m)
  }
  const unanswered = [...latestByThread.values()].filter((m) => m.author_side === 'client')

  // A workstream stalls when it is older than the window and neither it
  // nor its engagement moved: no stage event on the workstream, no
  // session and no completed homework on the engagement.
  const movedWorkstreams = new Set((events.data ?? []).map((e) => e.workstream_id))
  const activeEngagements = new Set([
    ...(events.data ?? []).map((e) => e.engagement_id),
    ...(doneItems.data ?? []).map((i) => i.engagement_id),
    ...(recentSessions.data ?? []).map((s) => s.engagement_id),
  ])
  const stalled = (workstreams.data ?? []).filter(
    (w) =>
      w.created_at < stallCutoff &&
      !movedWorkstreams.has(w.id) &&
      !activeEngagements.has(w.engagement_id)
  )

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const clientOf = (row: any) => ((row.clients as any)?.name as string) ?? ''
  const queue = buildActionQueue({
    now,
    unansweredThreads: unanswered.map((m) => ({
      engagementId: m.engagement_id,
      clientName: clientOf(m),
      lastAt: m.created_at,
    })),
    submittedItems: submitted.map((it) => ({
      id: it.id,
      engagementId: it.engagement_id,
      title: it.title,
      clientName: clientOf(it),
    })),
    digestDrafts: (digestQueue ?? []).map((p) => ({
      clientName: clientOf(p),
      weekOf: ((p.payload as any)?.week_of as string) ?? '',
    })),
    upcomingSessions: (sessions.data ?? []).map((s) => ({
      id: s.id,
      startsAt: s.starts_at,
      tz: s.tz,
      clientName: clientOf(s),
      purpose: s.purpose ?? null,
      agendaMd: s.agenda_md ?? null,
    })),
    heldMoves: (heldMoves ?? []).map((s) => ({
      engagementId: s.engagement_id,
      workstreamTitle: ((s.workstreams as any)?.title as string) ?? 'a workstream',
      movesToStage: s.moves_to_stage ?? '',
      currentStage: ((s.workstreams as any)?.stage as string) ?? '',
      clientName: clientOf(s),
    })),
    overdueInternal: (overdueInternal ?? []).map((it) => ({
      id: it.id,
      engagementId: it.engagement_id,
      title: it.title,
      dueOn: it.due_on as string,
    })),
    stalled: stalled.map((w) => ({
      engagementId: w.engagement_id,
      title: w.title,
      clientName: clientOf(w),
    })),
  })
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <RoomShell eyebrow="The week" title="Home">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <section aria-label="What needs you today" className="mb-10">
        <p className="eyebrow">What needs you today</p>
        {queue.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing needs you today. The room is quiet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-5">
            {queue.map((g) => (
              <div key={g.group}>
                <p className="font-mono text-xs uppercase tracking-wide text-ink-dim">{g.title}</p>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {g.items.map((item, i) => (
                    <li key={i} className="text-sm text-ink">
                      <Link href={item.href} className="text-forest underline">
                        {item.line}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <KeystoneCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">New for you</p>
            {(inbox ?? []).length > 0 ? (
              <form action={markAllNotificationsRead}>
                <button type="submit" className="text-xs text-ink-dim underline hover:text-ink">
                  Mark all read
                </button>
              </form>
            ) : null}
          </div>
          {(inbox ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">Nothing new. The room is quiet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {(inbox ?? []).map((n) => (
                <li key={n.id} className="text-sm text-ink">
                  <Link href={n.href} className="text-forest underline">
                    {n.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </KeystoneCard>

        <div id="digest-queue">
        <KeystoneCard>
          <p className="eyebrow">Digest queue</p>
          {(digestQueue ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">
              No drafts waiting. The Friday cron drafts one per engagement from the week that
              actually happened; an empty week is skipped, not padded.
            </p>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {(digestQueue ?? []).map((p) => {
                const payload = p.payload as { week_of: string; subject: string; draft_md: string }
                return (
                  <div key={p.id} className="rounded-lg border border-brass/50 bg-paper p-3">
                    <p className="eyebrow">
                      {clientOf(p)} / week of {payload.week_of} / inert until you decide
                    </p>
                    <p className="mt-2 text-sm font-medium text-ink">{payload.subject}</p>
                    <details className="mt-1">
                      <summary className="cursor-pointer text-sm text-forest">Read the draft</summary>
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
                        {payload.draft_md}
                      </p>
                    </details>
                    <form action={decideDigest} className="mt-3 flex gap-3">
                      <input type="hidden" name="proposalId" value={p.id} />
                      <button
                        type="submit"
                        name="decision"
                        value="approve"
                        className="rounded-lg bg-forest px-3 py-1.5 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                      >
                        Approve and send
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="dismiss"
                        className="rounded-lg border border-ink/20 px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                )
              })}
            </div>
          )}
        </KeystoneCard>
        </div>
      </div>

      <section className="mt-8">
        <p className="eyebrow">This week</p>
        {(sessions.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-dim">Nothing on the calendar this week.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {(sessions.data ?? []).map((s) => (
              <li key={s.id} className="text-sm">
                <Link href={`/sessions/${s.id}/notes`} className="text-forest underline">
                  {fmt(s.starts_at, s.tz)}
                </Link>{' '}
                <span className="text-ink-dim">
                  {clientOf(s)}, {s.kind}
                  {s.purpose ? `: ${s.purpose}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

    </RoomShell>
  )
}

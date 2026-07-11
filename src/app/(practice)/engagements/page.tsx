import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import WorkstreamArc from '@/components/WorkstreamArc'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { engagementHealth, replyLag, reviewStanding } from '@/lib/health'
import { newDraft } from './drafts/actions'

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

const NOTES: Record<string, string> = {
  draft_error: 'That draft could not be created. Try again.',
  draft_discarded: 'Draft discarded. It stays in the record and can be restored.',
}

/**
 * The practice's engagement list with each engagement's workstream
 * arcs, and the builder's drafts above it (V2 1B). Mission control
 * (run of show, homework ledger, readiness panel) assembled in Ring 3;
 * the engagement cards are the read-only spine view.
 */
export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>
}) {
  const { note } = await searchParams
  const supabase = await createServerSupabase()
  // Per-request wall clock is intended: health is derived as of THIS
  // render, never stored (gate 4E-1).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const twoWeeksAgoDate = new Date(now - 14 * 86400000).toISOString().slice(0, 10)
  const [{ data: engagements }, { data: practice }, { data: upcoming }, { data: drafts }] =
    await Promise.all([
      supabase
        .from('engagements')
        .select('id, title, status, digest_cadence, clients(name), workstreams(id, title, stage, sort)')
        .order('created_at', { ascending: true }),
      supabase.from('practices').select('stage_config').limit(1).maybeSingle(),
      supabase
        .from('sessions')
        .select('id, engagement_id, starts_at, tz, kind')
        .eq('status', 'booked')

        .gte('starts_at', nowIso)
        .order('starts_at', { ascending: true }),
      supabase
        .from('engagement_drafts')
        .select('id, title, status, client_id, clients(name), updated_at')
        .in('status', ['draft', 'published'])
        .order('updated_at', { ascending: false }),
    ])

  // 4E: the health signals, read from tables the practice session
  // already reads in full under standing RLS. No new walls, no writes.
  const [stageEvents, pastSessions, doneItems, openReview, hwTrail, msgs, polls, marks, roster, sent] =
    await Promise.all([
      supabase
        .from('workstream_stage_events')
        .select('engagement_id, at')
        .order('at', { ascending: false })
        .limit(1000),
      supabase
        .from('sessions')
        .select('engagement_id, starts_at')
        .in('status', ['booked', 'held'])
        .lt('starts_at', nowIso)
        .order('starts_at', { ascending: false })
        .limit(1000),
      supabase
        .from('action_items')
        .select('engagement_id, due_on, done_at')
        .eq('status', 'done')
        .not('done_at', 'is', null)
        .order('done_at', { ascending: false })
        .limit(1000),
      supabase
        .from('action_items')
        .select('id, engagement_id, due_on')
        .eq('status', 'open')
        .eq('review_requested', true),
      supabase.from('homework_activity').select('action_item_id, kind, created_at'),
      supabase
        .from('messages')
        .select('thread_id, engagement_id, author_side, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('session_polls')
        .select('id, engagement_id, client_id, created_at')
        .eq('status', 'open'),
      supabase.from('session_poll_marks').select('poll_id, client_member_id'),
      supabase.from('client_members').select('client_id').is('revoked_at', null),
      supabase
        .from('digests')
        .select('engagement_id')
        .eq('status', 'sent')
        .gte('week_of', twoWeeksAgoDate),
    ])

  const stages =
    Array.isArray(practice?.stage_config) && practice.stage_config.length > 0
      ? (practice.stage_config as string[])
      : DEFAULT_STAGES

  const teamSizeByClient = new Map<string, number>()
  for (const r of roster.data ?? []) {
    teamSizeByClient.set(r.client_id, (teamSizeByClient.get(r.client_id) ?? 0) + 1)
  }
  const healthOf = (e: {
    id: string
    digest_cadence?: string | null
    clients?: unknown
    workstreams?: Array<{ stage: string }> | null
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientName = ((e.clients as any)?.name as string) || 'the client'
    const poll = (polls.data ?? []).find((p) => p.engagement_id === e.id)
    const markers = poll
      ? new Set((marks.data ?? []).filter((m) => m.poll_id === poll.id).map((m) => m.client_member_id))
      : null
    return engagementHealth({
      now,
      clientName,
      finalStage: stages[stages.length - 1],
      workstreamStages: (e.workstreams ?? []).map((w) => w.stage),
      stageEventAts: (stageEvents.data ?? []).filter((s) => s.engagement_id === e.id).map((s) => s.at),
      pastSessionAts: (pastSessions.data ?? [])
        .filter((s) => s.engagement_id === e.id)
        .map((s) => s.starts_at),
      itemsDone: (doneItems.data ?? [])
        .filter((it) => it.engagement_id === e.id)
        .map((it) => ({ dueOn: it.due_on, doneAt: it.done_at as string })),
      ...reviewStanding(
        (openReview.data ?? [])
          .filter((it) => it.engagement_id === e.id)
          .map((it) => ({ id: it.id, dueOn: it.due_on })),
        hwTrail.data ?? [],
        now
      ),
      ...replyLag(
        (msgs.data ?? [])
          .filter((m) => m.engagement_id === e.id)
          .map((m) => ({ threadId: m.thread_id, authorSide: m.author_side, createdAt: m.created_at })),
        now
      ),
      openPoll:
        poll && markers
          ? {
              openedDaysAgo: Math.floor((now - Date.parse(poll.created_at)) / 86400000),
              marks: markers.size,
              teamSize: teamSizeByClient.get(poll.client_id) ?? 0,
            }
          : null,
      digest: {
        cadence: (e.digest_cadence as 'weekly' | 'biweekly' | 'off') ?? 'weekly',
        sentInLastTwoWeeks: (sent.data ?? []).filter((d) => d.engagement_id === e.id).length,
      },
    })
  }

  const openDrafts = (drafts ?? []).filter((d) => d.status === 'draft')
  const publishedDrafts = (drafts ?? []).filter((d) => d.status === 'published')

  return (
    <RoomShell eyebrow="Engagements" title="Engagements" maxWidth="max-w-4xl">
      {note && NOTES[note] ? (
        <p role="status" className="mb-4 text-sm text-ink">
          {NOTES[note]}
        </p>
      ) : null}

      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">Drafts</p>
          <form action={newDraft}>
            <button
              type="submit"
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              New engagement
            </button>
          </form>
        </div>
        {openDrafts.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {openDrafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 basis-48">
                  <Link href={`/engagements/drafts/${d.id}`} className="text-sm text-ink hover:underline">
                    {d.title}
                  </Link>
                  <span className="block text-xs text-ink-dim">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {((d.clients as any)?.name as string) ?? 'no client yet'}, touched{' '}
                    {new Date(d.updated_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </span>
                <Link
                  href={`/engagements/drafts/${d.id}`}
                  className="text-sm text-ink-dim underline hover:text-ink"
                >
                  Resume
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-dim">
            No drafts in progress. A draft stays invisible to the client until you publish it.
          </p>
        )}
        {publishedDrafts.length > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-dim">
              Published drafts, kept as the scoping record ({publishedDrafts.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {publishedDrafts.map((d) => (
                <li key={d.id} className="text-sm text-ink-dim">
                  <Link href={`/engagements/drafts/${d.id}`} className="underline hover:text-ink">
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {!engagements || engagements.length === 0 ? (
        <p className="text-ink-dim">No engagements yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {engagements.map((e) => {
            const health = healthOf(e)
            return (
            <KeystoneCard key={e.id}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-2xl font-medium text-ink">
                  <a href={`/engagements/${e.id}`} className="hover:underline">
                    {e.title}
                  </a>
                </h2>
                <span className="eyebrow">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {((e.clients as any)?.name as string) ?? ''}
                </span>
              </div>
              <p className="mt-2 text-sm font-medium text-ink">{health.phrase}</p>
              {health.lines[0] ? (
                <p className="text-sm text-ink-dim">{health.lines[0]}</p>
              ) : null}
              <div className="mt-6 flex flex-col gap-6">
                {(e.workstreams ?? [])
                  .sort((a, b) => a.sort - b.sort)
                  .map((w) => (
                    <WorkstreamArc
                      key={w.id}
                      title={w.title}
                      stage={w.stage}
                      stages={stages}
                      freshStages={[]}
                    />
                  ))}
              </div>
              {(upcoming ?? []).filter((s) => s.engagement_id === e.id).length > 0 ? (
                <div className="mt-6 border-t border-ink/10 pt-4">
                  <p className="eyebrow">Upcoming sessions</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {(upcoming ?? [])
                      .filter((s) => s.engagement_id === e.id)
                      .slice(0, 5)
                      .map((s) => (
                        <li key={s.id} className="text-sm text-ink-dim">
                          {new Intl.DateTimeFormat('en-US', {
                            timeZone: s.tz,
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date(s.starts_at))}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </KeystoneCard>
            )
          })}
        </div>
      )}
    </RoomShell>
  )
}

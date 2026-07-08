import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Practice Home, the Monday screen (Ring 3.5, spec 5.2): one view
 * across every client. This week's sessions, homework awaiting review,
 * the digest queue and unanswered messages (their rings land next), and
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

export default async function PracticeHomePage() {
  const supabase = await createServerSupabase()
  // Per-request wall clock is intended: the Monday screen is "this
  // week" as of THIS render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const weekOut = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString()
  const stallCutoff = new Date(now - STALL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [sessions, reviewItems, workstreams, events, doneItems, recentSessions] =
    await Promise.all([
      supabase
        .from('sessions')
        .select('id, starts_at, tz, kind, engagement_id, clients(name)')
        .eq('status', 'booked')
        .gte('starts_at', nowIso)
        .lt('starts_at', weekOut)
        .order('starts_at'),
      supabase
        .from('action_items')
        .select('id, title, done_at, clients(name), client_members:assigned_client_member_id(email)')
        .eq('status', 'done')
        .gte('done_at', twoWeeksAgo)
        .order('done_at', { ascending: false }),
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
    ])

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
  const emailOf = (row: any) =>
    ((row.client_members as any)?.email as string)?.split('@')[0] ?? 'unassigned'
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
      <p className="eyebrow">The week</p>
      <h1 className="text-page-title mt-2 text-ink">Home</h1>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <section className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5">
          <p className="eyebrow">Sessions this week</p>
          {(sessions.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">Nothing on the calendar this week.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {(sessions.data ?? []).map((s) => (
                <li key={s.id} className="text-sm">
                  <Link href={`/sessions/${s.id}/notes`} className="text-forest underline">
                    {fmt(s.starts_at, s.tz)}
                  </Link>{' '}
                  <span className="text-ink-dim">
                    {clientOf(s)}, {s.kind}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5">
          <p className="eyebrow">Homework awaiting review</p>
          {(reviewItems.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">Nothing checked off in the last two weeks.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {(reviewItems.data ?? []).map((it) => (
                <li key={it.id} className="text-sm text-ink">
                  {it.title}{' '}
                  <span className="text-ink-dim">
                    ({clientOf(it)}, {emailOf(it)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5">
          <p className="eyebrow">Digest queue</p>
          <p className="mt-3 text-sm text-ink-dim">
            Weekly digest drafts land here for approval when Ring 6 ships.
          </p>
        </section>

        <section className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5">
          <p className="eyebrow">Messages</p>
          <p className="mt-3 text-sm text-ink-dim">
            Unanswered client messages surface here when Ring 5 ships.
          </p>
        </section>
      </div>

      <section className="mt-8">
        <p className="eyebrow">Holding steady</p>
        {stalled.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            Every workstream has moved inside the last three weeks.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {stalled.map((w) => (
              <li key={w.id} className="text-sm text-ink">
                {w.title} <span className="text-ink-dim">({clientOf(w)})</span> has not moved in
                three weeks. Worth a look before the next session.
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

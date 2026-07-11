import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { assembleHealth, type HealthSignalRows } from '@/lib/healthInputs'
import { addClientFromList } from './actions'

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

const STATES: Record<string, string> = {
  added: 'Added. Invite their people from Settings, then start the engagement in the builder.',
  owner_only: 'Only the practice owner adds clients.',
  invalid: 'Give the client a name.',
  error: 'That did not save. Try again.',
}

/**
 * The practice's client list. Reads under RLS with the session client;
 * a practice member sees every client of their practice and nothing of
 * any other practice. Each row links into the client profile
 * (/clients/[id]) and leads with the health phrase per active
 * engagement (lib/healthInputs), so the list itself starts to answer
 * "where does each client stand." Adding a client lives HERE, where you
 * look for it (and also inline in the builder); the row itself is
 * owner-only by RLS (clients_write demands practice.manage).
 */
export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const supabase = await createServerSupabase()
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const twoWeeksAgoDate = new Date(now - 14 * 86400000).toISOString().slice(0, 10)

  const [{ data: clients }, { data: practice }] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, status, engagements(id, title, status, client_id, digest_cadence, workstreams(stage))')
      .order('created_at', { ascending: true }),
    supabase.from('practices').select('stage_config').limit(1).maybeSingle(),
  ])

  const stages =
    Array.isArray(practice?.stage_config) && practice.stage_config.length > 0
      ? (practice.stage_config as string[])
      : DEFAULT_STAGES

  // The health signal rows, read in full under standing RLS, then
  // filtered per engagement by the shared assembly.
  const [stageEvents, pastSessions, doneItems, openReview, hwTrail, msgs, polls, marks, roster, sent] =
    await Promise.all([
      supabase.from('workstream_stage_events').select('engagement_id, at'),
      supabase
        .from('sessions')
        .select('engagement_id, starts_at')
        .in('status', ['booked', 'held'])
        .lt('starts_at', nowIso),
      supabase
        .from('action_items')
        .select('engagement_id, due_on, done_at')
        .eq('status', 'done')
        .not('done_at', 'is', null),
      supabase
        .from('action_items')
        .select('id, engagement_id, due_on')
        .eq('status', 'open')
        .eq('review_requested', true),
      supabase.from('homework_activity').select('action_item_id, kind, created_at'),
      supabase.from('messages').select('thread_id, engagement_id, author_side, created_at'),
      supabase.from('session_polls').select('id, engagement_id, client_id, created_at').eq('status', 'open'),
      supabase.from('session_poll_marks').select('poll_id, client_member_id'),
      supabase.from('client_members').select('client_id').is('revoked_at', null),
      supabase.from('digests').select('engagement_id').eq('status', 'sent').gte('week_of', twoWeeksAgoDate),
    ])

  const teamSizeByClient = new Map<string, number>()
  for (const r of roster.data ?? []) {
    teamSizeByClient.set(r.client_id, (teamSizeByClient.get(r.client_id) ?? 0) + 1)
  }
  const signalRows: HealthSignalRows = {
    stageEvents: stageEvents.data ?? [],
    pastSessions: pastSessions.data ?? [],
    doneItems: doneItems.data ?? [],
    openReview: openReview.data ?? [],
    hwTrail: hwTrail.data ?? [],
    msgs: msgs.data ?? [],
    polls: polls.data ?? [],
    marks: marks.data ?? [],
    sentDigests: sent.data ?? [],
    teamSizeByClient,
  }

  return (
    <RoomShell eyebrow="Clients" title="Clients" maxWidth="max-w-4xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      {!clients || clients.length === 0 ? (
        <p className="text-ink-dim">No clients yet. Add the first one below.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {clients.map((c) => {
            const active = (c.engagements ?? []).filter((e) => e.status === 'active')
            return (
              <li
                key={c.id}
                className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5 transition-colors duration-200 hover:bg-paper-deep"
              >
                <Link href={`/clients/${c.id}`} className="block">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-display text-xl font-medium text-ink">{c.name}</span>
                    <span className="eyebrow">{c.status}</span>
                  </div>
                  {active.map((e) => {
                    const health = assembleHealth(
                      {
                        id: e.id,
                        client_id: e.client_id,
                        clientName: c.name,
                        finalStage: stages[stages.length - 1],
                        digest_cadence: e.digest_cadence,
                        workstreamStages: (e.workstreams ?? []).map((w) => w.stage),
                      },
                      signalRows,
                      now
                    )
                    return (
                      <div key={e.id} className="mt-2 text-sm text-ink-dim">
                        <span className="text-ink">{e.title}</span>: {health.phrase}
                      </div>
                    )
                  })}
                  {active.length === 0 ? (
                    <div className="mt-2 text-sm text-ink-dim">No active engagement.</div>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <section className="mt-10 border-t border-ink/10 pt-6">
        <h2 className="font-display text-2xl font-medium text-ink">Add a client</h2>
        <p className="mt-1 text-sm text-ink-dim">
          The organization first; their people get invited from{' '}
          <Link href="/settings/members" className="underline hover:text-ink">
            Settings, members and access
          </Link>
          , and the engagement starts in the builder. Owner only.
        </p>
        <form action={addClientFromList} className="mt-3 flex flex-wrap items-center gap-3">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Organization name"
            className="min-w-[240px] flex-1 basis-64 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
          />
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Add client
          </button>
        </form>
      </section>

      <p className="mt-8 text-sm text-ink-dim">
        Engagement detail lives under{' '}
        <Link href="/engagements" className="text-forest underline">
          Engagements
        </Link>
        .
      </p>
    </RoomShell>
  )
}

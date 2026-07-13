import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import WorkstreamArc from '@/components/WorkstreamArc'
import { assembleHealth, type HealthSignalRows } from '@/lib/healthInputs'
import { saveClientProfile } from './actions'

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

const NOTES: Record<string, string> = {
  profile_saved: 'Profile saved.',
  profile_error: 'That change could not be saved. Try again.',
}

const CADENCE_WORD: Record<string, string> = {
  weekly: 'weekly',
  biweekly: 'every two weeks',
  off: 'paused',
}

function dateWord(iso: string | null): string | null {
  if (!iso) return null
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function safeHref(url: string | null): string | null {
  if (!url) return null
  const trimmed = url.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(trimmed)) return `https://${trimmed}`
  return null
}

/**
 * The client profile (specs/keystone-v2-client-profiles.md): a
 * practice-only, steady-state view of the ORGANIZATION, not just the
 * current engagement. Reads on the caller's own practice session under
 * RLS; a client outside the practice returns zero rows and the page is
 * a clean not-found, never a leak. Composition first: every fact here
 * lives behind the practice wall already. The only money shown is each
 * engagement's own fee_display (CP-2), practice-only, never a total.
 */
export default async function ClientProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const { id } = await params
  const { state } = await searchParams
  const supabase = await createServerSupabase()
  const viewer = await getViewer()
  const isOwner = viewer.practice?.role === 'owner'

  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const twoWeeksAgoDate = new Date(now - 14 * 86400000).toISOString().slice(0, 10)

  const [{ data: client }, { data: profile }, { data: roster }, { data: engagements }, { data: practice }] =
    await Promise.all([
      supabase.from('clients').select('id, name, status, created_at').eq('id', id).maybeSingle(),
      // The org-level facts live on the practice-only client_profiles
      // table (never on the client-readable clients row). One row per
      // client, absent until first saved.
      supabase
        .from('client_profiles')
        .select('relationship_note, website, relationship_started_on, primary_contact_member_id')
        .eq('client_id', id)
        .maybeSingle(),
      supabase
        .from('client_members')
        .select('id, email, role, user_id, claimed_at, created_at')
        .eq('client_id', id)
        .is('revoked_at', null)
        .order('created_at', { ascending: true }),
      supabase
        .from('engagements')
        .select(
          'id, title, status, client_id, starts_on, ends_on, fee_display, digest_cadence, created_at, workstreams(id, title, stage, sort)'
        )
        .eq('client_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('practices').select('stage_config').limit(1).maybeSingle(),
    ])

  // Out of the caller's practice: RLS returned nothing. A clean 404.
  if (!client) notFound()

  const stages =
    Array.isArray(practice?.stage_config) && practice.stage_config.length > 0
      ? (practice.stage_config as string[])
      : DEFAULT_STAGES

  const engs = engagements ?? []
  const ids = engs.map((e) => e.id)

  // The health signal rows, scoped to this client's engagements. Same
  // assembly the /engagements list uses (lib/healthInputs), so momentum
  // reads identically on both surfaces.
  const [
    stageEvents,
    pastSessions,
    upcoming,
    doneItems,
    openReview,
    hwTrail,
    msgs,
    polls,
    marks,
    sent,
    heldCount,
    deliveredCount,
    decisionCount,
    messageCount,
  ] = await Promise.all([
    supabase.from('workstream_stage_events').select('engagement_id, at').in('engagement_id', ids),
    supabase
      .from('sessions')
      .select('engagement_id, starts_at')
      .in('status', ['booked', 'held'])
      .lt('starts_at', nowIso)
      .in('engagement_id', ids),
    supabase
      .from('sessions')
      .select('id, engagement_id, starts_at, tz')
      .eq('status', 'booked')
      .gte('starts_at', nowIso)
      .in('engagement_id', ids)
      .order('starts_at', { ascending: true }),
    supabase
      .from('action_items')
      .select('engagement_id, due_on, done_at')
      .eq('status', 'done')
      .not('done_at', 'is', null)
      .in('engagement_id', ids),
    supabase
      .from('action_items')
      .select('id, engagement_id, due_on')
      .eq('status', 'open')
      .eq('review_requested', true)
      .in('engagement_id', ids),
    supabase.from('homework_activity').select('action_item_id, kind, created_at'),
    supabase
      .from('messages')
      .select('thread_id, engagement_id, author_side, created_at')
      .in('engagement_id', ids),
    supabase
      .from('session_polls')
      .select('id, engagement_id, client_id, created_at')
      .eq('status', 'open')
      .in('engagement_id', ids),
    supabase.from('session_poll_marks').select('poll_id, client_member_id'),
    supabase
      .from('digests')
      .select('engagement_id')
      .eq('status', 'sent')
      .gte('week_of', twoWeeksAgoDate)
      .in('engagement_id', ids),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'held')
      .in('engagement_id', ids),
    supabase
      .from('deliverables')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'shipped')
      .in('engagement_id', ids),
    supabase.from('decisions').select('id', { count: 'exact', head: true }).in('engagement_id', ids),
    supabase.from('messages').select('id', { count: 'exact', head: true }).in('engagement_id', ids),
  ])

  const teamSizeByClient = new Map<string, number>([[id, (roster ?? []).length]])
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

  const healthOf = (e: (typeof engs)[number]) =>
    assembleHealth(
      {
        id: e.id,
        client_id: e.client_id,
        clientName: client.name,
        finalStage: stages[stages.length - 1],
        digest_cadence: e.digest_cadence,
        workstreamStages: (e.workstreams ?? []).map((w) => w.stage),
      },
      signalRows,
      now
    )

  const activeEngs = engs.filter((e) => e.status === 'active')
  const since =
    dateWord(profile?.relationship_started_on ?? null) ?? dateWord(client.created_at) ?? null
  const website = safeHref(profile?.website ?? null)
  const cadences = Array.from(
    new Set(activeEngs.map((e) => CADENCE_WORD[(e.digest_cadence as string) ?? 'weekly'] ?? 'weekly'))
  )

  return (
    <RoomShell
      eyebrow={
        <Link href="/clients" className="text-forest hover:underline">
          Clients
        </Link>
      }
      title={client.name}
      maxWidth="max-w-4xl"
    >
      {state && NOTES[state] ? (
        <p role="status" className="mb-6 text-sm text-ink">
          {NOTES[state]}
        </p>
      ) : null}

      {/* At a glance: the org in one strip. No money here; the fee
          lives on each engagement card (CP-2), never as a total. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink-dim">
        <span className="eyebrow text-ink">{client.status}</span>
        {since ? <span>Client since {since}</span> : null}
        <span>
          {engs.length === 0
            ? 'no engagements yet'
            : `${activeEngs.length} active of ${engs.length} engagement${engs.length === 1 ? '' : 's'}`}
        </span>
        {cadences.length > 0 ? <span>Digest {cadences.join(', ')}</span> : null}
        {website ? (
          <a href={website} target="_blank" rel="noreferrer" className="text-forest hover:underline">
            {profile?.website}
          </a>
        ) : null}
      </div>

      {profile?.relationship_note ? (
        <p className="mt-4 max-w-2xl text-[0.95rem] leading-relaxed text-ink">
          {profile?.relationship_note}
        </p>
      ) : null}

      {/* The people: the roster as contact, the flat list hides this. */}
      <section className="mt-10">
        <p className="eyebrow">The people</p>
        {(roster ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">No members yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(roster ?? []).map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
              >
                <span className="text-sm text-ink">
                  {m.email}
                  {m.id === profile?.primary_contact_member_id ? (
                    <span className="ml-2 text-xs font-medium text-brass">primary contact</span>
                  ) : null}
                </span>
                <span className="text-xs text-ink-dim">
                  {m.claimed_at ? 'signed in' : 'invited, not yet signed in'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Engagements: each with its health phrase and fact lines (the
          4E reading), arcs, dates, fee, and a link into mission control.
          Built to hold more than one: a returning client is the point. */}
      <section className="mt-10">
        <p className="eyebrow">Engagements</p>
        {engs.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No engagement yet. The profile fills in once the first one is published.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-6">
            {engs.map((e) => {
              const health = healthOf(e)
              const start = dateWord(e.starts_on)
              const end = dateWord(e.ends_on)
              return (
                <KeystoneCard key={e.id}>
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-display text-2xl font-medium text-ink">
                      <Link href={`/engagements/${e.id}`} className="hover:underline">
                        {e.title}
                      </Link>
                    </h2>
                    <span className="eyebrow shrink-0">{e.status}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-ink">{health.phrase}</p>
                  {health.lines.map((line, i) => (
                    <p key={i} className="text-sm text-ink-dim">
                      {line}
                    </p>
                  ))}
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-dim">
                    {start || end ? (
                      <span>
                        {start ?? '?'} to {end ?? 'open'}
                      </span>
                    ) : null}
                    {e.fee_display ? <span className="text-ink">Fee: {e.fee_display}</span> : null}
                  </div>
                  {(e.workstreams ?? []).length > 0 ? (
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
                  ) : null}
                </KeystoneCard>
              )
            })}
          </div>
        )}
      </section>

      {/* The record at a glance: honest counts, never a score. Each
          links to its full surface. Aggregate history, not money. */}
      {engs.length > 0 ? (
        <section className="mt-10">
          <p className="eyebrow">The record so far</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { n: heldCount.count ?? 0, label: 'sessions held' },
              { n: deliveredCount.count ?? 0, label: 'deliverables shipped' },
              { n: decisionCount.count ?? 0, label: 'decisions logged' },
              { n: messageCount.count ?? 0, label: 'messages' },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-ink/10 bg-paper-raised px-4 py-3">
                <div className="font-display text-3xl font-medium text-ink">{s.n}</div>
                <div className="text-xs text-ink-dim">{s.label}</div>
              </div>
            ))}
          </div>
          {(upcoming.data ?? []).length > 0 ? (
            <p className="mt-4 text-sm text-ink-dim">
              Next session{' '}
              {new Intl.DateTimeFormat('en-US', {
                timeZone: upcoming.data![0].tz,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              }).format(new Date(upcoming.data![0].starts_at))}
              .
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Money that is not here: the boundary, stated, not pretended.
          Cross-venture revenue stays in Trellis (spec section 2). */}
      <p className="mt-10 text-xs text-ink-dim">
        Revenue across ventures lives in the Trellis command center; Keystone holds the engagement.
      </p>

      {/* The org-level facts, owner-edited in place (CP-3). Owner-only,
          matching the clients_update wall (practice.manage). */}
      {isOwner ? (
        <details className="mt-8 border-t border-ink/10 pt-6">
          <summary className="cursor-pointer text-sm text-ink-dim">Edit the client record</summary>
          <form action={saveClientProfile} className="mt-4 flex max-w-xl flex-col gap-4">
            <input type="hidden" name="clientId" value={client.id} />
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Relationship note</span>
              <textarea
                name="relationshipNote"
                rows={2}
                maxLength={2000}
                defaultValue={profile?.relationship_note ?? ''}
                placeholder="One line on who this client is and why the work matters."
                className="rounded-lg border border-ink/15 bg-paper-raised px-3 py-2 text-sm text-ink"
              />
            </label>
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-1 basis-48 flex-col gap-1">
                <span className="eyebrow">Website</span>
                <input
                  type="text"
                  name="website"
                  maxLength={500}
                  defaultValue={profile?.website ?? ''}
                  placeholder="example.org"
                  className="rounded-lg border border-ink/15 bg-paper-raised px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-1 basis-48 flex-col gap-1">
                <span className="eyebrow">Client since</span>
                <input
                  type="date"
                  name="relationshipStartedOn"
                  defaultValue={profile?.relationship_started_on ?? ''}
                  className="rounded-lg border border-ink/15 bg-paper-raised px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Primary contact</span>
              <select
                name="primaryContactMemberId"
                defaultValue={profile?.primary_contact_member_id ?? ''}
                className="rounded-lg border border-ink/15 bg-paper-raised px-3 py-2 text-sm text-ink"
              >
                <option value="">No primary contact set</option>
                {(roster ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Save
            </button>
          </form>
        </details>
      ) : null}
    </RoomShell>
  )
}

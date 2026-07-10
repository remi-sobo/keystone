import Link from 'next/link'
import { redirect } from 'next/navigation'
import WorkstreamArc from '@/components/WorkstreamArc'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { ArchEmptyState } from '@/components/ArchEmptyState'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { stageMeaning } from '@/lib/stageMeanings'

/**
 * Client Home, the progress view: the screen the fee lives on
 * (spec 6.4). One row per workstream, each at its own stage. The right
 * rail (next session, homework due, latest deliverable) fills in as
 * Rings 2 through 4 land; its empty states do work in the meantime.
 * Answers "where are we" in five seconds without a word of jargon.
 */

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

export default async function ClientHomePage() {
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, status, practice_id')
    .eq('client_id', viewer.client.clientId)
    .in('status', ['active', 'proposed', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let workstreams: Array<{
    id: string
    title: string
    stage: string
    note_md: string | null
    note_updated_at: string | null
  }> = []
  let stages = DEFAULT_STAGES
  const freshByWorkstream = new Map<string, string[]>()

  const [{ data: nextSession }, { data: myMembership }, { data: latestDeliverable }, { data: agreement }, { data: charter }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, starts_at, tz')
      .eq('client_id', viewer.client.clientId)
      .eq('status', 'booked')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('id')
      .eq('user_id', viewer.user!.id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
    supabase
      .from('deliverables')
      .select('id, title, delivered_on')
      .eq('client_id', viewer.client.clientId)
      .order('delivered_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // RLS only ever returns SHARED documents of this client; the quiet
    // empty state below covers the rest.
    supabase
      .from('engagement_documents')
      .select('id, title, status, created_at')
      .eq('client_id', viewer.client.clientId)
      .eq('doc_type', 'agreement')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Drafts are invisible by policy; this is the live constitution.
    supabase
      .from('engagement_charters')
      .select('id, version, published_at')
      .eq('client_id', viewer.client.clientId)
      .eq('status', 'published')
      .limit(1)
      .maybeSingle(),
  ])

  const { count: decisionCount } = await supabase
    .from('decisions')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', viewer.client.clientId)

  const { data: charterSignoff } = charter
    ? await supabase
        .from('approvals')
        .select('status')
        .eq('subject_type', 'charter')
        .eq('subject_id', charter.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  // Your Next Moves (V2 2D): what needs YOU, composed from standing
  // walls. Pending sign-offs any member may decide (5D-1); unread
  // practice replies; prep on the next booked session.
  const [{ data: pendingApprovals }, { count: unreadCount }, { count: prepCount }] =
    await Promise.all([
      supabase
        .from('approvals')
        .select('id, subject_type, subject_label')
        .eq('client_id', viewer.client.clientId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true })
        .limit(3),
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', viewer.client.clientId)
        .eq('author_side', 'practice')
        .is('read_at', null),
      nextSession
        ? supabase
            .from('session_prep_resources')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', nextSession.id)
        : Promise.resolve({ count: 0 } as { count: number | null }),
    ])

  const { data: myOpenItems } = myMembership
    ? await supabase
        .from('action_items')
        .select('id, title, due_on')
        .eq('assigned_client_member_id', myMembership.id)
        .eq('status', 'open')
        .order('due_on', { ascending: true, nullsFirst: false })
        .limit(3)
    : { data: [] }

  const decisionsByWs = new Map<string, Array<{ id: string; title: string; decided_on: string }>>()
  const openByWs = new Map<string, { count: number; nearestDue: string | null }>()
  const latestShipByWs = new Map<string, { title: string; delivered_on: string }>()

  if (engagement) {
    const [ws, practice, events, wsDecisions, wsOpenItems, wsShips] = await Promise.all([
      supabase
        .from('workstreams')
        .select('id, title, stage, sort, note_md, note_updated_at')
        .eq('engagement_id', engagement.id)
        .order('sort', { ascending: true }),
      supabase.from('practices').select('stage_config').eq('id', engagement.practice_id).maybeSingle(),
      supabase
        .from('workstream_stage_events')
        .select('workstream_id, from_stage, at')
        .eq('engagement_id', engagement.id)
        // Per-request wall clock is intended: the brass tick marks
        // stages completed within the last 7 days of THIS render.
        // eslint-disable-next-line react-hooks/purity
        .gte('at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase
        .from('decisions')
        .select('id, title, decided_on, workstream_id')
        .eq('engagement_id', engagement.id)
        .not('workstream_id', 'is', null)
        .order('decided_on', { ascending: false })
        .limit(60),
      supabase
        .from('action_items')
        .select('id, due_on, workstream_id')
        .eq('engagement_id', engagement.id)
        .eq('status', 'open')
        .not('workstream_id', 'is', null),
      supabase
        .from('deliverables')
        .select('id, title, delivered_on, workstream_id')
        .eq('engagement_id', engagement.id)
        .not('workstream_id', 'is', null)
        .order('delivered_on', { ascending: false })
        .limit(60),
    ])
    workstreams = ws.data ?? []
    if (Array.isArray(practice.data?.stage_config) && practice.data.stage_config.length > 0) {
      stages = practice.data.stage_config as string[]
    }
    for (const e of events.data ?? []) {
      if (!e.from_stage) continue
      const list = freshByWorkstream.get(e.workstream_id) ?? []
      list.push(e.from_stage)
      freshByWorkstream.set(e.workstream_id, list)
    }
    for (const d of wsDecisions.data ?? []) {
      const list = decisionsByWs.get(d.workstream_id as string) ?? []
      if (list.length < 3) list.push({ id: d.id, title: d.title, decided_on: d.decided_on })
      decisionsByWs.set(d.workstream_id as string, list)
    }
    for (const it of wsOpenItems.data ?? []) {
      const cur = openByWs.get(it.workstream_id as string) ?? { count: 0, nearestDue: null }
      cur.count += 1
      if (it.due_on && (!cur.nearestDue || it.due_on < cur.nearestDue)) cur.nearestDue = it.due_on
      openByWs.set(it.workstream_id as string, cur)
    }
    for (const dl of wsShips.data ?? []) {
      if (!latestShipByWs.has(dl.workstream_id as string)) {
        latestShipByWs.set(dl.workstream_id as string, {
          title: dl.title,
          delivered_on: dl.delivered_on,
        })
      }
    }
  }

  return (
    <RoomShell
      eyebrow={viewer.client.clientName}
      title={engagement ? engagement.title : 'Your engagement'}
    >
      {(() => {
        const hasMoves =
          (pendingApprovals ?? []).length > 0 ||
          (myOpenItems ?? []).length > 0 ||
          (prepCount ?? 0) > 0 ||
          (unreadCount ?? 0) > 0
        return (
          <section aria-label="Your next moves" className="mb-8">
            <p className="eyebrow">Your next moves</p>
            {hasMoves ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {(pendingApprovals ?? []).map((a) => (
                  <li key={a.id} className="text-sm text-ink">
                    Your sign-off is waited on: {a.subject_label}.{' '}
                    {a.subject_type === 'charter' ? (
                      <Link href="/charter" className="text-forest underline">
                        Read and sign
                      </Link>
                    ) : null}
                  </li>
                ))}
                {(myOpenItems ?? []).map((it) => (
                  <li key={it.id} className="text-sm text-ink">
                    Homework: {it.title}
                    {it.due_on ? <span className="text-ink-dim"> (due {it.due_on})</span> : null}{' '}
                    <Link href="/homework" className="text-forest underline">
                      Open
                    </Link>
                  </li>
                ))}
                {(prepCount ?? 0) > 0 ? (
                  <li className="text-sm text-ink">
                    {prepCount} prep item{prepCount === 1 ? '' : 's'} for your next session.{' '}
                    <Link href="/sessions" className="text-forest underline">
                      Have a look
                    </Link>
                  </li>
                ) : null}
                {(unreadCount ?? 0) > 0 ? (
                  <li className="text-sm text-ink">
                    {unreadCount} unread repl{unreadCount === 1 ? 'y' : 'ies'} from your
                    consultant.{' '}
                    <Link href="/messages" className="text-forest underline">
                      Read
                    </Link>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-ink-dim">
                Nothing needs you right now.
                {nextSession
                  ? ` See you ${new Intl.DateTimeFormat('en-US', {
                      timeZone: nextSession.tz,
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(nextSession.starts_at))}.`
                  : ' See you at the next session.'}
              </p>
            )}
          </section>
        )
      })()}

      <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
        <section aria-label="Workstreams" className="flex flex-col gap-8">
          {workstreams.length === 0 ? (
            <ArchEmptyState
              title="Your workstreams appear after kickoff."
              body="Once the first session is held, each workstream shows up here at its own stage, so you can see where the engagement stands in a glance."
            />
          ) : (
            workstreams.map((w) => {
              const meaning = stageMeaning(w.stage)
              const wsDecisionList = decisionsByWs.get(w.id) ?? []
              const openItems = openByWs.get(w.id)
              const latestShip = latestShipByWs.get(w.id)
              return (
                <div key={w.id}>
                  <WorkstreamArc
                    title={w.title}
                    stage={w.stage}
                    stages={stages}
                    freshStages={freshByWorkstream.get(w.id) ?? []}
                  />
                  <details className="mt-1">
                    <summary className="cursor-pointer py-1 text-sm text-ink-dim hover:text-ink">
                      Why we are here
                    </summary>
                    <div className="mt-1 flex flex-col gap-2 border-l-2 border-ink/10 pl-4">
                      {meaning ? <p className="text-sm text-ink-dim">{meaning}</p> : null}
                      {w.note_md ? (
                        <p className="text-sm text-ink">
                          {w.note_md}
                          {w.note_updated_at ? (
                            <span className="text-ink-dim">
                              {' '}
                              (from your consultant,{' '}
                              {new Date(w.note_updated_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                              )
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {wsDecisionList.length > 0 ? (
                        <div className="text-sm">
                          <p className="text-ink-dim">Recent decisions:</p>
                          <ul className="ml-4 list-disc text-ink">
                            {wsDecisionList.map((d) => (
                              <li key={d.id}>{d.title}</li>
                            ))}
                          </ul>
                          <Link href="/decisions" className="text-forest underline">
                            The full log
                          </Link>
                        </div>
                      ) : null}
                      {openItems && openItems.count > 0 ? (
                        <p className="text-sm text-ink-dim">
                          {openItems.count} open homework item{openItems.count === 1 ? '' : 's'}
                          {openItems.nearestDue ? `, nearest due ${openItems.nearestDue}` : ''}.{' '}
                          <Link href="/homework" className="text-forest underline">
                            See homework
                          </Link>
                        </p>
                      ) : null}
                      {latestShip ? (
                        <p className="text-sm text-ink-dim">
                          Latest deliverable: {latestShip.title} ({latestShip.delivered_on}).{' '}
                          <Link href="/deliverables" className="text-forest underline">
                            The timeline
                          </Link>
                        </p>
                      ) : null}
                      {!meaning && !w.note_md && wsDecisionList.length === 0 && !openItems && !latestShip ? (
                        <p className="text-sm text-ink-dim">Nothing to show here yet.</p>
                      ) : null}
                    </div>
                  </details>
                </div>
              )
            })
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <KeystoneCard>
            <p className="eyebrow">The charter</p>
            {charter ? (
              <p className="mt-2 text-sm text-ink">
                Version {charter.version}
                {charterSignoff?.status === 'pending' ? (
                  <span className="text-ink-dim">, awaiting your sign-off</span>
                ) : charterSignoff?.status === 'approved' ? (
                  <span className="text-ink-dim">, signed</span>
                ) : null}
                <br />
                <Link href="/charter" className="text-forest underline">
                  {charterSignoff?.status === 'pending' ? 'Read and sign' : 'Read the charter'}
                </Link>
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-dim">
                The shared agreement lands here once it is published.
              </p>
            )}
            {(decisionCount ?? 0) > 0 ? (
              <p className="mt-3 border-t border-ink/10 pt-3 text-sm text-ink-dim">
                {decisionCount} decision{decisionCount === 1 ? '' : 's'} on the record.{' '}
                <Link href="/decisions" className="text-forest underline">
                  Read the log
                </Link>
              </p>
            ) : null}
          </KeystoneCard>
          <KeystoneCard>
            <p className="eyebrow">Your agreement</p>
            {agreement ? (
              <>
                <p className="mt-2 text-sm font-medium text-ink">{agreement.title}</p>
                <p className="text-xs text-ink-dim">
                  {agreement.status === 'signed' ? 'Signed' : 'Shared'},{' '}
                  {new Date(agreement.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                <p className="mt-2 flex gap-3 text-sm">
                  <a
                    href={`/documents/${agreement.id}/file?view=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-forest underline"
                  >
                    View
                  </a>
                  <a href={`/documents/${agreement.id}/file`} className="text-forest underline">
                    Download
                  </a>
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-dim">
                Your agreement will appear here once it is shared.
              </p>
            )}
          </KeystoneCard>
          <KeystoneCard>
            <p className="eyebrow">Next session</p>
            {nextSession ? (
              <>
                <p className="mt-2 text-sm font-medium text-ink">
                  {new Intl.DateTimeFormat('en-US', {
                    timeZone: nextSession.tz,
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(new Date(nextSession.starts_at))}
                </p>
                <Link href="/sessions" className="mt-1 inline-block text-sm text-forest underline">
                  Reschedule
                </Link>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-dim">
                Nothing booked.{' '}
                <Link href="/sessions" className="text-forest underline">
                  Pick a time
                </Link>
                .
              </p>
            )}
          </KeystoneCard>
          <KeystoneCard>
            <p className="eyebrow">Homework due</p>
            {(myOpenItems ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-ink-dim">Nothing due. See you at the next session.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1">
                {(myOpenItems ?? []).map((it) => (
                  <li key={it.id} className="text-sm text-ink">
                    {it.title}
                    {it.due_on ? <span className="text-ink-dim"> (due {it.due_on})</span> : null}
                  </li>
                ))}
                <li>
                  <Link href="/homework" className="text-sm text-forest underline">
                    Check off
                  </Link>
                </li>
              </ul>
            )}
          </KeystoneCard>
          <KeystoneCard feature corner>
            <p className="eyebrow">Latest deliverable</p>
            {latestDeliverable ? (
              <p className="mt-2 text-sm text-ink">
                {latestDeliverable.title}
                <span className="text-ink-dim"> ({latestDeliverable.delivered_on})</span>
                <br />
                <Link href="/deliverables" className="text-forest underline">
                  See the timeline
                </Link>
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-dim">
                Your first deliverable lands after the kickoff session.
              </p>
            )}
          </KeystoneCard>
        </aside>
      </div>
    </RoomShell>
  )
}

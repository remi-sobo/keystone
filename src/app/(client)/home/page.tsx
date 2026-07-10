import Link from 'next/link'
import { redirect } from 'next/navigation'
import WorkstreamArc from '@/components/WorkstreamArc'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { ArchEmptyState } from '@/components/ArchEmptyState'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

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

  let workstreams: Array<{ id: string; title: string; stage: string }> = []
  let stages = DEFAULT_STAGES
  const freshByWorkstream = new Map<string, string[]>()

  const [{ data: nextSession }, { data: myMembership }, { data: latestDeliverable }, { data: agreement }, { data: charter }] = await Promise.all([
    supabase
      .from('sessions')
      .select('starts_at, tz')
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

  const { data: myOpenItems } = myMembership
    ? await supabase
        .from('action_items')
        .select('id, title, due_on')
        .eq('assigned_client_member_id', myMembership.id)
        .eq('status', 'open')
        .order('due_on', { ascending: true, nullsFirst: false })
        .limit(3)
    : { data: [] }

  if (engagement) {
    const [ws, practice, events] = await Promise.all([
      supabase
        .from('workstreams')
        .select('id, title, stage, sort')
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
  }

  return (
    <RoomShell
      eyebrow={viewer.client.clientName}
      title={engagement ? engagement.title : 'Your engagement'}
    >
      <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
        <section aria-label="Workstreams" className="flex flex-col gap-8">
          {workstreams.length === 0 ? (
            <ArchEmptyState
              title="Your workstreams appear after kickoff."
              body="Once the first session is held, each workstream shows up here at its own stage, so you can see where the engagement stands in a glance."
            />
          ) : (
            workstreams.map((w) => (
              <WorkstreamArc
                key={w.id}
                title={w.title}
                stage={w.stage}
                stages={stages}
                freshStages={freshByWorkstream.get(w.id) ?? []}
              />
            ))
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

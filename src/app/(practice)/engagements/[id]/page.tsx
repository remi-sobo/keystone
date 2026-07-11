import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import WorkstreamArc from '@/components/WorkstreamArc'
import { RoomShell } from '@/components/RoomShell'
import AddDeliverableForm from './AddDeliverableForm'
import ReplaceDeliverableForm from './ReplaceDeliverableForm'
import UploadAgreementForm from './UploadAgreementForm'
import { MarkdownLite } from '@/components/MarkdownLite'
import AskRecordForm from '@/components/AskRecordForm'
import FindRecordForm from '@/components/FindRecordForm'
import { loopStatesByItem, LOOP_LABEL } from '@/lib/homework'
import { anchorHref, parseAnchorParam, resolveAnchor, type AnchorType } from '@/lib/messageAnchors'
import { readinessFacts } from '@/lib/readinessFacts'
import { engagementHealth, replyLag, reviewStanding } from '@/lib/health'
import { listEngagementAudit } from '@/lib/audit'
import MarkdownEditor from '@/components/MarkdownEditor'
import { assembleSlots } from '@/lib/slotAssembly'
import { fetchSchedulingSettings, resolveDuration } from '@/lib/schedulingSettings'
import {
  addDecision,
  addHomework,
  closeSessionPoll,
  completeInternalTask,
  reopenInternalTask,
  decideChangeOrder,
  setEngagementOwner,
  setWorkstreamOwner,
  confirmPollOption,
  createSessionPoll,
  askEngagementQuestion,
  attachEvidence,
  findInEngagement,
  addReadinessEvidence,
  removeDeliverable,
  removeReadinessEvidence,
  requestDeliverableAcceptance,
  setDigestCadence,
  updateDeliverableAbout,
  removeEvidence,
  saveOutcome,
  saveWorkstreamNote,
  removeEngagementDocument,
  replyMessage,
  saveReadiness,
  setDocumentVisibility,
} from './actions'

/**
 * Engagement detail (Ring 3): the early mission control. Workstreams,
 * sessions (linking to the run of show), the homework ledger, the
 * review queue (checked off in the last 14 days), and the readiness
 * panel. Facts beside judgment, never a grade.
 */

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']
const PILLARS = ['philosophy', 'system', 'execution'] as const

const STATES: Record<string, string> = {
  decision_logged: 'Logged. The record keeps it as written.',
  decision_error: 'That did not save. Try again.',
  note_saved: 'Note saved. The client sees it now.',
  note_error: 'That note did not save. Try again.',
  outcome_saved: 'Outcome saved.',
  outcome_error: 'That did not save. Check the values and try again.',
  evidence_saved: 'Evidence linked.',
  evidence_removed: 'Evidence link removed. The artifact is untouched.',
  msg_sent: 'Reply sent. The client gets an email.',
  msg_sent_no_email: 'Your reply is saved and visible, but the email notification did not go out.',
  msg_error: 'That did not send. Try again.',
  slow: 'Too many messages at once. Wait a minute.',
  hw_added: 'Homework added. The assignee sees it now.',
  hw_error: 'That did not save. Check the fields and try again.',
  internal_done: 'Checked off. Internal tasks stay between us.',
  internal_reopened: 'Reopened.',
  owner_saved: 'Owner saved.',
  owner_error: 'That did not save. Try again.',
  co_decided: 'Decided, in writing. The client team hears about it.',
  co_gone: 'That change order was already decided.',
  co_error: 'That did not save. Try again.',
  poll_opened: 'Poll opened. The team sees it on their sessions page now.',
  poll_exists: 'There is already an open poll for this engagement. Close it first.',
  poll_slot_gone: 'One of those times is no longer free. Refresh and pick again.',
  poll_booked: 'Booked. The poll is settled and the session is on the calendar.',
  poll_closed: 'Poll closed without booking.',
  poll_error: 'That did not save. Try again.',
  dlv_saved: 'Saved. The client sees it on the deliverable.',
  dlv_asked: 'Acceptance asked. The client team hears about it.',
  dlv_already_asked: 'Acceptance is already asked or given on that one.',
  dlv_error: 'That did not save. Try again.',
  cadence_saved: 'Cadence saved. The Friday cron honors it before drafting.',
  cadence_error: 'That did not save. Try again.',
  readiness_linked: 'Evidence linked. The panel stays yours.',
  readiness_removed: 'Evidence link removed. The artifact is untouched.',
  readiness_error: 'That did not save. Try again.',
}

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

function fmt2(dt: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dt))
}

export default async function EngagementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string; anchor?: string; pollDuration?: string }>
}) {
  const { id } = await params
  const { state, anchor: anchorRaw, pollDuration } = await searchParams
  const supabase = await createServerSupabase()

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, status, practice_id, client_id, digest_cadence, owner_practice_member_id, clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  // Per-request wall clock is intended: the review queue is the last 14
  // days as of THIS render.
  // eslint-disable-next-line react-hooks/purity
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const [ws, practice, sessions, items, readiness, deliverables] = await Promise.all([
    supabase
      .from('workstreams')
      .select('id, title, stage, sort, note_md, note_updated_at, owner_practice_member_id')
      .eq('engagement_id', id)
      .order('sort'),
    supabase.from('practices').select('stage_config').eq('id', engagement.practice_id).maybeSingle(),
    supabase
      .from('sessions')
      .select('id, starts_at, tz, kind, status')
      .eq('engagement_id', id)
      .order('starts_at', { ascending: false })
      .limit(20),
    supabase
      .from('action_items')
      .select(
        'id, title, status, due_on, done_at, review_requested, audience, client_members:assigned_client_member_id(email), practice_members:assigned_practice_member_id(email)'
      )
      .eq('engagement_id', id)
      .order('due_on', { ascending: true }),
    supabase
      .from('readiness_markers')
      .select('pillar, note_md, updated_at')
      .eq('engagement_id', id),
    supabase
      .from('deliverables')
      .select('id, title, kind, url, storage_path, note, about_md, session_id, delivered_on, workstreams(title)')
      .eq('engagement_id', id)
      .order('delivered_on', { ascending: false }),
  ])

  const { data: messages } = await supabase
    .from('messages')
    .select('id, thread_id, author_side, body, created_at, read_at, anchor_type, anchor_id, anchor_label')
    .eq('engagement_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

  // Activity view: service-role read AFTER the practice layout check
  // and the RLS engagement resolve above (the sanctioned path).
  const activity = await listEngagementAudit(id, 30)

  // 5E: the shared page of asks that sit outside the walls.
  const { data: changeOrders } = await supabase
    .from('change_orders')
    .select('id, title, description_md, status, response_md, created_at, client_members:requested_by_client_member_id(email)')
    .eq('engagement_id', id)
    .order('created_at', { ascending: false })

  // 4E: stage events feed the health read (moving, quiet weeks).
  const { data: stageEventRows } = await supabase
    .from('workstream_stage_events')
    .select('at')
    .eq('engagement_id', id)
    .order('at', { ascending: false })
    .limit(200)

  // 3E: an Ask-about-this link handed the reply box an anchor.
  const anchorParam = parseAnchorParam(anchorRaw ?? null)
  const composerAnchor = anchorParam
    ? await resolveAnchor(supabase, id, anchorParam.type, anchorParam.id)
    : null

  const { data: documents } = await supabase
    .from('engagement_documents')
    .select('id, title, status, file_name, visible_to_client, created_at')
    .eq('engagement_id', id)
    .order('created_at', { ascending: false })

  const { data: decisions } = await supabase
    .from('decisions')
    .select('id, title, decided_on, decided_by_label, context_md, revisit_on, supersedes, workstreams(title)')
    .eq('engagement_id', id)
    .order('decided_on', { ascending: false })
    .order('created_at', { ascending: false })

  const [{ data: outcomes }, { data: evidence }] = await Promise.all([
    supabase
      .from('outcomes')
      .select('id, title, baseline_md, target_md, standing_md, standing_updated_at, reached_on, sort, workstream_id')
      .eq('engagement_id', id)
      .order('sort'),
    supabase
      .from('outcome_evidence')
      .select('id, outcome_id, kind, ref_id, note')
      .eq('engagement_id', id),
  ])

  // The homework loop state (V2 3C): derived from the trail, which the
  // practice reads in full. Rosters feed the add-homework form.
  const [{ data: hwTrail }, { data: clientRoster }, { data: practiceRoster }] = await Promise.all([
    supabase
      .from('homework_activity')
      .select('action_item_id, kind, created_at')
      .eq('engagement_id', id),
    supabase
      .from('client_members')
      .select('id, email')
      .eq('client_id', engagement.client_id)
      .is('revoked_at', null)
      .order('email'),
    supabase
      .from('practice_members')
      .select('id, email')
      .eq('practice_id', engagement.practice_id)
      .is('revoked_at', null)
      .order('email'),
  ])

  // Group scheduling (V2 3H): the open poll with its tally, or the
  // offered slots to open one from (the practice's own availability).
  const { data: openPoll } = await supabase
    .from('session_polls')
    .select('id, purpose, status, slot_minutes, created_at')
    .eq('engagement_id', id)
    .eq('status', 'open')
    .maybeSingle()
  // The poll's one duration (V2 4I): picked before opening, from the
  // practice's own offer; candidates recompute at that length.
  const schedulingSettings = await fetchSchedulingSettings(supabase, engagement.practice_id)
  const pollMinutes = resolveDuration(
    schedulingSettings,
    pollDuration ? Number(pollDuration) : null
  )
  const [{ data: pollOptions }, { data: pollMarks }, offeredSlots] = openPoll
    ? await Promise.all([
        supabase
          .from('session_poll_options')
          .select('id, starts_at, ends_at, tz, sort')
          .eq('poll_id', openPoll.id)
          .order('sort'),
        supabase
          .from('session_poll_marks')
          .select('option_id, client_member_id, client_members:client_member_id(email)')
          .eq('poll_id', openPoll.id),
        Promise.resolve(null),
      ])
    : [
        { data: null },
        { data: null },
        await assembleSlots(supabase, { practiceId: engagement.practice_id }, new Date(), {
          settings: schedulingSettings,
          durationMinutes: pollMinutes,
        }),
      ]

  // 3D: acceptance states and the version history, as facts.
  const [{ data: dlvApprovals }, { data: dlvVersions }] = await Promise.all([
    supabase
      .from('approvals')
      .select('id, subject_id, status, note_md, decided_by_email, requested_at')
      .eq('subject_type', 'deliverable')
      .eq('engagement_id', id)
      .order('requested_at', { ascending: false }),
    supabase
      .from('deliverable_versions')
      .select('id, deliverable_id, version, replaced_at')
      .eq('engagement_id', id)
      .order('version', { ascending: false }),
  ])
  const dlvApprovalFor = (dlvId: string) => (dlvApprovals ?? []).find((a) => a.subject_id === dlvId)
  const dlvVersionsFor = (dlvId: string) => (dlvVersions ?? []).filter((v) => v.deliverable_id === dlvId)

  // 3G: the archive fold reads what was sent, newest first.
  const { data: sentDigests } = await supabase
    .from('digests')
    .select('id, week_of, subject, draft_md, sent_at')
    .eq('engagement_id', id)
    .eq('status', 'sent')
    .order('week_of', { ascending: false })

  const { data: publishedCharter } = await supabase
    .from('engagement_charters')
    .select('id, version, body_md')
    .eq('engagement_id', id)
    .eq('status', 'published')
    .maybeSingle()
  const { data: charterSignoff } = publishedCharter
    ? await supabase
        .from('approvals')
        .select('status, decided_by_email')
        .eq('subject_type', 'charter')
        .eq('subject_id', publishedCharter.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const stages =
    Array.isArray(practice.data?.stage_config) && practice.data.stage_config.length > 0
      ? (practice.data.stage_config as string[])
      : DEFAULT_STAGES
  const open = (items.data ?? []).filter((i) => i.status === 'open')
  // V2 4B: the three kinds of work read as three kinds of work. Client
  // homework and our on-the-record commitments stay in Open; internal
  // tasks get their own list and a plain check-off.
  const openClient = open.filter((i) => i.audience !== 'practice')
  const openInternal = open.filter((i) => i.audience === 'practice')
  const recentlyDone = (items.data ?? []).filter(
    (i) => i.status === 'done' && i.done_at && i.done_at >= twoWeeksAgo
  )
  const loopStates = loopStatesByItem(hwTrail ?? [])
  const hwChip = (it: { id: string; review_requested: boolean }) =>
    it.review_requested ? LOOP_LABEL[loopStates.get(it.id) ?? 'assigned'] : null
  const awaitingReview = open.filter(
    (i) => i.review_requested && loopStates.get(i.id) === 'submitted'
  )
  const readinessByPillar = new Map((readiness.data ?? []).map((r) => [r.pillar, r]))

  // 4D: the receipts, behind the same lens wall as the panel.
  const { data: readinessEvidenceRows } = await supabase
    .from('readiness_evidence')
    .select('id, pillar, kind, ref_id, note, created_at')
    .eq('engagement_id', id)
    .order('created_at', { ascending: true })
  const evidenceFor = (pillar: string) =>
    (readinessEvidenceRows ?? []).filter((ev) => ev.pillar === pillar)
  const artifactLabel = (kind: string, refId: string): string => {
    if (kind === 'session') {
      const s = (sessions.data ?? []).find((x) => x.id === refId)
      return s ? fmt(s.starts_at, s.tz) : 'a session'
    }
    if (kind === 'action_item') {
      const it = (items.data ?? []).find((x) => x.id === refId)
      return it?.title ?? 'a homework item'
    }
    if (kind === 'decision') {
      const dc = (decisions ?? []).find((x) => x.id === refId)
      return dc?.title ?? 'a decision'
    }
    const dl = (deliverables.data ?? []).find((x) => x.id === refId)
    return dl?.title ?? 'a deliverable'
  }
  // Execution reads its facts straight from data this page already
  // holds; history in prose, never a grade (lib/readinessFacts.ts).
  // eslint-disable-next-line react-hooks/purity
  const factsNow = Date.now()
  const executionFacts = readinessFacts({
    now: factsNow,
    windowDays: 30,
    sessions: (sessions.data ?? []).map((s) => ({ startsAt: s.starts_at, status: s.status })),
    items: (items.data ?? []).map((it) => ({
      status: it.status,
      dueOn: it.due_on,
      doneAt: it.done_at,
    })),
    trail: (hwTrail ?? []).map((t) => ({ kind: t.kind, createdAt: t.created_at })),
  })
  // 4E: the health read, derived from rows this page already holds
  // plus the stage events. One phrase, facts in prose, never stored.
  const pollMarkers = new Set((pollMarks ?? []).map((m) => m.client_member_id))
  const health = engagementHealth({
    now: factsNow,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientName: (((engagement.clients as any)?.name as string) || 'the client'),
    finalStage: stages[stages.length - 1],
    workstreamStages: (ws.data ?? []).map((w) => w.stage),
    stageEventAts: (stageEventRows ?? []).map((e) => e.at),
    pastSessionAts: (sessions.data ?? [])
      .filter((s) => ['booked', 'held'].includes(s.status) && Date.parse(s.starts_at) < factsNow)
      .map((s) => s.starts_at),
    itemsDone: (items.data ?? [])
      .filter((it) => it.status === 'done' && it.done_at)
      .map((it) => ({ dueOn: it.due_on, doneAt: it.done_at as string })),
    ...reviewStanding(
      open.filter((i) => i.review_requested).map((i) => ({ id: i.id, dueOn: i.due_on })),
      hwTrail ?? [],
      factsNow
    ),
    ...replyLag(
      (messages ?? []).map((m) => ({
        threadId: m.thread_id,
        authorSide: m.author_side,
        createdAt: m.created_at,
      })),
      factsNow
    ),
    openPoll: openPoll
      ? {
          openedDaysAgo: Math.floor((factsNow - Date.parse(openPoll.created_at)) / 86400000),
          marks: pollMarkers.size,
          teamSize: (clientRoster ?? []).length,
        }
      : null,
    digest: {
      cadence: (engagement.digest_cadence as 'weekly' | 'biweekly' | 'off') ?? 'weekly',
      sentInLastTwoWeeks: (sentDigests ?? []).filter(
        (d) => d.week_of >= new Date(factsNow - 14 * 86400000).toISOString().slice(0, 10)
      ).length,
    },
  })
  const reflectionSeed = PILLARS.map(
    (pillar) => `## ${pillar[0].toUpperCase()}${pillar.slice(1)}\n${readinessByPillar.get(pillar)?.note_md ?? ''}`
  ).join('\n\n')
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const assignee = (it: any) => (it.client_members as any)?.email ?? 'unassigned'
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <RoomShell
      // The phrase sits in the eyebrow, quietly (4E): a reading, not a
      // gauge.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eyebrow={`${((engagement.clients as any)?.name as string) ?? ''}, ${health.phrase}`}
      title={engagement.title}
      maxWidth="max-w-4xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <p className="mb-6 text-sm text-ink-dim">{health.lines.join('; ')}.</p>

      <p className="mb-6 text-sm text-ink-dim">
        {publishedCharter
          ? `Charter: version ${publishedCharter.version} published, ${
              charterSignoff?.status === 'approved'
                ? `approved by ${charterSignoff.decided_by_email ?? 'the client'}`
                : charterSignoff?.status === 'pending'
                  ? 'awaiting sign-off'
                  : charterSignoff?.status === 'not_yet'
                    ? 'the client said not yet'
                    : 'no sign-off requested'
            }. `
          : 'No charter published yet. '}
        <Link href={`/engagements/${engagement.id}/charter`} className="underline hover:text-ink">
          {publishedCharter ? 'Open the charter' : 'Draft the charter'}
        </Link>
        {'  '}
        <Link href={`/engagements/${engagement.id}/closeout`} className="ml-2 underline hover:text-ink">
          The closeout room
        </Link>
      </p>

      {/* V2 4C: who owns the relationship. Descriptive, who to ask. */}
      <form action={setEngagementOwner} className="mb-8 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="engagementId" value={engagement.id} />
        <label className="text-ink-dim" htmlFor="engagement-owner">
          Engagement owner
        </label>
        <select
          id="engagement-owner"
          name="memberId"
          defaultValue={engagement.owner_practice_member_id ?? ''}
          className="rounded-lg border border-ink/15 bg-paper-raised px-2 py-1 text-sm text-ink"
        >
          <option value="">No owner yet</option>
          {(practiceRoster ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.email}
            </option>
          ))}
        </select>
        <button type="submit" className="text-ink-dim underline hover:text-ink">
          Save
        </button>
      </form>

      <section className="flex flex-col gap-6">
        {(ws.data ?? []).map((w) => (
          <div key={w.id}>
            <WorkstreamArc title={w.title} stage={w.stage} stages={stages} freshStages={[]} />
            <form
              action={saveWorkstreamNote}
              className="mt-2 flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="engagementId" value={engagement.id} />
              <input type="hidden" name="workstreamId" value={w.id} />
              <input
                name="note"
                maxLength={600}
                defaultValue={w.note_md ?? ''}
                placeholder="Why we are here, one line the client reads"
                className="min-w-[240px] flex-1 rounded-lg border border-ink/15 bg-paper px-3 py-1.5 text-sm text-ink"
              />
              <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                Save note
              </button>
            </form>
            <form action={setWorkstreamOwner} className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              <input type="hidden" name="engagementId" value={engagement.id} />
              <input type="hidden" name="workstreamId" value={w.id} />
              <label className="text-ink-dim" htmlFor={`ws-owner-${w.id}`}>
                Owner
              </label>
              <select
                id={`ws-owner-${w.id}`}
                name="memberId"
                defaultValue={w.owner_practice_member_id ?? ''}
                className="rounded border border-ink/15 bg-paper-raised px-2 py-0.5 text-xs text-ink"
              >
                <option value="">No owner yet</option>
                {(practiceRoster ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-ink-dim underline hover:text-ink">
                Save
              </button>
            </form>
          </div>
        ))}
      </section>

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        <section>
          <h2 className="font-display text-2xl font-medium text-ink">Sessions</h2>
          {(sessions.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">None yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {(sessions.data ?? []).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/sessions/${s.id}/notes`}
                    className="text-sm text-forest underline"
                  >
                    {fmt(s.starts_at, s.tz)}
                  </Link>
                  <span className="text-sm text-ink-dim"> {s.kind}{s.status === 'canceled' ? ', canceled' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="scheduling">
          <h2 className="font-display text-2xl font-medium text-ink">Pick a date together</h2>
          {openPoll ? (
            <div className="mt-3 flex flex-col gap-3">
              {openPoll.purpose ? (
                <p className="text-sm text-ink-dim">{openPoll.purpose}</p>
              ) : null}
              <p className="text-sm text-ink-dim">{openPoll.slot_minutes} minutes together.</p>
              <ul className="flex flex-col gap-2">
                {(pollOptions ?? []).map((o) => {
                  const marks = (pollMarks ?? []).filter((m) => m.option_id === o.id)
                  /* eslint-disable @typescript-eslint/no-explicit-any */
                  const names = marks
                    .map((m) => (((m.client_members as any)?.email as string) ?? '').split('@')[0])
                    .filter(Boolean)
                  /* eslint-enable @typescript-eslint/no-explicit-any */
                  return (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-3"
                    >
                      <span className="text-sm text-ink">
                        {fmt(o.starts_at, o.tz)}
                        <span className="text-ink-dim">
                          {' '}
                          ({names.length} of {(clientRoster ?? []).length}
                          {names.length > 0 ? `: ${names.join(', ')}` : ''})
                        </span>
                      </span>
                      <form action={confirmPollOption}>
                        <input type="hidden" name="pollId" value={openPoll.id} />
                        <input type="hidden" name="engagementId" value={id} />
                        <input type="hidden" name="optionId" value={o.id} />
                        <button
                          type="submit"
                          className="rounded-lg bg-forest px-3 py-1.5 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                        >
                          Confirm this one
                        </button>
                      </form>
                    </li>
                  )
                })}
              </ul>
              <form action={closeSessionPoll}>
                <input type="hidden" name="pollId" value={openPoll.id} />
                <input type="hidden" name="engagementId" value={id} />
                <button type="submit" className="text-sm text-ink-dim underline">
                  Close without booking
                </button>
              </form>
            </div>
          ) : (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-forest">
                Open a date poll
              </summary>
              <p className="mt-2 text-sm text-ink-dim">
                Pick a few times from your own availability. The team marks what works, you
                confirm the winner, and the booking runs on the same rails as always.
              </p>
              <form action={createSessionPoll} className="mt-3 flex flex-col gap-3">
                <input type="hidden" name="engagementId" value={id} />
                <input type="hidden" name="slotMinutes" value={pollMinutes} />
                <input
                  name="purpose"
                  maxLength={200}
                  placeholder="What this session is for (optional)"
                  className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
                />
                {schedulingSettings.durationOptions.length > 1 ? (
                  <p className="text-sm text-ink">
                    <span className="text-ink-dim">How long: </span>
                    {schedulingSettings.durationOptions.map((mins, i) => (
                      <span key={mins}>
                        {i > 0 ? <span className="text-ink-dim"> / </span> : null}
                        {mins === pollMinutes ? (
                          <span className="font-medium">{mins} minutes</span>
                        ) : (
                          <a
                            href={`/engagements/${id}?pollDuration=${mins}#scheduling`}
                            className="text-forest underline"
                          >
                            {mins} minutes
                          </a>
                        )}
                      </span>
                    ))}
                  </p>
                ) : null}
                {(offeredSlots ?? []).length === 0 ? (
                  <p className="text-sm text-ink-dim">
                    No offered slots right now. Check your availability windows in Settings.
                  </p>
                ) : (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {(offeredSlots ?? []).slice(0, 20).map((s) => (
                      <label
                        key={s.startsAt.toISOString()}
                        className="flex items-center gap-2 text-sm text-ink"
                      >
                        <input type="checkbox" name="starts" value={s.startsAt.toISOString()} />
                        {fmt(s.startsAt.toISOString(), s.tz)}
                      </label>
                    ))}
                  </div>
                )}
                <button
                  type="submit"
                  className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                >
                  Open the poll
                </button>
              </form>
            </details>
          )}
        </section>

        <section id="homework">
          <h2 className="font-display text-2xl font-medium text-ink">Homework</h2>

          {awaitingReview.length > 0 ? (
            <>
              <h3 className="font-display mt-3 text-xl font-medium text-ink">
                Awaiting your review
              </h3>
              <ul className="mt-2 flex flex-col gap-1">
                {awaitingReview.map((it) => (
                  <li key={it.id} className="text-sm text-ink">
                    <Link
                      href={`/engagements/${id}/homework/${it.id}`}
                      className="text-forest underline"
                    >
                      {it.title}
                    </Link>{' '}
                    <span className="text-ink-dim">({assignee(it)})</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <h3 className="font-display mt-6 text-xl font-medium text-ink">Open</h3>
          {openClient.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">Nothing open.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {openClient.map((it) => (
                <li key={it.id} className="text-sm text-ink">
                  <Link
                    href={`/engagements/${id}/homework/${it.id}`}
                    className="text-forest underline"
                  >
                    {it.title}
                  </Link>{' '}
                  <span className="text-ink-dim">
                    ({assignee(it)}
                    {it.due_on ? `, due ${it.due_on}` : ''})
                  </span>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {(it.practice_members as any)?.email ? (
                    <span className="eyebrow ml-2">our commitment</span>
                  ) : null}
                  {hwChip(it) ? <span className="eyebrow ml-2">{hwChip(it)}</span> : null}
                </li>
              ))}
            </ul>
          )}

          <h3 className="font-display mt-6 text-xl font-medium text-ink">Internal tasks</h3>
          <p className="mt-1 text-xs text-ink-dim">
            Invisible to the client, by policy. Check-offs, not coaching loops.
          </p>
          {openInternal.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">Nothing internal open.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {openInternal.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <form action={completeInternalTask}>
                    <input type="hidden" name="itemId" value={it.id} />
                    <input type="hidden" name="engagementId" value={id} />
                    <button
                      type="submit"
                      className="rounded border border-ink/20 px-2 py-0.5 text-xs text-ink-dim hover:text-ink"
                    >
                      Done
                    </button>
                  </form>
                  <Link
                    href={`/engagements/${id}/homework/${it.id}`}
                    className="text-forest underline"
                  >
                    {it.title}
                  </Link>
                  <span className="text-ink-dim">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    ({((it.practice_members as any)?.email as string) ?? 'unassigned'}
                    {it.due_on ? `, due ${it.due_on}` : ''})
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="font-display mt-6 text-xl font-medium text-ink">Recently done</h3>
          {recentlyDone.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">Nothing in the last two weeks.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {recentlyDone.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-2 text-sm text-ink-dim">
                  <Link
                    href={`/engagements/${id}/homework/${it.id}`}
                    className="underline"
                  >
                    {it.title}
                  </Link>{' '}
                  {it.audience === 'practice' ? (
                    <>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <span>({((it.practice_members as any)?.email as string) ?? 'unassigned'}, internal)</span>
                      <form action={reopenInternalTask}>
                        <input type="hidden" name="itemId" value={it.id} />
                        <input type="hidden" name="engagementId" value={id} />
                        <button type="submit" className="text-xs underline hover:text-ink">
                          Reopen
                        </button>
                      </form>
                    </>
                  ) : (
                    <span>({assignee(it)})</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium text-forest">
              Add homework
            </summary>
            <form action={addHomework} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="engagementId" value={id} />
              <input
                name="title"
                required
                maxLength={300}
                placeholder="What to do, in one line"
                className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              />
              <textarea
                name="body"
                rows={3}
                maxLength={4000}
                placeholder="The what and the why (optional, the assignee reads this)"
                className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              />
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Assign to
                  <select
                    name="assignee"
                    className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
                  >
                    <option value="">Unassigned</option>
                    {(clientRoster ?? []).map((m) => (
                      <option key={m.id} value={`client:${m.id}`}>
                        {m.email} (client)
                      </option>
                    ))}
                    {(practiceRoster ?? []).map((m) => (
                      <option key={m.id} value={`practice:${m.id}`}>
                        {m.email} (practice)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Audience
                  <select
                    name="audience"
                    className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
                  >
                    <option value="client">Client homework</option>
                    <option value="practice">Internal task (invisible to the client)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Due
                  <input
                    type="date"
                    name="dueOn"
                    className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink">
                  Workstream
                  <select
                    name="workstreamId"
                    className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
                  >
                    <option value="">None</option>
                    {(ws.data ?? []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="review" />
                Needs review before done (the submit, feedback, accept loop; client assignee only)
              </label>
              <button
                type="submit"
                className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
              >
                Add homework
              </button>
            </form>
          </details>
        </section>
      </div>

      <section id="decisions" className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Decision log</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Logged means logged: a course change is a new decision that supersedes the old one,
          and the client reads this record.
        </p>
        {(decisions ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing logged yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(decisions ?? []).map((d) => {
              const supersededBy = (decisions ?? []).find((x) => x.supersedes === d.id)
              return (
                <li
                  key={d.id}
                  className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-2.5"
                >
                  <p className={`text-sm ${supersededBy ? 'text-ink-dim line-through' : 'text-ink'}`}>
                    {d.title}
                  </p>
                  <p className="text-xs text-ink-dim">
                    {d.decided_on}
                    {d.decided_by_label ? `, ${d.decided_by_label}` : ''}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {((d.workstreams as any)?.title as string) ? `, ${(d.workstreams as any).title}` : ''}
                    {d.revisit_on ? `, revisit ${d.revisit_on}` : ''}
                    {supersededBy ? `, superseded by "${supersededBy.title}"` : ''}
                  </p>
                  {d.context_md ? (
                    <p className="mt-1 text-xs text-ink-dim">{d.context_md}</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        <form action={addDecision} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="engagementId" value={engagement.id} />
          <div className="flex flex-wrap gap-3">
            <input
              name="title"
              required
              maxLength={300}
              placeholder="What was decided, one plain sentence"
              className="min-w-[240px] flex-[2] rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
            />
            <input
              name="decidedOn"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
            />
            <input
              name="who"
              maxLength={120}
              placeholder="Who (as prose)"
              className="min-w-[140px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
            />
          </div>
          <input
            name="context"
            maxLength={2000}
            placeholder="Context, and where it came from (optional)"
            className="rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
          />
          <div className="flex flex-wrap items-end gap-3">
            <select
              name="workstreamId"
              defaultValue=""
              className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
            >
              <option value="">No workstream</option>
              {(ws.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-ink-dim">
              Revisit
              <input
                name="revisitOn"
                type="date"
                className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
              />
            </label>
            <select
              name="supersedes"
              defaultValue=""
              className="max-w-[280px] rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
            >
              <option value="">Supersedes nothing</option>
              {(decisions ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title.slice(0, 60)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Log it
            </button>
          </div>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Ask the record</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Sonnet reads this engagement&apos;s record through your session and answers with
          sources. It refuses when the record is silent.
        </p>
        <div className="mt-4">
          <AskRecordForm ask={askEngagementQuestion.bind(null, engagement.id)} />
        </div>
        <div className="mt-6">
          <FindRecordForm find={findInEngagement.bind(null, engagement.id)} />
        </div>
      </section>

      <section id="outcomes" className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Outcomes</h2>
        <p className="mt-1 text-sm text-ink-dim">
          The engagement&apos;s own success measures, derived from the charter. Evidence is real
          artifacts, standing is dated prose, and nothing here is a score. The client reads
          this at /outcomes.
        </p>
        {publishedCharter?.body_md ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-dim hover:text-ink">
              The charter, for reference (outcomes derive from its success section)
            </summary>
            <div className="mt-3 rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-4">
              <MarkdownLite text={publishedCharter.body_md} />
            </div>
          </details>
        ) : null}
        {(outcomes ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">None yet. Add the first below.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(outcomes ?? []).map((o) => {
              const links = (evidence ?? []).filter((ev) => ev.outcome_id === o.id)
              return (
                <li
                  key={o.id}
                  className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-3"
                >
                  <p className="text-sm text-ink">
                    {o.title}
                    {o.reached_on ? (
                      <span className="text-ink-dim"> (reached {o.reached_on})</span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-dim">
                    From: {o.baseline_md ?? 'not recorded'}. To: {o.target_md ?? 'not recorded'}.
                  </p>
                  {o.standing_md ? (
                    <p className="mt-1 text-xs text-ink">
                      Where it stands: {o.standing_md}
                      {o.standing_updated_at ? (
                        <span className="text-ink-dim">
                          {' '}
                          ({new Date(o.standing_updated_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })})
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {links.length > 0 ? (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {links.map((ev) => (
                        <li key={ev.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-dim">
                          <span>
                            Evidence: {ev.kind.replace('_', ' ')}
                            {ev.note ? `, ${ev.note}` : ''}
                          </span>
                          <form action={removeEvidence}>
                            <input type="hidden" name="evidenceId" value={ev.id} />
                            <input type="hidden" name="engagementId" value={engagement.id} />
                            <button type="submit" className="underline hover:text-ink">
                              Remove link
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-ink-dim hover:text-ink">
                      Edit, or link evidence
                    </summary>
                    <form action={saveOutcome} className="mt-2 flex flex-col gap-2">
                      <input type="hidden" name="engagementId" value={engagement.id} />
                      <input type="hidden" name="outcomeId" value={o.id} />
                      <input name="title" defaultValue={o.title} maxLength={300}
                        className="rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink" />
                      <div className="flex flex-wrap gap-2">
                        <input name="baseline" defaultValue={o.baseline_md ?? ''} maxLength={1000}
                          placeholder="Baseline"
                          className="min-w-[180px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink" />
                        <input name="target" defaultValue={o.target_md ?? ''} maxLength={1000}
                          placeholder="What done looks like"
                          className="min-w-[180px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input name="standing" defaultValue={o.standing_md ?? ''} maxLength={2000}
                          placeholder="Where it stands, in prose"
                          className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink" />
                        <label className="flex items-center gap-1 text-xs text-ink-dim">
                          Reached
                          <input name="reachedOn" type="date" defaultValue={o.reached_on ?? ''}
                            className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm" />
                        </label>
                        <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                          Save
                        </button>
                      </div>
                    </form>
                    <form action={attachEvidence} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="engagementId" value={engagement.id} />
                      <input type="hidden" name="outcomeId" value={o.id} />
                      <select name="ref" required defaultValue=""
                        className="max-w-[320px] rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm">
                        <option value="" disabled>Link an artifact as evidence</option>
                        <optgroup label="Deliverables">
                          {(deliverables.data ?? []).map((d) => (
                            <option key={d.id} value={`deliverable:${d.id}`}>{d.title.slice(0, 50)}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Sessions held">
                          {(sessions.data ?? []).filter((sx) => sx.status === 'held').map((sx) => (
                            <option key={sx.id} value={`session:${sx.id}`}>{fmt(sx.starts_at, sx.tz)}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Homework done">
                          {(items.data ?? []).filter((it) => it.status === 'done').map((it) => (
                            <option key={it.id} value={`action_item:${it.id}`}>{it.title.slice(0, 50)}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Decisions">
                          {(decisions ?? []).map((d) => (
                            <option key={d.id} value={`decision:${d.id}`}>{d.title.slice(0, 50)}</option>
                          ))}
                        </optgroup>
                      </select>
                      <input name="note" maxLength={300} placeholder="Why this counts (optional)"
                        className="min-w-[180px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink" />
                      <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                        Link
                      </button>
                    </form>
                  </details>
                </li>
              )
            })}
          </ul>
        )}
        <form action={saveOutcome} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="engagementId" value={engagement.id} />
          <input name="title" required maxLength={300} placeholder="A new outcome, one plain sentence"
            className="min-w-[240px] flex-[2] rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink" />
          <input name="baseline" maxLength={1000} placeholder="Baseline"
            className="min-w-[160px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink" />
          <input name="target" maxLength={1000} placeholder="What done looks like"
            className="min-w-[160px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink" />
          <button type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]">
            Add outcome
          </button>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Deliverables</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Every artifact you ship, on the client&apos;s timeline the moment it lands.
        </p>
        {(deliverables.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing shipped yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(deliverables.data ?? []).map((d) => (
              <li
                key={d.id}
                className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-ink">
                    {d.kind === 'link' && d.url ? (
                      <a href={d.url} className="text-forest underline" target="_blank" rel="noreferrer">
                        {d.title}
                      </a>
                    ) : (
                      d.title
                    )}{' '}
                    <span className="text-ink-dim">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      ({d.delivered_on}{((d.workstreams as any)?.title as string) ? `, ${(d.workstreams as any).title}` : ''})
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <Link
                      href={`/engagements/${engagement.id}?anchor=deliverable:${d.id}#messages`}
                      className="text-sm text-ink-dim underline hover:text-ink"
                    >
                      Message about this
                    </Link>
                    {!dlvApprovalFor(d.id) ? (
                      <form action={requestDeliverableAcceptance}>
                        <input type="hidden" name="deliverableId" value={d.id} />
                        <input type="hidden" name="engagementId" value={engagement.id} />
                        <button type="submit" className="text-sm text-forest underline">
                          Request acceptance
                        </button>
                      </form>
                    ) : null}
                    <form action={removeDeliverable}>
                      <input type="hidden" name="deliverableId" value={d.id} />
                      <input type="hidden" name="engagementId" value={engagement.id} />
                      <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                        Remove
                      </button>
                    </form>
                  </span>
                </div>
                {(() => {
                  const a = dlvApprovalFor(d.id)
                  if (!a) return null
                  return (
                    <p className="mt-1 text-sm text-ink-dim">
                      {a.status === 'pending'
                        ? 'Acceptance asked; with the client.'
                        : a.status === 'approved'
                          ? `Accepted${a.decided_by_email ? ` by ${a.decided_by_email.split('@')[0]}` : ''}.`
                          : a.status === 'not_yet'
                            ? `Not yet${a.note_md ? `: ${a.note_md}` : ''}`
                            : 'Acceptance withdrawn.'}
                    </p>
                  )
                })()}
                {dlvVersionsFor(d.id).length > 0 ? (
                  <p className="mt-1 text-xs text-ink-dim">
                    History:{' '}
                    {dlvVersionsFor(d.id).map((v, i) => (
                      <span key={v.id}>
                        {i > 0 ? '; ' : ''}
                        <a
                          href={`/engagements/${engagement.id}/versions/${v.id}/file`}
                          className="underline"
                        >
                          version {v.version}
                        </a>{' '}
                        replaced {v.replaced_at.slice(0, 10)}
                      </span>
                    ))}
                  </p>
                ) : null}
                <details className="mt-1.5">
                  <summary className="cursor-pointer text-xs text-ink-dim">
                    About and session link
                  </summary>
                  <form action={updateDeliverableAbout} className="mt-2 flex flex-col gap-2">
                    <input type="hidden" name="deliverableId" value={d.id} />
                    <input type="hidden" name="engagementId" value={engagement.id} />
                    <textarea
                      name="about"
                      rows={3}
                      maxLength={4000}
                      defaultValue={d.about_md ?? ''}
                      placeholder="What this is for and how to use it (the client reads this)"
                      className="rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        name="sessionId"
                        defaultValue={d.session_id ?? ''}
                        className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
                      >
                        <option value="">No session</option>
                        {(sessions.data ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {fmt(s.starts_at, s.tz)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-lg border border-ink/15 px-3 py-1 text-sm text-ink transition-colors duration-200 hover:border-ink/30"
                      >
                        Save
                      </button>
                    </div>
                  </form>
                  {d.kind === 'file' ? (
                    <div className="mt-2">
                      <ReplaceDeliverableForm deliverableId={d.id} engagementId={engagement.id} />
                    </div>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        )}
        <AddDeliverableForm
          engagementId={engagement.id}
          workstreams={(ws.data ?? []).map((w) => ({ id: w.id, title: w.title }))}
          sessions={(sessions.data ?? []).map((s) => ({ id: s.id, label: fmt(s.starts_at, s.tz) }))}
        />
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Agreement</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Upload the executed PDF, then share it when it is ready. Nothing reaches the client
          until you do.
        </p>
        {(documents ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing uploaded yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(documents ?? []).map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block truncate text-sm text-ink">
                    {d.title}{' '}
                    <span className="eyebrow ml-1">{d.status === 'signed' ? 'signed' : 'uploaded'}</span>
                  </span>
                  <span className="block text-xs text-ink-dim">
                    {d.file_name}, {new Date(d.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {d.visible_to_client ? ', shared with the client' : ', not shared'}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <a
                    href={`/engagements/${engagement.id}/documents/${d.id}/file?view=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-ink-dim underline hover:text-ink"
                  >
                    View
                  </a>
                  <a
                    href={`/engagements/${engagement.id}/documents/${d.id}/file`}
                    className="text-sm text-ink-dim underline hover:text-ink"
                  >
                    Download
                  </a>
                  <form action={setDocumentVisibility}>
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="engagementId" value={engagement.id} />
                    <input type="hidden" name="to" value={d.visible_to_client ? 'hidden' : 'shared'} />
                    <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                      {d.visible_to_client ? 'Stop sharing' : 'Share with client'}
                    </button>
                  </form>
                  <form action={removeEngagementDocument}>
                    <input type="hidden" name="documentId" value={d.id} />
                    <input type="hidden" name="engagementId" value={engagement.id} />
                    <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                      Remove
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
        <UploadAgreementForm engagementId={engagement.id} />
      </section>

      <section id="digests" className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Digests</h2>
        <p className="mt-1 text-sm text-ink-dim">
          The archive of what was sent, and how often the Friday cron drafts for this engagement.
        </p>
        <form action={setDigestCadence} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="engagementId" value={engagement.id} />
          <select
            name="cadence"
            defaultValue={engagement.digest_cadence ?? 'weekly'}
            className="rounded-lg border border-ink/15 bg-paper-raised px-2 py-1 text-sm"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every two weeks</option>
            <option value="off">Off for now</option>
          </select>
          <button
            type="submit"
            className="rounded-lg border border-forest px-3 py-1.5 text-sm text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
          >
            Save cadence
          </button>
        </form>
        {(sentDigests ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing sent yet. Sent digests collect here.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(sentDigests ?? []).map((dg) => (
              <li key={dg.id}>
                <details className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-2.5">
                  <summary className="cursor-pointer text-sm text-ink">
                    {dg.subject} <span className="text-ink-dim">(week of {dg.week_of})</span>
                  </summary>
                  <div className="mt-2 border-t border-ink/10 pt-2">
                    <MarkdownLite text={dg.draft_md} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="messages" className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Messages</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Replying sends the client an email with a link back to their thread.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          {(messages ?? []).length === 0 ? (
            <p className="text-sm text-ink-dim">No messages on this engagement yet.</p>
          ) : (
            (messages ?? []).map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-[var(--radius)] border border-ink/10 p-3 ${
                  m.author_side === 'practice' ? 'self-end bg-paper-raised' : 'self-start bg-paper-deep'
                }`}
              >
                {m.anchor_type && m.anchor_label ? (
                  <p className="mb-1 font-mono text-[0.65rem] uppercase text-ink-dim">
                    about:{' '}
                    <Link
                      href={anchorHref('practice', m.anchor_type as AnchorType, m.anchor_id as string, engagement.id)}
                      className="underline"
                    >
                      {m.anchor_label}
                    </Link>
                  </p>
                ) : null}
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{m.body}</p>
                <p className="mt-1.5 font-mono text-[0.65rem] uppercase text-ink-dim">
                  {m.author_side === 'practice' ? 'You' : 'Client'} / {fmt2(m.created_at)}
                  {m.author_side === 'practice' && m.read_at ? ' / seen' : ''}
                </p>
              </div>
            ))
          )}
        </div>
        <form action={replyMessage} className="mt-4">
          <input type="hidden" name="engagementId" value={engagement.id} />
          {composerAnchor ? (
            <p className="mb-2 font-mono text-xs uppercase text-ink-dim">
              about: {composerAnchor.label}{' '}
              <Link href={`/engagements/${engagement.id}#messages`} className="underline">
                remove
              </Link>
            </p>
          ) : null}
          {composerAnchor ? (
            <input
              type="hidden"
              name="anchor"
              value={`${composerAnchor.type}:${composerAnchor.id}`}
            />
          ) : null}
          <textarea
            name="body"
            rows={4}
            placeholder="Write to the client."
            className="w-full rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
          />
          <button
            type="submit"
            className="mt-3 rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Reply
          </button>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">
          Readiness <span className="text-ink-dim">(yours only)</span>
        </h2>
        <p className="mt-1 text-sm text-ink-dim">
          Philosophy, system, execution: what evidence exists, what is still soft. Prose, never a
          score. The client does not see this panel.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-3" id="readiness">
          {PILLARS.map((pillar) => {
            const marker = readinessByPillar.get(pillar)
            const pillarEvidence = evidenceFor(pillar)
            return (
              <div
                key={pillar}
                className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-4"
              >
                <p className="eyebrow">{pillar}</p>
                {pillar === 'execution' && executionFacts.length > 0 ? (
                  <p className="mt-1 text-xs text-ink-dim">{executionFacts.join('; ')}.</p>
                ) : null}
                <form action={saveReadiness}>
                  <input type="hidden" name="engagementId" value={engagement.id} />
                  <input type="hidden" name="pillar" value={pillar} />
                  <textarea
                    name="note"
                    rows={5}
                    defaultValue={marker?.note_md ?? ''}
                    placeholder="What the evidence says."
                    className="mt-2 w-full rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
                  />
                  <button
                    type="submit"
                    className="mt-2 rounded-lg border border-forest px-3 py-1.5 text-sm text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
                  >
                    Save
                  </button>
                </form>
                {pillarEvidence.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-1 border-t border-ink/10 pt-2">
                    {pillarEvidence.map((ev) => (
                      <li key={ev.id} className="flex flex-wrap items-center gap-2 text-xs text-ink">
                        <span className="font-mono uppercase text-ink-dim">{ev.kind}</span>
                        <span className="min-w-0 flex-1">
                          {artifactLabel(ev.kind, ev.ref_id)}
                          {ev.note ? <span className="text-ink-dim"> ({ev.note})</span> : null}
                        </span>
                        <form action={removeReadinessEvidence}>
                          <input type="hidden" name="evidenceId" value={ev.id} />
                          <input type="hidden" name="engagementId" value={engagement.id} />
                          <button type="submit" className="text-ink-dim underline hover:text-ink">
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <form action={addReadinessEvidence} className="mt-2 flex flex-col gap-1.5">
                  <input type="hidden" name="engagementId" value={engagement.id} />
                  <input type="hidden" name="pillar" value={pillar} />
                  <select
                    name="ref"
                    required
                    defaultValue=""
                    className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-xs"
                  >
                    <option value="" disabled>
                      Link evidence
                    </option>
                    <optgroup label="Sessions">
                      {(sessions.data ?? [])
                        .filter((sx) => sx.status !== 'canceled')
                        .map((sx) => (
                          <option key={sx.id} value={`session:${sx.id}`}>
                            {fmt(sx.starts_at, sx.tz)}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Homework">
                      {(items.data ?? []).map((it) => (
                        <option key={it.id} value={`action_item:${it.id}`}>
                          {it.title.slice(0, 50)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Decisions">
                      {(decisions ?? []).map((dc) => (
                        <option key={dc.id} value={`decision:${dc.id}`}>
                          {dc.title.slice(0, 50)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Deliverables">
                      {(deliverables.data ?? []).map((dl) => (
                        <option key={dl.id} value={`deliverable:${dl.id}`}>
                          {dl.title.slice(0, 50)}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      name="note"
                      maxLength={300}
                      placeholder="Why this counts (optional)"
                      className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-paper p-1.5 text-xs text-ink"
                    />
                    <button type="submit" className="text-xs text-ink-dim underline hover:text-ink">
                      Link
                    </button>
                  </div>
                </form>
              </div>
            )
          })}
        </div>

        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-forest">
            Share as a reflection
          </summary>
          <p className="mt-2 text-sm text-ink-dim">
            This sends into the message thread like any reply, where the team can answer. The
            panel itself stays yours; rewrite the seed for their eyes before sending.
          </p>
          <form action={replyMessage} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="engagementId" value={engagement.id} />
            <MarkdownEditor name="body" defaultValue={reflectionSeed} rows={10} />
            <button
              type="submit"
              className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Send the reflection
            </button>
          </form>
        </details>
      </section>

      {/* V2 5E: change orders. The ask and the answer, one page. */}
      <section id="change-orders" className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Change orders</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Asks that sit outside the charter. The answer goes on the record in writing; no numbers
          here, the fee conversation stays a conversation.
        </p>
        {(changeOrders ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing asked. The boundary is holding.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {(changeOrders ?? []).map((co) => (
              <li key={co.id} className="rounded-lg border border-ink/10 bg-paper-raised px-4 py-3">
                <p className="text-sm font-medium text-ink">
                  {co.title} <span className="eyebrow ml-2">{co.status}</span>
                </p>
                {co.description_md ? (
                  <p className="mt-1 text-sm text-ink-dim">{co.description_md}</p>
                ) : null}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {((co.client_members as any)?.email as string) ? (
                  <p className="mt-1 text-xs text-ink-dim">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    asked by {((co.client_members as any)?.email as string)}
                  </p>
                ) : null}
                {co.status === 'open' ? (
                  <form action={decideChangeOrder} className="mt-3 flex flex-col gap-2">
                    <input type="hidden" name="engagementId" value={engagement.id} />
                    <input type="hidden" name="changeOrderId" value={co.id} />
                    <textarea
                      name="response"
                      required
                      rows={2}
                      maxLength={4000}
                      placeholder="The answer, in writing. If it is outside the walls, say where it lives instead."
                      className="rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
                    />
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        name="decision"
                        value="agreed"
                        className="rounded-lg bg-forest px-3 py-1.5 text-sm font-medium text-paper hover:bg-forest-deep"
                      >
                        Agree
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="declined"
                        className="rounded-lg border border-ink/20 px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
                      >
                        Decline, with the reason
                      </button>
                    </div>
                  </form>
                ) : co.response_md ? (
                  <p className="mt-2 text-sm text-ink">Answer: {co.response_md}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-dim">
          The case study room and the closeout room live on their own pages:{' '}
          <a className="underline" href={`/engagements/${engagement.id}/case-study`}>case study</a>,{' '}
          <a className="underline" href={`/engagements/${engagement.id}/closeout`}>closeout</a>.
        </p>
      </section>

      {/* V2 activity view: what happened here lately. Action, when,
          who; never detail payloads. The trail starts when the scope
          columns landed. */}
      <details className="mt-12">
        <summary className="cursor-pointer text-sm font-medium text-forest">
          Activity ({activity.length})
        </summary>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-ink-dim">
            Nothing recorded yet. The trail starts with actions taken after July 2026.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {activity.map((a) => (
              <li key={a.id} className="text-sm text-ink-dim">
                <span className="font-mono text-xs">{a.action}</span>, {fmt2(a.created_at)}, by{' '}
                {a.actor_email}
              </li>
            ))}
          </ul>
        )}
      </details>
    </RoomShell>
  )
}

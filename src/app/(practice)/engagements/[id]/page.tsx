import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import WorkstreamArc from '@/components/WorkstreamArc'
import { RoomShell } from '@/components/RoomShell'
import AddDeliverableForm from './AddDeliverableForm'
import UploadAgreementForm from './UploadAgreementForm'
import { MarkdownLite } from '@/components/MarkdownLite'
import AskRecordForm from '@/components/AskRecordForm'
import FindRecordForm from '@/components/FindRecordForm'
import { loopStatesByItem, LOOP_LABEL } from '@/lib/homework'
import { assembleSlots } from '@/lib/slotAssembly'
import {
  addDecision,
  addHomework,
  closeSessionPoll,
  confirmPollOption,
  createSessionPoll,
  askEngagementQuestion,
  attachEvidence,
  findInEngagement,
  removeDeliverable,
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
  poll_opened: 'Poll opened. The team sees it on their sessions page now.',
  poll_exists: 'There is already an open poll for this engagement. Close it first.',
  poll_slot_gone: 'One of those times is no longer free. Refresh and pick again.',
  poll_booked: 'Booked. The poll is settled and the session is on the calendar.',
  poll_closed: 'Poll closed without booking.',
  poll_error: 'That did not save. Try again.',
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
  searchParams: Promise<{ state?: string }>
}) {
  const { id } = await params
  const { state } = await searchParams
  const supabase = await createServerSupabase()

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, status, practice_id, client_id, clients(name)')
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
      .select('id, title, stage, sort, note_md, note_updated_at')
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
      .select('id, title, kind, url, storage_path, note, delivered_on, workstreams(title)')
      .eq('engagement_id', id)
      .order('delivered_on', { ascending: false }),
  ])

  const { data: messages } = await supabase
    .from('messages')
    .select('id, author_side, body, created_at, read_at')
    .eq('engagement_id', id)
    .order('created_at', { ascending: true })
    .limit(200)

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
    .select('id, purpose, status, created_at')
    .eq('engagement_id', id)
    .eq('status', 'open')
    .maybeSingle()
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
        await assembleSlots(supabase, { practiceId: engagement.practice_id }, new Date()),
      ]

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
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const assignee = (it: any) => (it.client_members as any)?.email ?? 'unassigned'
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <RoomShell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eyebrow={((engagement.clients as any)?.name as string) ?? ''}
      title={engagement.title}
      maxWidth="max-w-4xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

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
      </p>

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
                <input
                  name="purpose"
                  maxLength={200}
                  placeholder="What this session is for (optional)"
                  className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
                />
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
          {open.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">Nothing open.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {open.map((it) => (
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
                  {it.audience === 'practice' ? <span className="eyebrow ml-2">internal</span> : null}
                  {hwChip(it) ? <span className="eyebrow ml-2">{hwChip(it)}</span> : null}
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
                <li key={it.id} className="text-sm text-ink-dim">
                  <Link
                    href={`/engagements/${id}/homework/${it.id}`}
                    className="underline"
                  >
                    {it.title}
                  </Link>{' '}
                  ({assignee(it)})
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
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-2.5"
              >
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
                <form action={removeDeliverable}>
                  <input type="hidden" name="deliverableId" value={d.id} />
                  <input type="hidden" name="engagementId" value={engagement.id} />
                  <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddDeliverableForm
          engagementId={engagement.id}
          workstreams={(ws.data ?? []).map((w) => ({ id: w.id, title: w.title }))}
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
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {PILLARS.map((pillar) => {
            const marker = readinessByPillar.get(pillar)
            return (
              <form
                key={pillar}
                action={saveReadiness}
                className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-4"
              >
                <input type="hidden" name="engagementId" value={engagement.id} />
                <input type="hidden" name="pillar" value={pillar} />
                <p className="eyebrow">{pillar}</p>
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
            )
          })}
        </div>
      </section>
    </RoomShell>
  )
}

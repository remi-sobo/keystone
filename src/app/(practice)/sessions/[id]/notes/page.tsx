import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import {
  attachPrepResource,
  decideProposal,
  extractFromTranscript,
  removePrepResource,
  reviewProposal,
  saveRunOfShow,
  saveTranscript,
} from '../actions'
import MarkdownEditor from '@/components/MarkdownEditor'
import { draftFromPayload, type EditedPayload, type ExtractionPayload } from '@/lib/aiReview'

/**
 * Practice session detail (Ring 3): the run of show. Paste the
 * transcript, extract, review the inert proposal, accept with
 * assignments or dismiss. Reads ride the session client; the accepted
 * record is what the client sees on their side.
 */

const STATES: Record<string, string> = {
  saved: 'Transcript saved.',
  extracted: 'Proposal ready below. Nothing is live until you publish.',
  ros_saved: 'Run of show saved. The client sees it on the session.',
  ros_error: 'That did not save. Check the fields and try again.',
  accepted: 'Accepted. The note and homework are live for the client.',
  draft_saved: 'Draft saved. Nothing is live; pick it back up any time.',
  published: 'Published. The checked groups are live; the original stays on record.',
  review_error: 'That did not save. Try again.',
  dismissed: 'Dismissed.',
  no_transcript: 'Save a transcript first.',
  budget: 'The AI budget for this month is spent. The transcript is saved; extract next month or raise the ceiling.',
  ai_failed: 'Extraction did not complete. The transcript is safe; try again.',
  proposal_gone: 'That proposal was already decided.',
  accept_failed: 'Accept did not finish. Check and retry.',
  save_failed: 'The transcript did not save. Try again.',
  slow: 'Too many extractions at once. Wait a minute.',
  prep_attached: 'Prep attached. The client sees it above this session.',
  prep_removed: 'Prep removed.',
}


export default async function PracticeSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const { id } = await params
  const { state } = await searchParams
  const supabase = await createServerSupabase()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, starts_at, tz, kind, status, practice_id, client_id, engagement_id, purpose, agenda_md, moves_workstream_id, moves_to_stage, reschedule_note, clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (!session) redirect('/engagements')

  const [{ data: note }, { data: proposals }, { data: members }, { data: items }, { data: prep }, { data: catalog }] =
    await Promise.all([
      supabase
        .from('session_notes')
        .select('raw_transcript, summary_md, decisions_md, visibility')
        .eq('session_id', id)
        .maybeSingle(),
      supabase
        .from('ai_proposals')
        .select('id, payload, edited_payload, status, model_used, created_at')
        .eq('session_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('client_members').select('id, email').eq('client_id', session.client_id),
      supabase
        .from('action_items')
        .select('id, title, status, due_on, timing, client_members:assigned_client_member_id(email)')
        .eq('session_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('session_prep_resources')
        .select('resource_id, resources(title, kind)')
        .eq('session_id', id),
      supabase.from('resources').select('id, title, kind').order('created_at', { ascending: false }),
    ])

  const [{ data: engagementWorkstreams }, { data: practiceRow }] = await Promise.all([
    supabase
      .from('workstreams')
      .select('id, title, stage')
      .eq('engagement_id', session.engagement_id)
      .order('sort'),
    supabase.from('practices').select('stage_config').eq('id', session.practice_id).maybeSingle(),
  ])
  const stageOptions =
    Array.isArray(practiceRow?.stage_config) && (practiceRow?.stage_config as string[]).length > 0
      ? (practiceRow?.stage_config as string[])
      : ['diagnose', 'design', 'build', 'train', 'stabilize']

  const { data: practiceRoster } = await supabase
    .from('practice_members')
    .select('id, email')
    .eq('practice_id', session.practice_id)
    .is('revoked_at', null)
    .order('email')

  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: session.tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(session.starts_at))
  const pending = (proposals ?? []).filter((p) => p.status === 'proposed')

  return (
    <RoomShell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eyebrow={`${((session.clients as any)?.name as string) ?? ''} / ${session.kind} / ${when}`}
      title="Session"
      maxWidth="max-w-4xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      {note?.summary_md ? (
        <KeystoneCard feature>
          <p className="eyebrow">{note.visibility === 'shared' ? 'Shared with the client' : 'Not yet shared'}</p>
          <h2 className="font-display mt-2 text-2xl font-medium text-ink">Summary</h2>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">{note.summary_md}</p>
          {note.decisions_md ? (
            <>
              <h3 className="font-display mt-4 text-xl font-medium text-ink">Decisions</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">{note.decisions_md}</p>
            </>
          ) : null}
          {(items ?? []).length > 0 ? (
            <>
              <h3 className="font-display mt-4 text-xl font-medium text-ink">Homework</h3>
              <ul className="mt-2 flex flex-col gap-1">
                {(items ?? []).map((it) => (
                  <li key={it.id} className="text-sm text-ink">
                    {it.title}
                    <span className="text-ink-dim">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(it.client_members as any)?.email ? ` (${(it.client_members as any).email}` : ''}
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(it.client_members as any)?.email ? (it.due_on ? `, due ${it.due_on})` : ')') : it.due_on ? ` (due ${it.due_on})` : ''}
                      {it.status === 'done' ? ' , done' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </KeystoneCard>
      ) : null}

      {pending.map((p) => {
        const original = p.payload as unknown as ExtractionPayload
        const sessionDate = new Date(session.starts_at).toISOString().slice(0, 10)
        const draft =
          (p.edited_payload as unknown as EditedPayload | null) ??
          draftFromPayload(original, sessionDate)
        const hints = original.action_items
        const fieldCls = 'rounded border border-ink/15 bg-paper px-2 py-1 text-sm text-ink'
        return (
          <section
            key={p.id}
            className="mt-8 rounded-[var(--radius)] border border-brass/50 bg-paper-raised p-5"
          >
            <p className="eyebrow">
              Proposal / {p.model_used ?? 'model'} / inert until you publish
              {p.edited_payload ? ' / edited, unpublished' : ''}
            </p>

            <form action={reviewProposal} className="mt-4 flex flex-col gap-6">
              <input type="hidden" name="proposalId" value={p.id} />
              <input type="hidden" name="sessionId" value={session.id} />

              <div>
                <h3 className="font-display text-xl font-medium text-ink">Summary</h3>
                <textarea
                  name="summary"
                  rows={6}
                  maxLength={8000}
                  defaultValue={draft.summary_md}
                  className="mt-2 w-full rounded-lg border border-ink/15 bg-paper p-3 text-sm leading-relaxed text-ink"
                />
              </div>

              <div>
                <h3 className="font-display text-xl font-medium text-ink">Decisions</h3>
                <p className="mt-1 text-sm text-ink-dim">
                  Checked lines enter the decision log; every line stays in the published note.
                </p>
                <input type="hidden" name="dec_count" value={draft.decisions.length} />
                {draft.decisions.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-dim">The model heard no decisions.</p>
                ) : (
                  <div className="mt-2 flex flex-col gap-2">
                    {draft.decisions.map((d, i) => (
                      <div
                        key={i}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2"
                      >
                        <label className="flex items-center gap-1 text-xs text-ink-dim">
                          <input type="checkbox" name={`dec_log_${i}`} defaultChecked={d.log} />
                          log
                        </label>
                        <input
                          name={`dec_text_${i}`}
                          defaultValue={d.text}
                          maxLength={500}
                          className={`min-w-[240px] flex-1 ${fieldCls}`}
                        />
                        <input
                          name={`dec_date_${i}`}
                          type="date"
                          defaultValue={d.decided_on}
                          className={fieldCls}
                        />
                        <input
                          name={`dec_who_${i}`}
                          defaultValue={d.who}
                          maxLength={120}
                          placeholder="who"
                          className={`w-28 ${fieldCls}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-display text-xl font-medium text-ink">Action items</h3>
                <p className="mt-1 text-sm text-ink-dim">
                  Shape each one: client homework, an internal task the client never sees, or drop
                  it. Needs review runs the submit-and-accept loop.
                </p>
                <input type="hidden" name="item_count" value={draft.action_items.length} />
                <div className="mt-2 flex flex-col gap-2">
                  {draft.action_items.map((it, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2"
                    >
                      <input type="hidden" name={`item_timing_${i}`} value={it.timing} />
                      <div className="min-w-[220px] flex-1">
                        <input
                          name={`item_title_${i}`}
                          defaultValue={it.title}
                          maxLength={300}
                          className={`w-full ${fieldCls}`}
                        />
                        {hints[i]?.assignee_hint || hints[i]?.due_hint ? (
                          <p className="mt-0.5 text-xs text-ink-dim">
                            heard: {hints[i]?.assignee_hint ?? ''}
                            {hints[i]?.due_hint ? `, ${hints[i]?.due_hint}` : ''}
                          </p>
                        ) : null}
                      </div>
                      <select name={`item_disp_${i}`} defaultValue={it.disposition} className={fieldCls}>
                        <option value="homework">Client homework</option>
                        <option value="internal">Internal task</option>
                        <option value="drop">Drop</option>
                      </select>
                      <select
                        name={`item_assign_${i}`}
                        defaultValue={
                          it.assigned_client_member_id
                            ? `client:${it.assigned_client_member_id}`
                            : it.assigned_practice_member_id
                              ? `practice:${it.assigned_practice_member_id}`
                              : ''
                        }
                        className={fieldCls}
                      >
                        <option value="">Unassigned</option>
                        {(members ?? []).map((m) => (
                          <option key={m.id} value={`client:${m.id}`}>
                            {m.email}
                          </option>
                        ))}
                        {(practiceRoster ?? []).map((m) => (
                          <option key={m.id} value={`practice:${m.id}`}>
                            {m.email} (practice)
                          </option>
                        ))}
                      </select>
                      <input
                        name={`item_due_${i}`}
                        type="date"
                        defaultValue={it.due_on ?? ''}
                        className={fieldCls}
                      />
                      <label className="flex items-center gap-1 text-xs text-ink-dim">
                        <input
                          type="checkbox"
                          name={`item_review_${i}`}
                          defaultChecked={it.review_requested}
                        />
                        needs review
                      </label>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-ink/15 bg-paper px-3 py-2">
                    <input
                      name="item_title_new"
                      maxLength={300}
                      placeholder="Add what the model missed"
                      className={`min-w-[220px] flex-1 ${fieldCls}`}
                    />
                    <select name="item_disp_new" defaultValue="homework" className={fieldCls}>
                      <option value="homework">Client homework</option>
                      <option value="internal">Internal task</option>
                    </select>
                    <select name="item_assign_new" defaultValue="" className={fieldCls}>
                      <option value="">Unassigned</option>
                      {(members ?? []).map((m) => (
                        <option key={m.id} value={`client:${m.id}`}>
                          {m.email}
                        </option>
                      ))}
                      {(practiceRoster ?? []).map((m) => (
                        <option key={m.id} value={`practice:${m.id}`}>
                          {m.email} (practice)
                        </option>
                      ))}
                    </select>
                    <input name="item_due_new" type="date" className={fieldCls} />
                    <label className="flex items-center gap-1 text-xs text-ink-dim">
                      <input type="checkbox" name="item_review_new" />
                      needs review
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 border-t border-ink/10 pt-4">
                <span className="text-sm text-ink-dim">Publish:</span>
                <label className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" name="pub_note" defaultChecked />
                  the note
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" name="pub_decisions" defaultChecked />
                  the decision log
                </label>
                <label className="flex items-center gap-1.5 text-sm text-ink">
                  <input type="checkbox" name="pub_items" defaultChecked />
                  the items
                </label>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  name="mode"
                  value="publish"
                  className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                >
                  Publish
                </button>
                <button
                  type="submit"
                  name="mode"
                  value="draft"
                  className="rounded-lg border border-forest px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
                >
                  Save draft
                </button>
              </div>
            </form>

            <form action={decideProposal} className="mt-3">
              <input type="hidden" name="proposalId" value={p.id} />
              <input type="hidden" name="sessionId" value={session.id} />
              <button
                type="submit"
                name="decision"
                value="dismiss"
                className="text-sm text-ink-dim underline hover:text-ink"
              >
                Dismiss the whole proposal
              </button>
            </form>
          </section>
        )
      })}

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">Run of show</h2>
        <p className="mt-1 text-sm text-ink-dim">
          What this session is for, what it intends to move, and what to bring. The client sees
          all of it on the session.
        </p>
        {session.reschedule_note ? (
          <p className="mt-2 text-sm text-ink">
            <span className="eyebrow mr-2">rescheduled</span>
            {session.reschedule_note}
          </p>
        ) : null}
        <form action={saveRunOfShow} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="sessionId" value={session.id} />
          <input
            name="purpose"
            maxLength={200}
            defaultValue={session.purpose ?? ''}
            placeholder="What this session is for, in one line"
            className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
          />
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-ink">
              Moves
              <select
                name="movesWorkstreamId"
                defaultValue={session.moves_workstream_id ?? ''}
                className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              >
                <option value="">No workstream named</option>
                {(engagementWorkstreams ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.title} (now {w.stage})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-ink">
              Toward
              <select
                name="movesToStage"
                defaultValue={session.moves_to_stage ?? ''}
                className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              >
                <option value="">Pick a stage</option>
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <MarkdownEditor
            name="agenda"
            defaultValue={session.agenda_md ?? ''}
            rows={8}
            placeholder="The agenda. Headings, lists, and links render for the client."
          />
          <button
            type="submit"
            className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Save run of show
          </button>
        </form>
        {(items ?? []).filter((it) => it.timing === 'before_session' && it.status === 'open').length > 0 ? (
          <>
            <h3 className="font-display mt-5 text-xl font-medium text-ink">Due before this session</h3>
            <ul className="mt-2 flex flex-col gap-1">
              {(items ?? [])
                .filter((it) => it.timing === 'before_session' && it.status === 'open')
                .map((it) => (
                  <li key={it.id} className="text-sm text-ink">
                    {it.title}
                    <span className="text-ink-dim">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(it.client_members as any)?.email ? ` (${((it.client_members as any).email as string).split('@')[0]})` : ''}
                    </span>
                  </li>
                ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">Prep</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Attach library resources; the client sees them above this session.
        </p>
        {(prep ?? []).length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {(prep ?? []).map((p) => (
              <li key={p.resource_id} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="text-ink">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {((p.resources as any)?.title as string) ?? 'resource'}{' '}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <span className="font-mono text-xs uppercase text-ink-dim">{((p.resources as any)?.kind as string) ?? ''}</span>
                </span>
                <form action={removePrepResource}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="resourceId" value={p.resource_id} />
                  <button type="submit" className="text-ink-dim underline hover:text-ink">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        {(catalog ?? []).filter((c) => !(prep ?? []).some((p) => p.resource_id === c.id)).length >
        0 ? (
          <form action={attachPrepResource} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="sessionId" value={session.id} />
            <select
              name="resourceId"
              defaultValue=""
              className="rounded-lg border border-ink/15 bg-paper-raised px-2 py-1 text-sm"
            >
              <option value="" disabled>
                Pick a resource
              </option>
              {(catalog ?? [])
                .filter((c) => !(prep ?? []).some((p) => p.resource_id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.kind})
                  </option>
                ))}
            </select>
            <button
              type="submit"
              className="rounded-lg border border-forest px-3 py-1.5 text-sm text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
            >
              Attach
            </button>
          </form>
        ) : (prep ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            The library is empty. Publish a resource under Library first.
          </p>
        ) : null}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">Transcript</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Paste the call transcript or your notes. It stays behind the client wall and feeds only
          the extraction.
        </p>
        <form action={saveTranscript} className="mt-3">
          <input type="hidden" name="sessionId" value={session.id} />
          <textarea
            name="transcript"
            rows={10}
            defaultValue={note?.raw_transcript ?? ''}
            placeholder="Paste the transcript here."
            className="w-full rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
          />
          <div className="mt-3 flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Save transcript
            </button>
          </div>
        </form>
        {note?.raw_transcript ? (
          <form action={extractFromTranscript} className="mt-3">
            <input type="hidden" name="sessionId" value={session.id} />
            <button
              type="submit"
              className="rounded-lg border border-forest px-4 py-2 text-sm font-medium text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
            >
              Extract action items
            </button>
          </form>
        ) : null}
      </section>
    </RoomShell>
  )
}

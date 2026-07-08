import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { decideProposal, extractFromTranscript, saveTranscript } from '../actions'

/**
 * Practice session detail (Ring 3): the run of show. Paste the
 * transcript, extract, review the inert proposal, accept with
 * assignments or dismiss. Reads ride the session client; the accepted
 * record is what the client sees on their side.
 */

const STATES: Record<string, string> = {
  saved: 'Transcript saved.',
  extracted: 'Proposal ready below. Nothing is live until you accept.',
  accepted: 'Accepted. The note and homework are live for the client.',
  dismissed: 'Dismissed.',
  no_transcript: 'Save a transcript first.',
  budget: 'The AI budget for this month is spent. The transcript is saved; extract next month or raise the ceiling.',
  ai_failed: 'Extraction did not complete. The transcript is safe; try again.',
  proposal_gone: 'That proposal was already decided.',
  accept_failed: 'Accept did not finish. Check and retry.',
  save_failed: 'The transcript did not save. Try again.',
  slow: 'Too many extractions at once. Wait a minute.',
}

interface ProposalPayload {
  summary_md: string
  decisions_md: string
  action_items: Array<{ title: string; assignee_hint?: string; due_hint?: string; timing: string }>
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
    .select('id, starts_at, tz, kind, status, client_id, clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (!session) redirect('/engagements')

  const [{ data: note }, { data: proposals }, { data: members }, { data: items }] =
    await Promise.all([
      supabase
        .from('session_notes')
        .select('raw_transcript, summary_md, decisions_md, visibility')
        .eq('session_id', id)
        .maybeSingle(),
      supabase
        .from('ai_proposals')
        .select('id, payload, status, model_used, created_at')
        .eq('session_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('client_members').select('id, email').eq('client_id', session.client_id),
      supabase
        .from('action_items')
        .select('id, title, status, due_on, client_members:assigned_client_member_id(email)')
        .eq('session_id', id)
        .order('created_at', { ascending: true }),
    ])

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
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
      <p className="eyebrow">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {((session.clients as any)?.name as string) ?? ''} / {session.kind} / {when}
      </p>
      <h1 className="text-page-title mt-2 text-ink">Session</h1>

      {state && STATES[state] ? (
        <p role="status" className="mt-4 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      {note?.summary_md ? (
        <section className="mt-8 rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5">
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
        </section>
      ) : null}

      {pending.map((p) => {
        const payload = p.payload as ProposalPayload
        return (
          <section
            key={p.id}
            className="mt-8 rounded-[var(--radius)] border border-brass/50 bg-paper-raised p-5"
          >
            <p className="eyebrow">Proposal / {p.model_used ?? 'model'} / inert until you decide</p>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{payload.summary_md}</p>
            {payload.decisions_md ? (
              <p className="mt-2 whitespace-pre-line text-sm text-ink-dim">{payload.decisions_md}</p>
            ) : null}

            <form action={decideProposal} className="mt-4">
              <input type="hidden" name="proposalId" value={p.id} />
              <input type="hidden" name="sessionId" value={session.id} />
              <div className="flex flex-col gap-3">
                {payload.action_items.map((item, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 bg-paper px-3 py-2">
                    <span className="min-w-[200px] flex-1 text-sm text-ink">
                      {item.title}
                      {item.assignee_hint ? (
                        <span className="text-ink-dim"> (heard: {item.assignee_hint}{item.due_hint ? `, ${item.due_hint}` : ''})</span>
                      ) : null}
                    </span>
                    <select name={`assign_${i}`} className="rounded border border-ink/15 bg-paper px-2 py-1 text-sm" defaultValue="">
                      <option value="">Unassigned</option>
                      {(members ?? []).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.email}
                        </option>
                      ))}
                    </select>
                    <input name={`due_${i}`} type="date" className="rounded border border-ink/15 bg-paper px-2 py-1 text-sm" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="submit"
                  name="decision"
                  value="accept"
                  className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                >
                  Accept and assign
                </button>
                <button
                  type="submit"
                  name="decision"
                  value="dismiss"
                  className="rounded-lg border border-ink/20 px-4 py-2 text-sm text-ink-dim hover:text-ink"
                >
                  Dismiss
                </button>
              </div>
            </form>
          </section>
        )
      })}

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
    </div>
  )
}

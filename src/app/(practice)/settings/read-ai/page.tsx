import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { env } from '@/lib/env'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { attachMeeting, discardMeeting } from './actions'

/**
 * The Read AI inbox (specs/keystone-readai.md). Meetings that looked
 * like client calls but could not be matched to one session with
 * certainty wait here; the consultant picks the session or throws the
 * meeting away. Reads ride the session client under RLS (readai_meetings
 * is practice-read only); writes go through ./actions.
 *
 * The page shows whether the webhook is configured, never the secret.
 */

const STATES: Record<string, string> = {
  discarded: 'Discarded. The notes and transcript are gone.',
  gone: 'That meeting was already handled.',
  attach_failed: 'That did not attach. The meeting is still here; try again.',
  pick_session: 'Pick a session first.',
}

const REASONS: Record<string, string> = {
  no_session: 'Someone from this client was on the call, but no booked session was at that time.',
  several_sessions: 'More than one session sits near that time.',
  several_clients: 'People from more than one client were on the call.',
  time_only: 'It happened during a booked session, but nobody from the client was on the invite.',
  attach_failed: 'It matched a session, but attaching did not finish.',
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Candidate sessions: a week either side of the waiting calls and today. */
function candidateWindow(startedAt: Array<string | null>): { from: string; to: string } {
  const now = Date.now()
  const starts = startedAt.map((iso) => (iso ? Date.parse(iso) : now))
  return {
    from: new Date(Math.min(now, ...starts) - 7 * DAY_MS).toISOString(),
    to: new Date(Math.max(now, ...starts) + 7 * DAY_MS).toISOString(),
  }
}

export default async function ReadAiInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const viewer = await getViewer()
  const practiceId = viewer.practice!.practiceId
  const supabase = await createServerSupabase()

  const configured = Boolean(env.READAI_WEBHOOK_SECRET) && env.READAI_PRACTICE_ID?.trim() === practiceId

  const [{ data: waiting }, { data: recent }] = await Promise.all([
    supabase
      .from('readai_meetings')
      .select('id, title, started_at, participant_emails, match_reason, client_id, report_url, clients(name)')
      .eq('practice_id', practiceId)
      .eq('status', 'needs_review')
      .order('received_at', { ascending: false })
      .limit(25),
    supabase
      .from('readai_meetings')
      .select('id, status, title, started_at, session_id, received_at, clients(name)')
      .eq('practice_id', practiceId)
      .in('status', ['attached', 'skipped'])
      .order('received_at', { ascending: false })
      .limit(10),
  ])

  const { from, to } = candidateWindow((waiting ?? []).map((w) => w.started_at))
  const { data: sessions } =
    (waiting ?? []).length > 0
      ? await supabase
          .from('sessions')
          .select('id, starts_at, tz, kind, client_id, clients(name)')
          .eq('practice_id', practiceId)
          .neq('status', 'canceled')
          .gte('starts_at', from)
          .lte('starts_at', to)
          .order('starts_at', { ascending: false })
      : { data: [] }

  const fmt = (iso: string | null, tz = 'America/Los_Angeles') =>
    iso
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(iso))
      : 'time unknown'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientName = (row: any) => (row?.clients?.name as string | undefined) ?? null

  const fieldCls = 'rounded border border-ink/15 bg-paper px-2 py-1 text-sm text-ink'

  return (
    <RoomShell eyebrow="Settings / Read AI" title="Read AI" maxWidth="max-w-4xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <KeystoneCard>
        <p className="eyebrow">{configured ? 'Connected' : 'Not connected yet'}</p>
        <p className="mt-2 text-sm text-ink">
          When a recorded call ends, Read AI sends its notes here. A call with someone from a client
          during one of that client&apos;s booked sessions attaches on its own: the transcript stays
          on the practice side and the notes become a proposal on the session. Nothing reaches the
          client until you publish it. Calls with no client on them are not kept.
        </p>
        {configured ? null : (
          <p className="mt-2 text-sm text-ink-dim">
            Set READAI_WEBHOOK_SECRET and READAI_PRACTICE_ID, then add the webhook in Read AI.
            This practice&apos;s id is <span className="font-mono text-ink">{practiceId}</span>. The
            steps are in specs/keystone-readai.md.
          </p>
        )}
      </KeystoneCard>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Waiting for you</h2>
        {(waiting ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-dim">Nothing waiting.</p>
        ) : null}
        {(waiting ?? []).map((w) => {
          const options = (sessions ?? []).filter((s) => !w.client_id || s.client_id === w.client_id)
          return (
            <KeystoneCard key={w.id} className="mt-4">
              <p className="eyebrow">
                {clientName(w) ?? 'Client unclear'} / {fmt(w.started_at)}
              </p>
              <p className="mt-2 text-sm font-medium text-ink">{w.title ?? 'Untitled call'}</p>
              <p className="mt-1 text-sm text-ink-dim">{REASONS[w.match_reason] ?? ''}</p>
              {(w.participant_emails ?? []).length > 0 ? (
                <p className="mt-1 text-sm text-ink-dim">On the call: {w.participant_emails.join(', ')}</p>
              ) : null}
              {w.report_url ? (
                <p className="mt-1 text-sm">
                  <a href={w.report_url} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                    Open the report in Read AI
                  </a>
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <form action={attachMeeting} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="meetingId" value={w.id} />
                  <label className="flex flex-col text-sm text-ink-dim" style={{ flex: '1 1 220px' }}>
                    Session
                    <select name="sessionId" className={fieldCls} defaultValue="">
                      <option value="" disabled>
                        Pick the session
                      </option>
                      {options.map((s) => (
                        <option key={s.id} value={s.id}>
                          {clientName(s) ?? 'Client'} / {s.kind} / {fmt(s.starts_at, s.tz)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                  >
                    Attach
                  </button>
                </form>
                <form action={discardMeeting}>
                  <input type="hidden" name="meetingId" value={w.id} />
                  <button
                    type="submit"
                    className="rounded-lg border border-ink/20 px-4 py-2 text-sm text-ink-dim transition-colors duration-200 hover:text-ink active:scale-[0.98]"
                  >
                    Not a client call
                  </button>
                </form>
              </div>
              {options.length === 0 ? (
                <p className="mt-2 text-sm text-ink-dim">
                  No session nearby. Book one for this call on the engagement, then attach it here.
                </p>
              ) : null}
            </KeystoneCard>
          )
        })}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Recently received</h2>
        {(recent ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-dim">Nothing yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {(recent ?? []).map((r) => (
              <li key={r.id} className="text-ink-dim">
                {r.status === 'attached' && r.session_id ? (
                  <Link href={`/sessions/${r.session_id}/notes`} className="text-ink underline">
                    {r.title ?? 'Call'}
                  </Link>
                ) : (
                  <span>A call with no client on it, not kept</span>
                )}
                {r.status === 'attached' && clientName(r) ? ` / ${clientName(r)}` : ''} /{' '}
                {fmt(r.started_at ?? r.received_at)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </RoomShell>
  )
}

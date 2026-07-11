import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { assembleSlots } from '@/lib/slotAssembly'
import { bookSession, cancelSession, rescheduleSession, togglePollMark } from './actions'
import type { Slot } from '@/lib/scheduling'

/**
 * The client sessions page (Ring 2): upcoming and past sessions, and
 * booking from the consultant's availability. Pure RLS surface.
 */

const STATES: Record<string, string> = {
  booked: 'Booked. It lands on the calendar shortly.',
  rescheduled: 'Rescheduled.',
  canceled: 'Canceled.',
  slot_gone: 'That time was just taken. Pick another.',
  no_engagement: 'No active engagement to book against yet.',
  invalid: 'That request did not parse. Try again.',
  slow: 'Too many changes at once. Wait a minute.',
  error: 'That did not save. Try again.',
}

function fmt(dt: string | Date, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(typeof dt === 'string' ? new Date(dt) : dt)
}

function dayKey(s: Slot): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: s.tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(s.startsAt)
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; reschedule?: string }>
}) {
  const { state, reschedule } = await searchParams
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const nowIso = new Date().toISOString()
  const [upcomingRes, pastRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, starts_at, ends_at, tz, kind, status, purpose')
      .eq('client_id', viewer.client.clientId)
      .eq('status', 'booked')
      .gte('ends_at', nowIso)
      .order('starts_at', { ascending: true }),
    supabase
      .from('sessions')
      .select('id, starts_at, tz, kind, status')
      .eq('client_id', viewer.client.clientId)
      .in('status', ['booked', 'held'])
      .lt('ends_at', nowIso)
      .order('starts_at', { ascending: false })
      .limit(10),
  ])
  const upcoming = upcomingRes.data ?? []
  const past = pastRes.data ?? []

  // Prep resources surfaced above upcoming sessions (spec 6.4). Pure
  // RLS: the prep policy admits only this client's links.
  const prepBySession = new Map<string, Array<{ id: string; title: string }>>()
  if (upcoming.length > 0) {
    const { data: prep } = await supabase
      .from('session_prep_resources')
      .select('session_id, resource_id, resources(title)')
      .in('session_id', upcoming.map((s) => s.id))
    for (const p of prep ?? []) {
      const list = prepBySession.get(p.session_id) ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list.push({ id: p.resource_id, title: ((p.resources as any)?.title as string) ?? 'resource' })
      prepBySession.set(p.session_id, list)
    }
  }

  // The date poll (V2 3H): if the consultant opened one, it sits above
  // everything, because agreeing on the next date is the next move.
  const { data: openPoll } = await supabase
    .from('session_polls')
    .select('id, purpose')
    .eq('client_id', viewer.client.clientId)
    .eq('status', 'open')
    .maybeSingle()
  const [{ data: pollOptions }, { data: pollMarks }, { data: myMembership }] = openPoll
    ? await Promise.all([
        supabase
          .from('session_poll_options')
          .select('id, starts_at, tz, sort')
          .eq('poll_id', openPoll.id)
          .order('sort'),
        supabase
          .from('session_poll_marks')
          .select('option_id, client_member_id, client_members:client_member_id(email)')
          .eq('poll_id', openPoll.id),
        supabase
          .from('client_members')
          .select('id')
          .eq('user_id', viewer.user!.id)
          .eq('client_id', viewer.client.clientId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }, { data: null }]

  const slots = await assembleSlots(supabase, viewer.client, new Date())
  const byDay = new Map<string, Slot[]>()
  for (const s of slots) {
    const k = dayKey(s)
    byDay.set(k, [...(byDay.get(k) ?? []), s])
  }
  const reschedulingId = upcoming.find((s) => s.id === reschedule)?.id ?? null

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Sessions" maxWidth="max-w-4xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      {openPoll ? (
        <section className="mb-10 rounded-[var(--radius)] border border-brass/50 bg-paper-raised p-5">
          <p className="eyebrow">Pick the next date together</p>
          {openPoll.purpose ? <p className="mt-1 text-sm text-ink">{openPoll.purpose}</p> : null}
          <p className="mt-1 text-sm text-ink-dim">
            Tap every time that works for you. Tap again to take one back. Your consultant books
            the one that works for the team.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {(pollOptions ?? []).map((o) => {
              const marks = (pollMarks ?? []).filter((m) => m.option_id === o.id)
              const minePicked = marks.some((m) => m.client_member_id === myMembership?.id)
              /* eslint-disable @typescript-eslint/no-explicit-any */
              const names = marks
                .map((m) => (((m.client_members as any)?.email as string) ?? '').split('@')[0])
                .filter(Boolean)
              /* eslint-enable @typescript-eslint/no-explicit-any */
              return (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper px-4 py-3"
                >
                  <span className="min-w-0 text-sm text-ink">
                    {fmt(o.starts_at, o.tz)}
                    {names.length > 0 ? (
                      <span className="text-ink-dim"> ({names.join(', ')})</span>
                    ) : null}
                  </span>
                  <form action={togglePollMark}>
                    <input type="hidden" name="optionId" value={o.id} />
                    <button
                      type="submit"
                      className={`rounded-lg px-3 py-1.5 text-sm transition-colors duration-200 active:scale-[0.98] ${
                        minePicked
                          ? 'bg-forest text-paper hover:bg-forest-deep'
                          : 'border border-sage text-forest hover:bg-sage hover:text-paper'
                      }`}
                    >
                      {minePicked ? 'Works for me ✓' : 'Works for me'}
                    </button>
                  </form>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-2xl font-medium text-ink">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing booked. Pick a time below.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{fmt(s.starts_at, s.tz)}</span>
                  <span className="flex items-center gap-3">
                    <a
                      href={reschedulingId === s.id ? '/sessions' : `/sessions?reschedule=${s.id}`}
                      className="text-sm text-forest underline"
                    >
                      {reschedulingId === s.id ? 'Keep this time' : 'Reschedule'}
                    </a>
                    <form action={cancelSession}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="text-sm text-ink-dim underline hover:text-ink"
                      >
                        Cancel
                      </button>
                    </form>
                  </span>
                </div>
                {(prepBySession.get(s.id) ?? []).length > 0 ? (
                  <p className="mt-1.5 text-sm text-ink-dim">
                    Prep:{' '}
                    {(prepBySession.get(s.id) ?? []).map((r, i) => (
                      <span key={r.id}>
                        {i > 0 ? ', ' : ''}
                        <a href={`/library/${r.id}`} className="text-forest underline">
                          {r.title}
                        </a>
                      </span>
                    ))}
                  </p>
                ) : null}
                {s.purpose ? (
                  <p className="mt-1.5 text-sm text-ink-dim">
                    {s.purpose}{' '}
                    <Link href={`/sessions/${s.id}`} className="text-forest underline">
                      Run of show
                    </Link>
                  </p>
                ) : null}
                {reschedulingId === s.id ? (
                  <p className="eyebrow mt-2">Pick a new time below</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">
          {reschedulingId ? 'Pick the new time' : 'Book a session'}
        </h2>
        {slots.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            No open times in the next two weeks. Your consultant will share more availability.
          </p>
        ) : reschedulingId ? (
          <form action={rescheduleSession} className="mt-4 flex flex-col gap-5">
            <input type="hidden" name="id" value={reschedulingId} />
            {[...byDay.entries()].map(([day, daySlots]) => (
              <div key={day}>
                <p className="eyebrow">{day}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {daySlots.map((s) => (
                    <label
                      key={s.startsAt.toISOString()}
                      className="flex items-center gap-1.5 rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink"
                    >
                      <input type="radio" name="start" value={s.startsAt.toISOString()} required />
                      {new Intl.DateTimeFormat('en-US', {
                        timeZone: s.tz,
                        hour: 'numeric',
                        minute: '2-digit',
                      }).format(s.startsAt)}
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <input
              name="note"
              maxLength={300}
              placeholder="A word on why, for your consultant (optional)"
              className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
            />
            <button
              type="submit"
              className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Move the session
            </button>
          </form>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {[...byDay.entries()].map(([day, daySlots]) => (
              <div key={day}>
                <p className="eyebrow">{day}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {daySlots.map((s) => (
                    <form key={s.startsAt.toISOString()} action={bookSession}>
                      <input type="hidden" name="start" value={s.startsAt.toISOString()} />
                      <button
                        type="submit"
                        className="rounded-lg border border-forest px-3 py-1.5 text-sm text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
                      >
                        {new Intl.DateTimeFormat('en-US', {
                          timeZone: s.tz,
                          hour: 'numeric',
                          minute: '2-digit',
                        }).format(s.startsAt)}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Past</h2>
        {past.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            Past sessions with notes and decisions appear here after your first one.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {past.map((s) => (
              <li key={s.id} className="text-sm">
                <a href={`/sessions/${s.id}`} className="text-forest underline">
                  {fmt(s.starts_at, s.tz)}
                </a>
                <span className="text-ink-dim"> notes and decisions</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </RoomShell>
  )
}

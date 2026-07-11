import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { loopStatesByItem } from '@/lib/homework'

/**
 * The team view (V2 4C): who is carrying what, and where work is
 * waiting. One section per active practice member: engagements owned,
 * workstreams owned, the next seven days of sessions (a session
 * belongs to its engagement's owner), and the waiting-on facts inside
 * their engagements. Unowned work renders first-class: the gap is the
 * signal. Descriptive throughout; no capacity, no utilization, no
 * ranking, the humane rule turned inward.
 */

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

export default async function TeamPage() {
  const supabase = await createServerSupabase()
  // Per-request wall clock is intended: the week as of THIS render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  const weekOut = new Date(now + 7 * 86400000).toISOString()

  const [roster, engagements, workstreams, weekSessions, msgs, openReview, hwTrail] =
    await Promise.all([
      supabase
        .from('practice_members')
        .select('id, email')
        .is('revoked_at', null)
        .not('user_id', 'is', null)
        .order('email'),
      supabase
        .from('engagements')
        .select('id, title, status, owner_practice_member_id, clients(name)')
        .order('created_at', { ascending: true }),
      supabase
        .from('workstreams')
        .select('id, title, stage, engagement_id, owner_practice_member_id')
        .order('sort'),
      supabase
        .from('sessions')
        .select('id, engagement_id, starts_at, tz, purpose')
        .eq('status', 'booked')
        .gte('starts_at', nowIso)
        .lt('starts_at', weekOut)
        .order('starts_at'),
      supabase
        .from('messages')
        .select('thread_id, engagement_id, author_side, created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('action_items')
        .select('id, engagement_id')
        .eq('status', 'open')
        .eq('review_requested', true),
      supabase.from('homework_activity').select('action_item_id, kind, created_at'),
    ])

  // Waiting-on-us facts per engagement: the last word in a thread is
  // the client's, or a submission is standing in the review trail.
  const latestByThread = new Map<string, { engagement_id: string; author_side: string }>()
  for (const m of msgs.data ?? []) {
    if (!latestByThread.has(m.thread_id)) latestByThread.set(m.thread_id, m)
  }
  const unansweredByEng = new Map<string, number>()
  for (const m of latestByThread.values()) {
    if (m.author_side !== 'client') continue
    unansweredByEng.set(m.engagement_id, (unansweredByEng.get(m.engagement_id) ?? 0) + 1)
  }
  const loopStates = loopStatesByItem(hwTrail.data ?? [])
  const submittedByEng = new Map<string, number>()
  for (const it of openReview.data ?? []) {
    if (loopStates.get(it.id) !== 'submitted') continue
    submittedByEng.set(it.engagement_id, (submittedByEng.get(it.engagement_id) ?? 0) + 1)
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const clientOf = (row: any) => ((row.clients as any)?.name as string) ?? ''
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const engs = engagements.data ?? []
  const wss = workstreams.data ?? []
  const engTitle = (id: string) => {
    const e = engs.find((x) => x.id === id)
    return e ? `${clientOf(e)}: ${e.title}` : ''
  }

  const waitingLine = (ownedEngIds: string[]): string | null => {
    let messages = 0
    let submissions = 0
    for (const id of ownedEngIds) {
      messages += unansweredByEng.get(id) ?? 0
      submissions += submittedByEng.get(id) ?? 0
    }
    if (messages === 0 && submissions === 0) return null
    const parts: string[] = []
    if (messages > 0) parts.push(messages === 1 ? 'one unanswered message' : `${messages} unanswered messages`)
    if (submissions > 0)
      parts.push(submissions === 1 ? 'one submission to review' : `${submissions} submissions to review`)
    return `Waiting in their rooms: ${parts.join(', ')}.`
  }

  const unownedEngs = engs.filter((e) => !e.owner_practice_member_id)
  const unownedWs = wss.filter((w) => !w.owner_practice_member_id)

  return (
    <RoomShell eyebrow="The practice" title="Team" maxWidth="max-w-4xl">
      <p className="mb-8 text-sm text-ink-dim">
        Who is carrying what, and where work is waiting. Owners are set on each engagement page.
      </p>

      <div className="flex flex-col gap-8">
        {(roster.data ?? []).map((m) => {
          const owned = engs.filter((e) => e.owner_practice_member_id === m.id)
          const ownedWs = wss.filter((w) => w.owner_practice_member_id === m.id)
          const ownedIds = new Set(owned.map((e) => e.id))
          const sessions = (weekSessions.data ?? []).filter((s) => ownedIds.has(s.engagement_id))
          const waiting = waitingLine([...ownedIds])
          return (
            <KeystoneCard key={m.id}>
              <p className="eyebrow">{m.email}</p>

              {owned.length === 0 && ownedWs.length === 0 ? (
                <p className="mt-3 text-sm text-ink-dim">Owns nothing yet.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {owned.length > 0 ? (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-ink-dim">Engagements</p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {owned.map((e) => (
                          <li key={e.id} className="text-sm text-ink">
                            <Link href={`/engagements/${e.id}`} className="text-forest underline">
                              {clientOf(e)}: {e.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {ownedWs.length > 0 ? (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-ink-dim">Workstreams</p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {ownedWs.map((w) => (
                          <li key={w.id} className="text-sm text-ink">
                            <Link href={`/engagements/${w.engagement_id}`} className="underline">
                              {w.title}
                            </Link>{' '}
                            <span className="text-ink-dim">
                              ({engTitle(w.engagement_id)}, {w.stage})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {sessions.length > 0 ? (
                    <div>
                      <p className="text-xs uppercase tracking-wide text-ink-dim">This week</p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {sessions.map((s) => (
                          <li key={s.id} className="text-sm text-ink">
                            <Link href={`/sessions/${s.id}/notes`} className="text-forest underline">
                              {fmt(s.starts_at, s.tz)}
                            </Link>{' '}
                            <span className="text-ink-dim">
                              {engTitle(s.engagement_id)}
                              {s.purpose ? `: ${s.purpose}` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {waiting ? <p className="text-sm text-ink">{waiting}</p> : null}
                </div>
              )}
            </KeystoneCard>
          )
        })}

        <KeystoneCard>
          <p className="eyebrow">No owner yet</p>
          <p className="mt-1 text-xs text-ink-dim">Unowned work is the first workload fact.</p>
          {unownedEngs.length === 0 && unownedWs.length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">Everything has an owner.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {unownedEngs.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {unownedEngs.map((e) => (
                    <li key={e.id} className="text-sm text-ink">
                      <Link href={`/engagements/${e.id}`} className="text-forest underline">
                        {clientOf(e)}: {e.title}
                      </Link>{' '}
                      <span className="text-ink-dim">(engagement)</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {unownedWs.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {unownedWs.map((w) => (
                    <li key={w.id} className="text-sm text-ink">
                      <Link href={`/engagements/${w.engagement_id}`} className="underline">
                        {w.title}
                      </Link>{' '}
                      <span className="text-ink-dim">({engTitle(w.engagement_id)}, workstream)</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </KeystoneCard>
      </div>
    </RoomShell>
  )
}

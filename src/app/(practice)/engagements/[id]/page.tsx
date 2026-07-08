import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import WorkstreamArc from '@/components/WorkstreamArc'
import AddDeliverableForm from './AddDeliverableForm'
import { removeDeliverable, replyMessage, saveReadiness } from './actions'

/**
 * Engagement detail (Ring 3): the early mission control. Workstreams,
 * sessions (linking to the run of show), the homework ledger, the
 * review queue (checked off in the last 14 days), and the readiness
 * panel. Facts beside judgment, never a grade.
 */

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']
const PILLARS = ['philosophy', 'system', 'execution'] as const

const STATES: Record<string, string> = {
  msg_sent: 'Reply sent. The client gets an email.',
  msg_sent_no_email: 'Your reply is saved and visible, but the email notification did not go out.',
  msg_error: 'That did not send. Try again.',
  slow: 'Too many messages at once. Wait a minute.',
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
    .select('id, title, status, practice_id, clients(name)')
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
      .select('id, title, stage, sort')
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
      .select('id, title, status, due_on, done_at, client_members:assigned_client_member_id(email)')
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

  const stages =
    Array.isArray(practice.data?.stage_config) && practice.data.stage_config.length > 0
      ? (practice.data.stage_config as string[])
      : DEFAULT_STAGES
  const open = (items.data ?? []).filter((i) => i.status === 'open')
  const reviewQueue = (items.data ?? []).filter(
    (i) => i.status === 'done' && i.done_at && i.done_at >= twoWeeksAgo
  )
  const readinessByPillar = new Map((readiness.data ?? []).map((r) => [r.pillar, r]))
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const assignee = (it: any) => (it.client_members as any)?.email ?? 'unassigned'
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <p className="eyebrow">{((engagement.clients as any)?.name as string) ?? ''}</p>
      <h1 className="text-page-title mt-2 text-ink">{engagement.title}</h1>

      {state && STATES[state] ? (
        <p role="status" className="mt-4 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <section className="mt-10 flex flex-col gap-6">
        {(ws.data ?? []).map((w) => (
          <WorkstreamArc key={w.id} title={w.title} stage={w.stage} stages={stages} freshStages={[]} />
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

        <section>
          <h2 className="font-display text-2xl font-medium text-ink">Homework ledger</h2>
          {open.length === 0 ? (
            <p className="mt-3 text-sm text-ink-dim">Nothing open.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1">
              {open.map((it) => (
                <li key={it.id} className="text-sm text-ink">
                  {it.title}{' '}
                  <span className="text-ink-dim">
                    ({assignee(it)}
                    {it.due_on ? `, due ${it.due_on}` : ''})
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="font-display mt-6 text-xl font-medium text-ink">Recently checked off</h3>
          {reviewQueue.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">Nothing in the last two weeks.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {reviewQueue.map((it) => (
                <li key={it.id} className="text-sm text-ink-dim">
                  {it.title} ({assignee(it)})
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

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
    </div>
  )
}

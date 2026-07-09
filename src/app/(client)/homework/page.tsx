import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { setHomeworkStatus } from './actions'

/**
 * The client homework page (Ring 3). Everything in the engagement is
 * visible to all four members (that visibility IS the product); the
 * check-off writes only your own items. History renders as history:
 * no streaks, no percentages, no leaderboard.
 */

function fmtDue(due: string | null): string {
  if (!due) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${due}T00:00:00Z`))
}

export default async function HomeworkPage() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const [{ data: items }, { data: myMembership }] = await Promise.all([
    supabase
      .from('action_items')
      .select(
        'id, title, status, due_on, timing, done_at, assigned_client_member_id, client_members:assigned_client_member_id(email)'
      )
      .eq('client_id', viewer.client.clientId)
      .order('due_on', { ascending: true, nullsFirst: false }),
    supabase
      .from('client_members')
      .select('id')
      .eq('user_id', viewer.user.id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
  ])

  const myId = myMembership?.id ?? null
  const open = (items ?? []).filter((i) => i.status === 'open')
  const mine = open.filter((i) => i.assigned_client_member_id === myId)
  const team = open.filter((i) => i.assigned_client_member_id !== myId)
  const done = (items ?? [])
    .filter((i) => i.status === 'done')
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''))
    .slice(0, 15)

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const who = (it: any) => ((it.client_members as any)?.email as string)?.split('@')[0] ?? 'unassigned'
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Homework" maxWidth="max-w-4xl">
      <section>
        <h2 className="font-display text-2xl font-medium text-ink">Yours</h2>
        {mine.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing due. See you at the next session.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {mine.map((it) => (
              <li
                key={it.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-3"
              >
                <span className="text-sm text-ink">
                  {it.title}
                  {it.due_on ? <span className="text-ink-dim"> (due {fmtDue(it.due_on)})</span> : null}
                </span>
                <form action={setHomeworkStatus}>
                  <input type="hidden" name="id" value={it.id} />
                  <input type="hidden" name="to" value="done" />
                  <button
                    type="submit"
                    className="rounded-lg border border-sage px-3 py-1.5 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper active:scale-[0.98]"
                  >
                    Done
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">The team</h2>
        {team.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing else open.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {team.map((it) => (
              <li key={it.id} className="text-sm text-ink">
                {it.title}{' '}
                <span className="text-ink-dim">
                  ({who(it)}
                  {it.due_on ? `, due ${fmtDue(it.due_on)}` : ''})
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Done</h2>
        {done.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Checked-off work lands here.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1">
            {done.map((it) => (
              <li key={it.id} className="flex flex-wrap items-center gap-2 text-sm text-ink-dim">
                <span className="line-through decoration-sage decoration-2">{it.title}</span>
                <span>({who(it)})</span>
                {it.assigned_client_member_id === myId ? (
                  <form action={setHomeworkStatus}>
                    <input type="hidden" name="id" value={it.id} />
                    <input type="hidden" name="to" value="open" />
                    <button type="submit" className="text-xs underline">
                      Reopen
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </RoomShell>
  )
}

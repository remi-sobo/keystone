import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { MarkdownLite } from '@/components/MarkdownLite'
import { deriveLoopState, KIND_LABEL, LOOP_LABEL } from '@/lib/homework'
import { addHomeworkActivity, setHomeworkStatus } from '../actions'

/**
 * One homework item (V2 3C, pure RLS). The whole team can open the
 * page (title, body, due, open or done); the loop, the trail, and the
 * forms exist only for the assignee, because the homework_activity
 * read policy returns rows only to the coachee and the practice. The
 * page renders what RLS returns; it never works around it.
 */

const STATES: Record<string, string> = {
  saved: 'Saved.',
  empty: 'Write a note first.',
  badlink: 'Links here start with http:// or https://.',
  error: 'That did not save. Try again.',
}

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(iso))
}

export default async function HomeworkItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')
  const { id } = await params
  const { state } = await searchParams
  const supabase = await createServerSupabase()

  const [{ data: item }, { data: myMembership }] = await Promise.all([
    supabase
      .from('action_items')
      .select(
        'id, title, body_md, status, due_on, done_at, review_requested, assigned_client_member_id, workstreams(title), client_members:assigned_client_member_id(email)'
      )
      .eq('id', id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('id')
      .eq('user_id', viewer.user.id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
  ])
  if (!item) redirect('/homework')

  const mine = item.assigned_client_member_id != null && item.assigned_client_member_id === myMembership?.id

  // The trail: RLS returns rows only to the assignee (and the practice),
  // so for a teammate this is simply empty.
  const { data: trail } = await supabase
    .from('homework_activity')
    .select('id, kind, body_md, link_url, created_at, author_client_member_id, client_members:author_client_member_id(email)')
    .eq('action_item_id', item.id)
    .order('created_at', { ascending: true })

  const loop = deriveLoopState(trail ?? [])
  const chip =
    item.status === 'done' ? 'Done' : item.review_requested ? LOOP_LABEL[loop] : null

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const assignee = ((item.client_members as any)?.email as string)?.split('@')[0] ?? 'unassigned'
  const wsTitle = (item.workstreams as any)?.title as string | undefined
  const authorOf = (row: any) =>
    row.author_client_member_id
      ? (((row.client_members as any)?.email as string)?.split('@')[0] ?? 'teammate')
      : 'Your consultant'
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const submitOpen =
    mine && item.review_requested && item.status === 'open' && loop !== 'accepted'

  return (
    <RoomShell eyebrow={viewer.client.clientName} title={item.title} maxWidth="max-w-3xl">
      <p className="text-sm text-ink-dim">
        <Link href="/homework" className="text-forest underline">
          Homework
        </Link>
        {wsTitle ? <> · {wsTitle}</> : null}
        {item.due_on ? <> · due {item.due_on}</> : null}
        <> · {assignee}</>
        {chip ? <span className="eyebrow ml-2">{chip}</span> : null}
      </p>

      {state && STATES[state] ? (
        <p role="status" className="mt-3 text-sm text-ink-dim">
          {STATES[state]}
        </p>
      ) : null}

      {item.body_md ? (
        <div className="mt-6 rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5">
          <MarkdownLite text={item.body_md} />
        </div>
      ) : null}

      {(trail ?? []).length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-medium text-ink">The thread</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {(trail ?? []).map((row) => (
              <li key={row.id} className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-3">
                <p className="text-xs text-ink-dim">
                  {authorOf(row)} · {fmtDay(row.created_at)}
                  {KIND_LABEL[row.kind] ? <span className="eyebrow ml-2">{KIND_LABEL[row.kind]}</span> : null}
                </p>
                {row.body_md ? (
                  <div className="mt-1">
                    <MarkdownLite text={row.body_md} />
                  </div>
                ) : null}
                {row.link_url ? (
                  <p className="mt-1 text-sm">
                    <a href={row.link_url} target="_blank" rel="noopener noreferrer" className="text-forest underline">
                      {row.link_url}
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {mine ? (
        <section className="mt-8 flex flex-col gap-6">
          {submitOpen ? (
            <form action={addHomeworkActivity} className="flex flex-col gap-2">
              <h2 className="font-display text-2xl font-medium text-ink">
                {loop === 'needs_revision' ? 'Resubmit' : 'Submit for review'}
              </h2>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="kind" value="submission" />
              <textarea
                name="body"
                rows={4}
                maxLength={4000}
                placeholder="What you did, in your own words."
                className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
              />
              <input
                name="link"
                type="url"
                maxLength={600}
                placeholder="A link to the work, if it lives somewhere (optional)"
                className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
              />
              <button
                type="submit"
                className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
              >
                {loop === 'needs_revision' ? 'Resubmit' : 'Submit'}
              </button>
            </form>
          ) : null}

          {!item.review_requested ? (
            <form action={setHomeworkStatus}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="to" value={item.status === 'open' ? 'done' : 'open'} />
              <button
                type="submit"
                className="rounded-lg border border-sage px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper active:scale-[0.98]"
              >
                {item.status === 'open' ? 'Mark done' : 'Reopen'}
              </button>
            </form>
          ) : null}

          <form action={addHomeworkActivity} className="flex flex-col gap-2">
            <h3 className="font-display text-xl font-medium text-ink">Add a note</h3>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="kind" value="comment" />
            <textarea
              name="body"
              rows={3}
              maxLength={4000}
              placeholder="A question, an update, a thought. Only you and your consultant read this."
              className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
            />
            <button
              type="submit"
              className="self-start rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink transition-colors duration-200 hover:border-ink/30 active:scale-[0.98]"
            >
              Post note
            </button>
          </form>

          {item.status === 'open' ? (
            loop === 'blocked' ? (
              <form action={addHomeworkActivity}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="kind" value="unblocked" />
                <button type="submit" className="text-sm text-forest underline">
                  Clear the block
                </button>
              </form>
            ) : (
              <form action={addHomeworkActivity} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="kind" value="blocked" />
                <textarea
                  name="body"
                  rows={2}
                  maxLength={4000}
                  placeholder="Stuck? Say where, and your consultant sees it."
                  className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
                />
                <button type="submit" className="self-start text-sm text-ink-dim underline">
                  Mark blocked
                </button>
              </form>
            )
          ) : null}
        </section>
      ) : (
        <p className="mt-8 text-sm text-ink-dim">
          This one is with {assignee}. The working notes on an item stay between the person doing
          it and the consultant.
        </p>
      )}
    </RoomShell>
  )
}

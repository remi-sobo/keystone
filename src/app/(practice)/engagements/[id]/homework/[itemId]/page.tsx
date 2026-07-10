import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { MarkdownLite } from '@/components/MarkdownLite'
import { deriveLoopState, KIND_LABEL, LOOP_LABEL } from '@/lib/homework'
import {
  acceptHomework,
  editHomework,
  practiceHomeworkComment,
  sendBackHomework,
} from '../../actions'

/**
 * One homework item, practice side (V2 3C). The full trail (the
 * practice reads everything under RLS), the accept and send-back
 * moves, a comment box, and the small edits (due date, the review
 * toggle until the first submission). Session reads; session writes
 * under the mirror policies.
 */

const STATES: Record<string, string> = {
  hw_saved: 'Saved.',
  hw_accepted: 'Accepted. The item is done and the coachee sees your note.',
  hw_sent_back: 'Sent back. The coachee sees your note and can resubmit.',
  hw_note_needed: 'Write the note first; a send-back without words is a shrug.',
  hw_locked: 'The review toggle locks once a submission lands.',
  hw_error: 'That did not save. Try again.',
}

function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))
}

export default async function PracticeHomeworkItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; itemId: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const { id, itemId } = await params
  const { state } = await searchParams
  const supabase = await createServerSupabase()

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  const { data: item } = await supabase
    .from('action_items')
    .select(
      'id, title, body_md, status, due_on, done_at, review_requested, audience, assigned_client_member_id, workstreams(title), client_members:assigned_client_member_id(email), practice_members:assigned_practice_member_id(email)'
    )
    .eq('id', itemId)
    .eq('engagement_id', id)
    .maybeSingle()
  if (!item) redirect(`/engagements/${id}`)

  const { data: trail } = await supabase
    .from('homework_activity')
    .select(
      'id, kind, body_md, link_url, created_at, author_client_member_id, client_members:author_client_member_id(email), practice_members:author_practice_member_id(email)'
    )
    .eq('action_item_id', itemId)
    .order('created_at', { ascending: true })

  const loop = deriveLoopState(trail ?? [])
  const chip =
    item.status === 'done' ? 'Done' : item.review_requested ? LOOP_LABEL[loop] : null

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const assignee =
    ((item.client_members as any)?.email as string) ??
    ((item.practice_members as any)?.email as string) ??
    'unassigned'
  const wsTitle = (item.workstreams as any)?.title as string | undefined
  const authorOf = (row: any) =>
    ((row.client_members as any)?.email as string)?.split('@')[0] ??
    ((row.practice_members as any)?.email as string)?.split('@')[0] ??
    'unknown'
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const reviewable = item.review_requested && item.status === 'open'

  return (
    <RoomShell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eyebrow={((engagement.clients as any)?.name as string) ?? ''}
      title={item.title}
      maxWidth="max-w-3xl"
    >
      <p className="text-sm text-ink-dim">
        <Link href={`/engagements/${id}#homework`} className="text-forest underline">
          {engagement.title}
        </Link>
        {wsTitle ? <> · {wsTitle}</> : null}
        <> · {assignee.split('@')[0]}</>
        {item.due_on ? <> · due {item.due_on}</> : null}
        {item.audience === 'practice' ? <span className="eyebrow ml-2">internal</span> : null}
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

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">The thread</h2>
        {(trail ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {(trail ?? []).map((row) => (
              <li
                key={row.id}
                className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-3"
              >
                <p className="text-xs text-ink-dim">
                  {authorOf(row)} · {fmtDay(row.created_at)}
                  {KIND_LABEL[row.kind] ? (
                    <span className="eyebrow ml-2">{KIND_LABEL[row.kind]}</span>
                  ) : null}
                </p>
                {row.body_md ? (
                  <div className="mt-1">
                    <MarkdownLite text={row.body_md} />
                  </div>
                ) : null}
                {row.link_url ? (
                  <p className="mt-1 text-sm">
                    <a
                      href={row.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-forest underline"
                    >
                      {row.link_url}
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {reviewable ? (
        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <form action={acceptHomework} className="flex flex-col gap-2">
            <h3 className="font-display text-xl font-medium text-ink">Accept</h3>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="engagementId" value={id} />
            <textarea
              name="note"
              rows={3}
              maxLength={4000}
              placeholder="A word on what landed well (optional)"
              className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
            />
            <button
              type="submit"
              className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Accept and close
            </button>
          </form>
          <form action={sendBackHomework} className="flex flex-col gap-2">
            <h3 className="font-display text-xl font-medium text-ink">Send back</h3>
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="engagementId" value={id} />
            <textarea
              name="note"
              rows={3}
              maxLength={4000}
              placeholder="What to tighten, and why. The coachee reads this."
              className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
            />
            <button
              type="submit"
              className="self-start rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink transition-colors duration-200 hover:border-ink/30 active:scale-[0.98]"
            >
              Send back with the note
            </button>
          </form>
        </section>
      ) : null}

      <section className="mt-8 flex flex-col gap-6">
        <form action={practiceHomeworkComment} className="flex flex-col gap-2">
          <h3 className="font-display text-xl font-medium text-ink">Add a note</h3>
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="engagementId" value={id} />
          <textarea
            name="note"
            rows={3}
            maxLength={4000}
            placeholder="Only you and the assignee read the thread."
            className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
          />
          <button
            type="submit"
            className="self-start rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink transition-colors duration-200 hover:border-ink/30 active:scale-[0.98]"
          >
            Post note
          </button>
        </form>

        <details>
          <summary className="cursor-pointer text-sm text-ink-dim">Edit the item</summary>
          <form action={editHomework} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="engagementId" value={id} />
            <label className="flex flex-col gap-1 text-sm text-ink">
              Due
              <input
                type="date"
                name="dueOn"
                defaultValue={item.due_on ?? ''}
                className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              />
            </label>
            {item.assigned_client_member_id ? (
              <label className="flex items-center gap-2 pb-2 text-sm text-ink">
                <input type="checkbox" name="review" defaultChecked={item.review_requested} />
                Needs review before done
              </label>
            ) : null}
            <button
              type="submit"
              className="rounded-lg border border-ink/15 px-4 py-2 text-sm text-ink transition-colors duration-200 hover:border-ink/30 active:scale-[0.98]"
            >
              Save
            </button>
          </form>
        </details>
      </section>
    </RoomShell>
  )
}

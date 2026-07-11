import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { markAllNotificationsRead, sendMessage } from './actions'

/**
 * The client message thread (Ring 5): one thread with the practice, per
 * engagement. No presence, no typing indicators; write, and an email
 * reaches your consultant with a link back here. Pure RLS surface.
 * Opening the page marks the practice's messages read (read receipts
 * ride a column-level grant; nothing else on a message can change).
 */

const STATES: Record<string, string> = {
  sent: 'Sent. Your consultant gets an email.',
  sent_no_email: 'Your message is saved and visible, but the email notification did not go out.',
  invalid: 'Write something first.',
  no_engagement: 'No active engagement to message on yet.',
  slow: 'Too many messages at once. Wait a minute.',
  error: 'That did not send. Try again.',
}

function fmt(dt: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dt))
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: thread } = await supabase
    .from('message_threads')
    .select('id')
    .eq('client_id', viewer.client.clientId)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: messages } = thread
    ? await supabase
        .from('messages')
        .select('id, author_side, author_user_id, body, created_at, read_at')
        .eq('thread_id', thread.id)
        .order('created_at', { ascending: true })
    : { data: [] }

  // 4F: your notifications (RLS returns only yours), newest first.
  const { data: newForYou } = await supabase
    .from('notifications')
    .select('id, kind, title, href, created_at')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(20)

  // Read receipt: the practice's words, now seen by the client.
  const unseen = (messages ?? []).filter((m) => m.author_side === 'practice' && !m.read_at)
  if (unseen.length > 0) {
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unseen.map((m) => m.id))
      .is('read_at', null)
  }

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Messages" maxWidth="max-w-3xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      {(newForYou ?? []).length > 0 ? (
        <section className="mb-8 rounded-[var(--radius)] border border-brass/50 bg-paper-raised p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">New for you</p>
            <form action={markAllNotificationsRead}>
              <button type="submit" className="text-xs text-ink-dim underline hover:text-ink">
                Mark all read
              </button>
            </form>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {(newForYou ?? []).map((n) => (
              <li key={n.id} className="text-sm text-ink">
                <Link href={n.href} className="text-forest underline">
                  {n.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        {(messages ?? []).length === 0 ? (
          <p className="text-sm text-ink-dim">
            Nothing yet. Write below; your consultant gets an email and replies here.
          </p>
        ) : (
          (messages ?? []).map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-[var(--radius)] border border-ink/10 p-3 ${
                m.author_side === 'client' ? 'self-end bg-paper-raised' : 'self-start bg-paper-deep'
              }`}
            >
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{m.body}</p>
              <p className="mt-1.5 font-mono text-[0.65rem] uppercase text-ink-dim">
                {m.author_side === 'client' ? 'You' : 'Your consultant'} / {fmt(m.created_at)}
                {m.author_side === 'client' && m.read_at ? ' / seen' : ''}
              </p>
            </div>
          ))
        )}
      </section>

      <form action={sendMessage} className="mt-8">
        <textarea
          name="body"
          rows={4}
          placeholder="Write to your consultant."
          className="w-full rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
        />
        <button
          type="submit"
          className="mt-3 rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
        >
          Send
        </button>
      </form>
    </RoomShell>
  )
}

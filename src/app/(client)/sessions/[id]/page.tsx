import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'

/**
 * Client session detail (Ring 3, spec 6.4): date and attendees in mono
 * eyebrow, decisions as the led block, the session's homework, and the
 * transcript folded behind a disclosure. Pure RLS: an unshared note
 * (and its transcript) returns zero rows here by policy, so this page
 * simply renders what the wall admits.
 */

export default async function ClientSessionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: session } = await supabase
    .from('sessions')
    .select('id, starts_at, tz, kind, status')
    .eq('id', id)
    .eq('client_id', viewer.client.clientId)
    .maybeSingle()
  if (!session) redirect('/sessions')

  const [{ data: note }, { data: items }, { data: prep }] = await Promise.all([
    supabase
      .from('session_notes')
      .select('summary_md, decisions_md, raw_transcript, visibility')
      .eq('session_id', id)
      .maybeSingle(),
    supabase
      .from('action_items')
      .select('id, title, status, due_on, client_members:assigned_client_member_id(email)')
      .eq('session_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('session_prep_resources')
      .select('resource_id, resources(title, kind)')
      .eq('session_id', id),
  ])

  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: session.tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(session.starts_at))

  return (
    <RoomShell
      eyebrow={`${viewer.client.clientName} / ${session.kind} / ${when}`}
      title="Session"
      maxWidth="max-w-3xl"
    >
      {(prep ?? []).length > 0 ? (
        <KeystoneCard feature>
          <p className="eyebrow">Prep for this session</p>
          <ul className="mt-2 flex flex-col gap-1">
            {(prep ?? []).map((p) => (
              <li key={p.resource_id} className="text-sm">
                <a href={`/library/${p.resource_id}`} className="text-forest underline">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {((p.resources as any)?.title as string) ?? 'resource'}
                </a>{' '}
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <span className="font-mono text-xs uppercase text-ink-dim">{((p.resources as any)?.kind as string) ?? ''}</span>
              </li>
            ))}
          </ul>
        </KeystoneCard>
      ) : null}

      {note?.summary_md ? (
        <>
          <section className="mt-8">
            <h2 className="font-display text-2xl font-medium text-ink">What we covered</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
              {note.summary_md}
            </p>
          </section>

          {note.decisions_md ? (
            <section className="mt-8">
              <h2 className="font-display text-2xl font-medium text-ink">Decisions</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">
                {note.decisions_md}
              </p>
            </section>
          ) : null}
        </>
      ) : (
        <p className="mt-8 text-sm text-ink-dim">
          Notes from this session land here once your consultant publishes them.
        </p>
      )}

      {(items ?? []).length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-medium text-ink">Homework from this session</h2>
          <ul className="mt-3 flex flex-col gap-1">
            {(items ?? []).map((it) => (
              <li key={it.id} className="text-sm text-ink">
                {it.title}{' '}
                <span className="text-ink-dim">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  ({((it.client_members as any)?.email as string)?.split('@')[0] ?? 'unassigned'}
                  {it.due_on ? `, due ${it.due_on}` : ''}
                  {it.status === 'done' ? ', done' : ''})
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm">
            <a href="/homework" className="text-forest underline">
              Check yours off on the homework page
            </a>
          </p>
        </section>
      ) : null}

      {note?.raw_transcript ? (
        <details className="mt-10">
          <summary className="eyebrow cursor-pointer">Transcript</summary>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-dim">
            {note.raw_transcript}
          </p>
        </details>
      ) : null}
    </RoomShell>
  )
}

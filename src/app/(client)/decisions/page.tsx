import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'

/**
 * The decision log, client side (V2 2B). Read-only calm history, pure
 * RLS: what was decided, when, by whom, and how thinking changed
 * (superseded rows stay visible, struck through, with their
 * successor). The record reads against the charter.
 */

export default async function ClientDecisionsPage() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const supabase = await createServerSupabase()
  const { data: decisions } = await supabase
    .from('decisions')
    .select('id, title, decided_on, decided_by_label, context_md, supersedes, workstreams(title)')
    .eq('client_id', viewer.client.clientId)
    .order('decided_on', { ascending: false })
    .order('created_at', { ascending: false })

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Decisions" maxWidth="max-w-3xl">
      <p className="text-sm text-ink-dim">
        Every decision made in this engagement, as it was made. When thinking changes, the old
        decision stays, struck through, beside the new one; nothing here is rewritten.
      </p>

      {(decisions ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-ink-dim">
          The first decisions land here after kickoff.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {(decisions ?? []).map((d) => {
            const supersededBy = (decisions ?? []).find((x) => x.supersedes === d.id)
            return (
              <li
                key={d.id}
                className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-3"
              >
                <p className={`text-sm ${supersededBy ? 'text-ink-dim line-through' : 'text-ink'}`}>
                  {d.title}
                </p>
                <p className="mt-0.5 text-xs text-ink-dim">
                  {new Date(d.decided_on + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {d.decided_by_label ? `, ${d.decided_by_label}` : ''}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {((d.workstreams as any)?.title as string) ? `, ${(d.workstreams as any).title}` : ''}
                  {supersededBy ? `, superseded by "${supersededBy.title}"` : ''}
                </p>
                {d.context_md ? <p className="mt-1 text-xs text-ink-dim">{d.context_md}</p> : null}
              </li>
            )
          })}
        </ul>
      )}
    </RoomShell>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText, Link2 } from 'lucide-react'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

/**
 * The deliverables timeline (Ring 4, spec 6.4): a vertical line down a
 * brass hairline, newest first, each artifact a paper-raised card with
 * kind icon, workstream tag in mono, delivered date. The unrolling of
 * receipts for the fee. Pure RLS surface.
 */

function fmt(d: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`))
}

export default async function DeliverablesPage() {
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: deliverables } = await supabase
    .from('deliverables')
    .select('id, title, kind, url, note, delivered_on, workstreams(title)')
    .eq('client_id', viewer.client.clientId)
    .order('delivered_on', { ascending: false })
    .order('created_at', { ascending: false })

  const rows = deliverables ?? []

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <p className="eyebrow">{viewer.client.clientName}</p>
      <h1 className="text-page-title mt-2 text-ink">Deliverables</h1>

      {rows.length === 0 ? (
        <p className="mt-6 text-ink-dim">Your first deliverable lands after the kickoff session.</p>
      ) : (
        <ol className="relative mt-10 flex flex-col gap-6 border-l border-brass/60 pl-6">
          {rows.map((d) => (
            <li key={d.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[1.72rem] top-2 h-2.5 w-2.5 rounded-full border border-brass bg-paper"
              />
              <div className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-4">
                <p className="font-mono text-xs uppercase tracking-wide text-ink-dim">
                  {fmt(d.delivered_on)}
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {((d.workstreams as any)?.title as string) ? ` / ${(d.workstreams as any).title}` : ''}
                </p>
                <p className="mt-1.5 flex items-center gap-2 text-ink">
                  {d.kind === 'file' ? (
                    <FileText size={16} strokeWidth={1.75} aria-hidden className="text-brass" />
                  ) : (
                    <Link2 size={16} strokeWidth={1.75} aria-hidden className="text-brass" />
                  )}
                  {d.kind === 'link' && d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-forest underline"
                    >
                      {d.title}
                    </a>
                  ) : (
                    <Link
                      href={`/deliverables/${d.id}/file`}
                      className="font-medium text-forest underline"
                    >
                      {d.title}
                    </Link>
                  )}
                </p>
                {d.note ? <p className="mt-1.5 text-sm text-ink-dim">{d.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

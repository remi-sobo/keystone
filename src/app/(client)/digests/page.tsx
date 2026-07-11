import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { ArchEmptyState } from '@/components/ArchEmptyState'
import { MarkdownLite } from '@/components/MarkdownLite'

/**
 * The digest archive (V2 3G, pure RLS). The 0024 policy admits only
 * SENT digests for the caller's own client, so this page is exactly
 * the record of what reached inboxes: week by week, newest first,
 * rendered as documents. Reading only; asking rides the 3E anchor.
 */

function fmtWeek(d: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${d}T00:00:00Z`))
}

export default async function DigestArchivePage() {
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: digests } = await supabase
    .from('digests')
    .select('id, week_of, subject, draft_md, sent_at')
    .eq('client_id', viewer.client.clientId)
    .order('week_of', { ascending: false })

  const rows = digests ?? []

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Digests" maxWidth="max-w-3xl">
      {rows.length === 0 ? (
        <ArchEmptyState
          title="Your weekly digests collect here."
          body="Each week your consultant sends a short digest of what happened and what is next. Every one that reaches your inbox is kept here too."
        />
      ) : (
        <ol className="flex flex-col gap-8">
          {rows.map((d) => (
            <li key={d.id} className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5">
              <p className="eyebrow">Week of {fmtWeek(d.week_of)}</p>
              <h2 className="font-display mt-1 text-xl font-medium text-ink">{d.subject}</h2>
              <div className="mt-3">
                <MarkdownLite text={d.draft_md} />
              </div>
              <p className="mt-3 text-sm">
                <Link
                  href={`/messages?anchor=digest:${d.id}`}
                  className="text-ink-dim underline hover:text-ink"
                >
                  Ask about this digest
                </Link>
              </p>
            </li>
          ))}
        </ol>
      )}
    </RoomShell>
  )
}

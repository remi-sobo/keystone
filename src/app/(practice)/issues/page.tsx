import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'

/**
 * Reported issues (specs/keystone-v2-help-fab.md): the practice-side
 * triage screen for what leaders file through the help FAB. Owner only
 * by decision, so the nav item and this page both gate to the practice
 * owner; a consultant who reaches the URL is sent back to Home. Reads on
 * the caller's own session under RLS (the issue_reports read policy
 * scopes to the practice), so a practice owner sees every report of
 * their own practice and nothing of any other.
 *
 * The rows are immutable at the database (no update, no delete policy):
 * this screen reads them, it never edits a client's words. A status or
 * resolve workflow, if the pilot asks for one, is a later gated change.
 */

const KIND_LABEL: Record<string, string> = {
  bug: 'Broken',
  confusing: 'Confusing',
  idea: 'Idea',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface Row {
  id: string
  kind: string
  body: string
  created_at: string
  reported_side: 'practice' | 'client'
  engagement_id: string | null
  engagements: { title: string } | null
  clients: { name: string } | null
}

export default async function IssuesPage() {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  // Owner only: the triage screen is the owner's.
  if (!viewer.practice || viewer.practice.role !== 'owner') redirect('/today')

  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('issue_reports')
    .select('id, kind, body, created_at, reported_side, engagement_id, engagements(title), clients(name)')
    .order('created_at', { ascending: false })
  const reports = (data ?? []) as unknown as Row[]

  return (
    <RoomShell
      eyebrow="Reported issues"
      title="Reported issues"
      description="What client leaders and your own team file through the help button: something broken, something confusing, or an idea. Only you see this list; each one also emails you when Resend is connected."
      maxWidth="max-w-3xl"
    >
      {reports.length === 0 ? (
        <p className="text-ink-dim">
          No issues reported yet. When a leader uses the help button on their side to report
          something, it lands here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((r) => (
            <li
              key={r.id}
              className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="inline-block rounded-full border border-brass/60 px-2 py-0.5 text-xs text-ink-dim">
                  {KIND_LABEL[r.kind] ?? r.kind}
                </span>
                <span className="eyebrow">{formatDate(r.created_at)}</span>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink">{r.body}</p>
              <p className="mt-3 text-xs text-ink-dim">
                {r.reported_side === 'practice' ? (
                  'From your team'
                ) : (
                  <>
                    {r.clients?.name ?? 'A client'}
                    {r.engagements?.title && r.engagement_id ? (
                      <>
                        {' on '}
                        <Link
                          href={`/engagements/${r.engagement_id}`}
                          className="text-forest underline"
                        >
                          {r.engagements.title}
                        </Link>
                      </>
                    ) : null}
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </RoomShell>
  )
}

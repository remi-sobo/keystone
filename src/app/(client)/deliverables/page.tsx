import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText, Link2 } from 'lucide-react'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { ArchEmptyState } from '@/components/ArchEmptyState'
import { MarkdownLite } from '@/components/MarkdownLite'
import { decideApproval } from '../charter/actions'

const STATES: Record<string, string> = {
  approved: 'Accepted. Your consultant sees it.',
  noted: 'Noted. Your consultant sees your note and will follow up.',
  note_needed: 'Say what is not there yet; the note travels with your answer.',
  error: 'That did not save. Try again.',
}

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

export default async function DeliverablesPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: deliverables } = await supabase
    .from('deliverables')
    .select('id, title, kind, url, note, about_md, session_id, delivered_on, workstreams(title)')
    .eq('client_id', viewer.client.clientId)
    .order('delivered_on', { ascending: false })
    .order('created_at', { ascending: false })

  const rows = deliverables ?? []

  // 3D: acceptance rides the 5D approvals; versions are read as facts.
  const [{ data: approvals }, { data: versions }] = await Promise.all([
    supabase
      .from('approvals')
      .select('id, subject_id, status, note_md, decided_by_email, requested_at')
      .eq('subject_type', 'deliverable')
      .eq('client_id', viewer.client.clientId)
      .order('requested_at', { ascending: false }),
    supabase
      .from('deliverable_versions')
      .select('deliverable_id, version, replaced_at')
      .eq('client_id', viewer.client.clientId)
      .order('version', { ascending: false }),
  ])
  const approvalFor = (id: string) => (approvals ?? []).find((a) => a.subject_id === id)
  const latestVersion = (id: string) => (versions ?? []).find((v) => v.deliverable_id === id)

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Deliverables" maxWidth="max-w-3xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <ArchEmptyState
          title="Your first deliverable lands after kickoff."
          body="Each artifact your consultant delivers shows up here on a timeline, newest first, with its date and context."
        />
      ) : (
        <ol className="relative flex flex-col gap-6 border-l border-brass/60 pl-6">
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
                {d.about_md ? (
                  <div className="mt-2 border-t border-ink/10 pt-2">
                    <MarkdownLite text={d.about_md} />
                  </div>
                ) : null}
                {d.kind === 'file' ? (
                  <p className="mt-2 text-sm">
                    <a
                      href={`/deliverables/${d.id}/file?view=1`}
                      target="_blank"
                      className="text-forest underline"
                    >
                      View
                    </a>{' '}
                    <Link href={`/deliverables/${d.id}/file`} className="ml-2 text-forest underline">
                      Download
                    </Link>
                    {latestVersion(d.id) ? (
                      <span className="ml-2 text-xs text-ink-dim">
                        (updated; version {(latestVersion(d.id)?.version ?? 0) + 1})
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {(() => {
                  const a = approvalFor(d.id)
                  if (!a) return null
                  if (a.status === 'pending') {
                    return (
                      <div className="mt-3 rounded-lg border border-brass/50 bg-paper p-3">
                        <p className="eyebrow">Your acceptance is asked</p>
                        <div className="mt-2 flex flex-wrap items-start gap-3">
                          <form action={decideApproval}>
                            <input type="hidden" name="approvalId" value={a.id} />
                            <input type="hidden" name="decision" value="approved" />
                            <input type="hidden" name="back" value="/deliverables" />
                            <button
                              type="submit"
                              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                            >
                              Accept
                            </button>
                          </form>
                          <form action={decideApproval} className="flex flex-col gap-2">
                            <input type="hidden" name="approvalId" value={a.id} />
                            <input type="hidden" name="decision" value="not_yet" />
                            <input type="hidden" name="back" value="/deliverables" />
                            <textarea
                              name="note"
                              rows={2}
                              maxLength={2000}
                              placeholder="What is not there yet? Your consultant reads this."
                              className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
                            />
                            <button
                              type="submit"
                              className="self-start rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink transition-colors duration-200 hover:border-ink/30 active:scale-[0.98]"
                            >
                              Not yet, with the note
                            </button>
                          </form>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <p className="mt-2 text-sm text-ink-dim">
                      {a.status === 'approved'
                        ? `Accepted${a.decided_by_email ? ` by ${a.decided_by_email.split('@')[0]}` : ''}.`
                        : a.status === 'not_yet'
                          ? `Not yet${a.note_md ? `: ${a.note_md}` : ''}`
                          : null}
                    </p>
                  )
                })()}
              </div>
            </li>
          ))}
        </ol>
      )}
    </RoomShell>
  )
}

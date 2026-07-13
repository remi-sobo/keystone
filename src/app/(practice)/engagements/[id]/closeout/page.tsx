import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import MarkdownEditor from '@/components/MarkdownEditor'
import { publishCloseout, requestCloseoutSignoff, saveCloseout } from './actions'

/**
 * The closeout room, practice side (V2 5A). The record on one side,
 * the six authored sections on the other. It closes against the
 * Charter: every success measure resolved, every not-included
 * restated, every owner named. Draft saves stay invisible to the
 * client; Publish opens the room; the sign-off rides 5D approvals.
 */

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

const STATES: Record<string, string> = {
  saved: 'Saved. The client sees nothing until you publish.',
  published: 'Published. The room is open and the client team hears about it.',
  already_published: 'Already published. Edits save into the open room.',
  nothing_saved: 'Save the sections first.',
  publish_first: 'Publish the room before asking for the sign-off.',
  asked: 'Sign-off asked. It lands on their closeout page.',
  already_asked: 'The sign-off is already asked or given.',
  error: 'That did not save. Try again.',
}

const SECTION_FIELDS: Array<{ name: string; column: string; label: string; hint: string }> = [
  { name: 'breaks', column: 'breaks_md', label: 'What to do if it breaks', hint: 'The thesis in writing. Name the failure modes and the first moves, without us in the loop.' },
  { name: 'ownership', column: 'ownership_md', label: 'Ownership map', hint: 'Every part of the system, and the person who owns it now.' },
  { name: 'maintenance', column: 'maintenance_md', label: 'Maintenance rhythm', hint: 'The cadence that keeps it standing: weekly, monthly, quarterly.' },
  { name: 'training', column: 'training_md', label: 'Training completed', hint: 'Who learned what, and where the materials live.' },
  { name: 'risks', column: 'risks_md', label: 'Open risks', hint: 'Named honestly, with the watch signal for each.' },
  { name: 'next', column: 'next_md', label: 'What comes next', hint: 'The renewal or next-engagement option, stated plainly, no pressure.' },
]

export default async function CloseoutEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const { id } = await params
  const { state } = await searchParams
  const supabase = await createServerSupabase()

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, practice_id, client_id, clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  const [closeoutRes, charterRes, outcomesRes, deliverablesRes, wsRes, practiceRes, digestRes] =
    await Promise.all([
      supabase.from('closeouts').select('*').eq('engagement_id', id).maybeSingle(),
      supabase
        .from('engagement_charters')
        .select('id, version')
        .eq('engagement_id', id)
        .eq('status', 'published')
        .maybeSingle(),
      supabase
        .from('outcomes')
        .select('id, title, standing_md, reached_on, sort')
        .eq('engagement_id', id)
        .order('sort'),
      supabase
        .from('deliverables')
        .select('id, title, delivered_on')
        .eq('engagement_id', id)
        .eq('status', 'shipped')
        .order('delivered_on', { ascending: false }),
      supabase.from('workstreams').select('id, title, stage').eq('engagement_id', id).order('sort'),
      supabase.from('practices').select('stage_config').eq('id', engagement.practice_id).maybeSingle(),
      supabase
        .from('digests')
        .select('week_of')
        .eq('engagement_id', id)
        .eq('status', 'sent')
        .order('week_of', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
  const closeout = closeoutRes.data
  const { data: dlvApprovals } = await supabase
    .from('approvals')
    .select('subject_id, status')
    .eq('subject_type', 'deliverable')
    .eq('engagement_id', id)
  const { data: signoff } = closeout
    ? await supabase
        .from('approvals')
        .select('status, decided_by_email')
        .eq('subject_type', 'closeout')
        .eq('subject_id', closeout.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const stages =
    Array.isArray(practiceRes.data?.stage_config) && practiceRes.data.stage_config.length > 0
      ? (practiceRes.data.stage_config as string[])
      : DEFAULT_STAGES
  const finalStage = stages[stages.length - 1]
  const acceptanceOf = (dlvId: string) =>
    (dlvApprovals ?? []).find((a) => a.subject_id === dlvId)?.status ?? null

  return (
    <RoomShell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eyebrow={`${((engagement.clients as any)?.name as string) ?? ''}, closeout`}
      title="It stands without us"
      maxWidth="max-w-5xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <p className="mb-8 text-sm text-ink-dim">
        The room closes against the record: the ledger below is read live, never copied. Only the
        six sections are yours to write.{' '}
        <Link href={`/engagements/${engagement.id}`} className="underline hover:text-ink">
          Back to the engagement
        </Link>{' '}
        <a href={`/engagements/${engagement.id}/export`} className="ml-2 underline hover:text-ink">
          Download the record
        </a>
      </p>

      <div className="grid gap-10 lg:grid-cols-2">
        <section aria-label="The record">
          <h2 className="font-display text-2xl font-medium text-ink">The record</h2>

          <div className="mt-4 flex flex-col gap-5">
            <KeystoneCard>
              <p className="eyebrow">The charter</p>
              {charterRes.data ? (
                <p className="mt-2 text-sm text-ink">
                  Version {charterRes.data.version} published.{' '}
                  <Link href={`/engagements/${engagement.id}/charter`} className="text-forest underline">
                    Open it
                  </Link>{' '}
                  <span className="text-ink-dim">
                    and restate every not-included line in the sections here.
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-sm text-ink-dim">
                  No charter published. The room closes against the charter; publish one first.
                </p>
              )}
            </KeystoneCard>

            <KeystoneCard>
              <p className="eyebrow">Success measures</p>
              {(outcomesRes.data ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-ink-dim">No outcomes on the record.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {(outcomesRes.data ?? []).map((o) => (
                    <li key={o.id} className="text-sm text-ink">
                      {o.title}{' '}
                      <span className="text-ink-dim">
                        {o.reached_on
                          ? `(reached ${o.reached_on})`
                          : '(standing open; resolve or restate it in Open risks)'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </KeystoneCard>

            <KeystoneCard>
              <p className="eyebrow">Deliverables</p>
              {(deliverablesRes.data ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-ink-dim">Nothing shipped.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {(deliverablesRes.data ?? []).map((d) => (
                    <li key={d.id} className="text-sm text-ink">
                      {d.title}{' '}
                      <span className="text-ink-dim">
                        {acceptanceOf(d.id) === 'approved'
                          ? '(accepted)'
                          : acceptanceOf(d.id) === 'pending'
                            ? '(acceptance pending)'
                            : acceptanceOf(d.id) === 'not_yet'
                              ? '(they said not yet)'
                              : '(no acceptance asked)'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </KeystoneCard>

            <KeystoneCard>
              <p className="eyebrow">The arcs, against {finalStage}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {(wsRes.data ?? []).map((w) => (
                  <li key={w.id} className="text-sm text-ink">
                    {w.title}{' '}
                    <span className="text-ink-dim">
                      {w.stage === finalStage ? `(at ${finalStage})` : `(still at ${w.stage})`}
                    </span>
                  </li>
                ))}
              </ul>
              {digestRes.data ? (
                <p className="mt-3 text-xs text-ink-dim">
                  Last digest sent: week of {digestRes.data.week_of}.
                </p>
              ) : null}
            </KeystoneCard>
          </div>
        </section>

        <section aria-label="The six sections">
          <h2 className="font-display text-2xl font-medium text-ink">The six sections</h2>
          <form action={saveCloseout} className="mt-4 flex flex-col gap-5">
            <input type="hidden" name="engagementId" value={engagement.id} />
            {SECTION_FIELDS.map((f) => (
              <div key={f.name}>
                <label className="text-sm font-medium text-ink" htmlFor={`closeout-${f.name}`}>
                  {f.label}
                </label>
                <p className="mt-0.5 text-xs text-ink-dim">{f.hint}</p>
                <div className="mt-1.5">
                  <MarkdownEditor
                    name={f.name}
                    rows={4}
                    defaultValue={
                      ((closeout as Record<string, unknown> | null)?.[f.column] as string) ?? ''
                    }
                  />
                </div>
              </div>
            ))}
            <button
              type="submit"
              className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              {closeout?.status === 'published' ? 'Save into the open room' : 'Save draft'}
            </button>
          </form>

          <div className="mt-8 flex flex-col gap-3 border-t border-ink/10 pt-5">
            {closeout?.status === 'published' ? (
              <>
                <p className="text-sm text-ink">
                  Published {closeout.published_at ? closeout.published_at.slice(0, 10) : ''}
                  {closeout.updated_at &&
                  closeout.published_at &&
                  closeout.updated_at > closeout.published_at
                    ? `; sections last edited ${closeout.updated_at.slice(0, 10)}`
                    : ''}
                  .{' '}
                  {signoff?.status === 'approved'
                    ? `Signed off by ${signoff.decided_by_email ?? 'the client'}.`
                    : signoff?.status === 'pending'
                      ? 'Sign-off pending with the client.'
                      : signoff?.status === 'not_yet'
                        ? 'The client said not yet; read their note on the approval.'
                        : 'No sign-off asked yet.'}
                </p>
                {!signoff || signoff.status === 'not_yet' ? (
                  <form action={requestCloseoutSignoff}>
                    <input type="hidden" name="engagementId" value={engagement.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-sage px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper active:scale-[0.98]"
                    >
                      Ask for the sign-off
                    </button>
                  </form>
                ) : null}
              </>
            ) : (
              <form action={publishCloseout}>
                <input type="hidden" name="engagementId" value={engagement.id} />
                <p className="mb-2 text-xs text-ink-dim">
                  Publishing opens the whole room to the client team and tells them it is there.
                </p>
                <button
                  type="submit"
                  className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                >
                  Publish the room
                </button>
              </form>
            )}
          </div>
        </section>
      </div>
    </RoomShell>
  )
}

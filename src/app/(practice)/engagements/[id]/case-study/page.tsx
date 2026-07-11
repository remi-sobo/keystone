import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import MarkdownEditor from '@/components/MarkdownEditor'
import { MarkdownLite } from '@/components/MarkdownLite'
import {
  decideCaseStudyProposal,
  draftCaseStudy,
  requestCaseStudyApproval,
  saveCaseStudy,
} from './actions'

/**
 * The case study builder, practice side (V2 5C). AI drafts from the
 * record into an inert proposal; you accept and edit; the client
 * approves through 5D before anything becomes public. The quote is
 * captured by hand from their own words; the model never writes it.
 */

const STATES: Record<string, string> = {
  drafted: 'Drafted from the record. It waits below, inert until you decide.',
  thin_record: 'The record is thin: no outcomes or deliverables yet. A case study needs an arc.',
  slow: 'Too many drafts at once. Wait a while.',
  budget: 'The AI budget for this month is spent. The record is untouched.',
  draft_failed: 'The draft did not come back. Try again.',
  accepted: 'Accepted. Edit it below, then ask the client.',
  dismissed: 'Dismissed. Nothing entered the record.',
  proposal_gone: 'That proposal was already decided.',
  saved: 'Saved.',
  nothing_saved: 'Save a case study first.',
  asked: 'Approval asked. It lands on their case-study page.',
  already_asked: 'Approval is already asked or given.',
  error: 'That did not save. Try again.',
}

export default async function CaseStudyPage({
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

  const [{ data: caseStudy }, { data: proposal }] = await Promise.all([
    supabase.from('case_studies').select('*').eq('engagement_id', id).maybeSingle(),
    supabase
      .from('ai_proposals')
      .select('id, payload, model_used, created_at')
      .eq('engagement_id', id)
      .eq('kind', 'case_study')
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const { data: approval } = caseStudy
    ? await supabase
        .from('approvals')
        .select('status, decided_by_email, decided_at, note_md')
        .eq('subject_type', 'case_study')
        .eq('subject_id', caseStudy.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  const payload = (proposal?.payload ?? null) as { title?: string; body_md?: string } | null

  return (
    <RoomShell
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eyebrow={`${((engagement.clients as any)?.name as string) ?? ''}, case study`}
      title="The story, from the record"
      maxWidth="max-w-3xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <p className="mb-8 text-sm text-ink-dim">
        Drafted from what actually happened, edited by you, approved by them before anything
        becomes public. Nothing carries their name or words without the approval record.{' '}
        <Link href={`/engagements/${engagement.id}`} className="underline hover:text-ink">
          Back to the engagement
        </Link>
      </p>

      {!proposal ? (
        <form action={draftCaseStudy} className="mb-8">
          <input type="hidden" name="engagementId" value={engagement.id} />
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            {caseStudy ? 'Draft a fresh take from the record' : 'Draft from the record'}
          </button>
        </form>
      ) : (
        <KeystoneCard>
          <p className="eyebrow">Proposed draft / inert until you decide</p>
          <p className="mt-2 text-sm font-medium text-ink">{payload?.title}</p>
          <details className="mt-1">
            <summary className="cursor-pointer text-sm text-forest">Read the draft</summary>
            <div className="mt-2">
              <MarkdownLite text={payload?.body_md ?? ''} />
            </div>
          </details>
          <form action={decideCaseStudyProposal} className="mt-3 flex gap-3">
            <input type="hidden" name="engagementId" value={engagement.id} />
            <input type="hidden" name="proposalId" value={proposal.id} />
            <button
              type="submit"
              name="decision"
              value="accept"
              className="rounded-lg bg-forest px-3 py-1.5 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Accept into the editor
            </button>
            <button
              type="submit"
              name="decision"
              value="dismiss"
              className="rounded-lg border border-ink/20 px-3 py-1.5 text-sm text-ink-dim hover:text-ink"
            >
              Dismiss
            </button>
          </form>
        </KeystoneCard>
      )}

      {caseStudy ? (
        <section className="mt-8">
          <h2 className="font-display text-2xl font-medium text-ink">The working copy</h2>
          <form action={saveCaseStudy} className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="engagementId" value={engagement.id} />
            <input
              name="title"
              defaultValue={caseStudy.title}
              maxLength={200}
              className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
            />
            <MarkdownEditor name="body" rows={14} defaultValue={caseStudy.body_md ?? ''} />
            <label className="flex flex-col gap-1 text-sm text-ink-dim">
              Their quote, in their own words (captured by hand, never drafted for them)
              <textarea
                name="quote"
                rows={2}
                maxLength={2000}
                defaultValue={caseStudy.quote_md ?? ''}
                className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              />
            </label>
            <button
              type="submit"
              className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Save
            </button>
          </form>

          <div className="mt-6 border-t border-ink/10 pt-4">
            {approval?.status === 'approved' ? (
              <p className="text-sm text-ink">
                Approved by {approval.decided_by_email ?? 'the client'}
                {approval.decided_at ? ` on ${approval.decided_at.slice(0, 10)}` : ''}. The approval
                record is what makes it publishable; copy the text above wherever it goes.
              </p>
            ) : approval?.status === 'pending' ? (
              <p className="text-sm text-ink">Approval pending with the client.</p>
            ) : approval?.status === 'not_yet' ? (
              <p className="text-sm text-ink">
                They said not yet{approval.note_md ? `: "${approval.note_md}"` : ''}. Edit and ask
                again.
              </p>
            ) : (
              <p className="text-sm text-ink-dim">
                Not asked yet. Nothing becomes public without their approval on the record.
              </p>
            )}
            {!approval || approval.status === 'not_yet' ? (
              <form action={requestCaseStudyApproval} className="mt-3">
                <input type="hidden" name="engagementId" value={engagement.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-sage px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper active:scale-[0.98]"
                >
                  Ask the client to approve
                </button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}
    </RoomShell>
  )
}

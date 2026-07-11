import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { MarkdownLite } from '@/components/MarkdownLite'
import { decideApproval } from '../charter/actions'

/**
 * The case study, client side (V2 5C). PURE RLS: the policy shows the
 * case study only once your review is asked. Nothing about your
 * organization becomes public without your approval on the record;
 * this page IS that approval.
 */

const STATES: Record<string, string> = {
  approved: 'Approved. The record keeps it, and nothing changes without asking again.',
  noted: 'Noted. Your consultant will pick it up from here.',
  note_needed: 'Say what is off; a not-yet needs words.',
  invalid: 'That did not parse. Try again.',
  error: 'That did not save. Try again.',
}

export default async function ClientCaseStudyPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const supabase = await createServerSupabase()
  const { data: caseStudy } = await supabase
    .from('case_studies')
    .select('id, title, body_md, quote_md')
    .eq('client_id', viewer.client.clientId)
    .maybeSingle()

  if (!caseStudy) {
    return (
      <RoomShell eyebrow={viewer.client.clientName} title="Case study" maxWidth="max-w-3xl">
        <p className="text-sm text-ink-dim">
          Nothing to review. If your consultant drafts a case study about this engagement, it
          appears here for your approval before anything becomes public.
        </p>
      </RoomShell>
    )
  }

  const { data: approval } = await supabase
    .from('approvals')
    .select('id, status, decided_by_email, decided_at, note_md')
    .eq('subject_type', 'case_study')
    .eq('subject_id', caseStudy.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <RoomShell eyebrow={viewer.client.clientName} title={caseStudy.title} maxWidth="max-w-3xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <p className="text-sm text-ink-dim">
        This is the case study as it would appear publicly. Nothing goes anywhere without your
        approval below; your name and your words are yours.
      </p>

      <div className="mt-6">
        <MarkdownLite text={caseStudy.body_md ?? ''} />
      </div>
      {caseStudy.quote_md ? (
        <blockquote className="mt-6 border-l-2 border-sage pl-4 text-sm italic text-ink">
          {caseStudy.quote_md}
        </blockquote>
      ) : null}

      <section className="mt-10 border-t border-ink/10 pt-6">
        <h2 className="font-display text-2xl font-medium text-ink">Your approval</h2>
        {approval?.status === 'pending' ? (
          <form action={decideApproval} className="mt-4 flex flex-col gap-3">
            <input type="hidden" name="approvalId" value={approval.id} />
            <input type="hidden" name="back" value="/case-study" />
            <textarea
              name="note"
              rows={2}
              maxLength={2000}
              placeholder="A note, if anything needs saying (required if you say not yet). If you would like to offer a quote in your own words, this is a fine place for it."
              className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                name="decision"
                value="approved"
                className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
              >
                Approve it
              </button>
              <button
                type="submit"
                name="decision"
                value="not_yet"
                className="rounded-lg border border-ink/20 px-4 py-2 text-sm text-ink-dim hover:text-ink"
              >
                Not yet
              </button>
            </div>
          </form>
        ) : approval?.status === 'approved' ? (
          <p className="mt-2 text-sm text-ink">
            Approved by {approval.decided_by_email ?? 'your team'}
            {approval.decided_at ? ` on ${approval.decided_at.slice(0, 10)}` : ''}.
          </p>
        ) : approval?.status === 'not_yet' ? (
          <p className="mt-2 text-sm text-ink">
            You said not yet{approval.note_md ? `: "${approval.note_md}"` : ''}. Your consultant
            will come back with a new version.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-dim">No approval has been asked yet.</p>
        )}
      </section>
    </RoomShell>
  )
}

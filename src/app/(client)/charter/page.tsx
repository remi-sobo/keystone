import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { MarkdownLite } from '@/components/MarkdownLite'
import { decideApproval, requestChangeOrder } from './actions'

/**
 * The charter, client side (V2 2A): the shared agreement that governs
 * this room, with the 5D sign-off block. Pure RLS: the page can only
 * ever read published and superseded versions of the caller's own
 * client, and drafts do not exist here by policy.
 */

const STATES: Record<string, string> = {
  approved: 'Signed. Thank you; this version is now the agreed charter.',
  noted: 'Noted. Your consultant will pick it up from here.',
  invalid: 'That did not parse. Try again.',
  error: 'That did not save. It may already be decided; refresh and see.',
  co_asked: 'Asked. It goes on the record and your consultant answers in writing.',
  co_invalid: 'Give the ask a title.',
  co_error: 'That did not save. Try again.',
}

function fmtDay(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function ClientCharterPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const supabase = await createServerSupabase()
  const { data: versions } = await supabase
    .from('engagement_charters')
    .select('id, version, status, body_md, published_at')
    .eq('client_id', viewer.client.clientId)
    .order('version', { ascending: false })

  const published = (versions ?? []).find((v) => v.status === 'published')
  const superseded = (versions ?? []).filter((v) => v.status === 'superseded')

  // V2 5E: the shared page of asks that sit outside the walls.
  const { data: changeOrders } = await supabase
    .from('change_orders')
    .select('id, title, description_md, status, response_md, created_at')
    .eq('client_id', viewer.client.clientId)
    .order('created_at', { ascending: false })

  const { data: signoff } = published
    ? await supabase
        .from('approvals')
        .select('id, status, decided_by_email, decided_at, note_md')
        .eq('subject_type', 'charter')
        .eq('subject_id', published.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="The charter" maxWidth="max-w-3xl">
      <p className="text-sm text-ink-dim">
        The shared agreement that governs this engagement: what we are building together, how
        we will work, and what sits outside the walls. Decisions made along the way live in{' '}
        <Link href="/decisions" className="underline hover:text-ink">
          the decision log
        </Link>
        ; where this ends is tracked in{' '}
        <Link href="/outcomes" className="underline hover:text-ink">
          the outcomes
        </Link>
        .
      </p>
      {state && STATES[state] ? (
        <p role="status" className="mt-3 text-sm text-ink">
          {STATES[state]}
        </p>
      ) : null}

      {published ? (
        <>
          <p className="mt-6 text-sm text-ink-dim">
            Version {published.version}, published {fmtDay(published.published_at)}.
          </p>
          <KeystoneCard className="mt-3">
            <MarkdownLite text={published.body_md} />
          </KeystoneCard>

          <section className="mt-8">
            {signoff?.status === 'approved' ? (
              <p className="text-sm text-ink">
                Approved by {signoff.decided_by_email ?? 'your team'}, {fmtDay(signoff.decided_at)}.
              </p>
            ) : signoff?.status === 'pending' ? (
              <KeystoneCard>
                <p className="eyebrow">Your sign-off</p>
                <p className="mt-2 text-sm text-ink">
                  Read it through, then sign here. Your name and the date go on the record, and
                  a new version would come back for a fresh signature.
                </p>
                <form action={decideApproval} className="mt-4 flex flex-col gap-3">
                  <input type="hidden" name="approvalId" value={signoff.id} />
                  <textarea
                    name="note"
                    rows={2}
                    maxLength={2000}
                    placeholder="A note, if anything needs saying (optional)"
                    className="rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      name="decision"
                      value="approved"
                      className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                    >
                      Approve the charter
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="not_yet"
                      className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/40 active:scale-[0.98]"
                    >
                      Not yet
                    </button>
                  </div>
                </form>
              </KeystoneCard>
            ) : signoff?.status === 'not_yet' ? (
              <p className="text-sm text-ink-dim">
                You said not yet{signoff.note_md ? `: "${signoff.note_md}"` : ''}. Your
                consultant will follow up.
              </p>
            ) : null}
          </section>

          {superseded.length > 0 ? (
            <details className="mt-8">
              <summary className="cursor-pointer text-sm text-ink-dim">
                Earlier versions ({superseded.length})
              </summary>
              <div className="mt-3 flex flex-col gap-4">
                {superseded.map((v) => (
                  <KeystoneCard key={v.id}>
                    <p className="eyebrow">
                      Version {v.version}, published {fmtDay(v.published_at)}, superseded
                    </p>
                    <div className="mt-3">
                      <MarkdownLite text={v.body_md} />
                    </div>
                  </KeystoneCard>
                ))}
              </div>
            </details>
          ) : null}
        </>
      ) : (
        <p className="mt-6 text-sm text-ink-dim">
          The charter lands here once it is published. Until then, where things stand lives on
          your home.
        </p>
      )}

      <section className="mt-12 border-t border-ink/10 pt-6">
        <h2 className="font-display text-2xl font-medium text-ink">Outside the lines</h2>
        <p className="mt-1 text-sm text-ink-dim">
          When you want something that sits outside the scope of the charter, ask for it here.
          The ask and the answer both go on the record, so the boundary stays honest in both
          directions.
        </p>

        {(changeOrders ?? []).length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {(changeOrders ?? []).map((co) => (
              <li key={co.id} className="rounded-lg border border-ink/10 bg-paper-raised px-4 py-3">
                <p className="text-sm font-medium text-ink">
                  {co.title}{' '}
                  <span className="eyebrow ml-2">
                    {co.status === 'open' ? 'with your consultant' : co.status}
                  </span>
                </p>
                {co.description_md ? (
                  <p className="mt-1 text-sm text-ink-dim">{co.description_md}</p>
                ) : null}
                {co.response_md ? (
                  <p className="mt-2 text-sm text-ink">Answer: {co.response_md}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        <form action={requestChangeOrder} className="mt-4 flex flex-col gap-3">
          <input
            name="title"
            required
            maxLength={200}
            placeholder="What you are asking for, in one line"
            className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
          />
          <textarea
            name="description"
            rows={2}
            maxLength={4000}
            placeholder="Why it matters and what it would change (optional)"
            className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
          />
          <button
            type="submit"
            className="self-start rounded-lg border border-sage px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper active:scale-[0.98]"
          >
            Ask for it
          </button>
        </form>
      </section>
    </RoomShell>
  )
}

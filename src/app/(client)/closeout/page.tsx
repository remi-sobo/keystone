import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { MarkdownLite } from '@/components/MarkdownLite'
import { decideApproval } from '../charter/actions'

/**
 * The closeout room, client side (V2 5A). PURE RLS: the policy shows
 * only a PUBLISHED closeout of this client. The room reads the live
 * record beside the six sections; what-to-do-if-it-breaks comes
 * first, because the whole engagement was about standing without us.
 */

const STATES: Record<string, string> = {
  approved: 'Signed. The record keeps it.',
  noted: 'Noted. Your consultant will pick it up from here.',
  note_needed: 'Say what is missing; a not-yet needs words.',
  invalid: 'That did not parse. Try again.',
  error: 'That did not save. Try again.',
}

const SECTIONS: Array<{ column: string; title: string }> = [
  { column: 'breaks_md', title: 'What to do if it breaks' },
  { column: 'ownership_md', title: 'Who owns what now' },
  { column: 'maintenance_md', title: 'The maintenance rhythm' },
  { column: 'training_md', title: 'Training completed' },
  { column: 'risks_md', title: 'Open risks, named honestly' },
  { column: 'next_md', title: 'What comes next, if you want it' },
]

export default async function ClientCloseoutPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const supabase = await createServerSupabase()
  // RLS returns published rows only; a draft simply is not here.
  const { data: closeout } = await supabase
    .from('closeouts')
    .select('*')
    .eq('client_id', viewer.client.clientId)
    .maybeSingle()

  if (!closeout) {
    return (
      <RoomShell eyebrow={viewer.client.clientName} title="Closeout" maxWidth="max-w-3xl">
        <p className="text-sm text-ink-dim">
          Nothing here yet. When the engagement closes, this room holds the whole record of what
          stands: what you own now, how to keep it running, and what to do if it breaks.
        </p>
      </RoomShell>
    )
  }

  const [{ data: outcomes }, { data: deliverables }, { data: lastDigest }, { data: signoff }] =
    await Promise.all([
      supabase
        .from('outcomes')
        .select('id, title, standing_md, reached_on, sort')
        .eq('engagement_id', closeout.engagement_id)
        .order('sort'),
      supabase
        .from('deliverables')
        .select('id, title, delivered_on')
        .eq('engagement_id', closeout.engagement_id)
        .eq('status', 'shipped')
        .order('delivered_on', { ascending: false }),
      supabase
        .from('digests')
        .select('week_of')
        .eq('engagement_id', closeout.engagement_id)
        .order('week_of', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('approvals')
        .select('id, status, decided_by_email, decided_at, note_md')
        .eq('subject_type', 'closeout')
        .eq('subject_id', closeout.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="It stands without us" maxWidth="max-w-3xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <p className="text-sm text-ink-dim">
        This is the record of what we built together and what is yours now. The{' '}
        <Link href="/charter" className="underline hover:text-ink">
          charter
        </Link>{' '}
        said what we would do; this room shows where it landed. You can{' '}
        <a href="/export" className="underline hover:text-ink">
          download the whole record
        </a>{' '}
        and keep it; it is yours.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">Where the measures landed</h2>
        {(outcomes ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">No outcomes were tracked on the record.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {(outcomes ?? []).map((o) => (
              <li key={o.id} className="text-sm text-ink">
                {o.title}{' '}
                <span className="text-ink-dim">
                  {o.reached_on ? `(reached ${o.reached_on})` : '(still in motion; see open risks)'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-ink-dim">
          The full history lives in <Link href="/outcomes" className="underline">outcomes</Link>.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">What was delivered</h2>
        {(deliverables ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing on the shelf.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            {(deliverables ?? []).map((d) => (
              <li key={d.id} className="text-sm text-ink">
                <Link href="/deliverables" className="text-forest underline">
                  {d.title}
                </Link>{' '}
                {d.delivered_on ? <span className="text-ink-dim">({d.delivered_on})</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {SECTIONS.map((s) =>
        closeout[s.column] ? (
          <section key={s.column} className="mt-8">
            <h2 className="font-display text-2xl font-medium text-ink">{s.title}</h2>
            <div className="mt-3">
              <MarkdownLite text={closeout[s.column] as string} />
            </div>
          </section>
        ) : null
      )}

      {lastDigest ? (
        <p className="mt-8 text-sm text-ink-dim">
          The last digest went out the week of {lastDigest.week_of}; the whole archive stays in{' '}
          <Link href="/digests" className="underline hover:text-ink">
            digests
          </Link>
          .
        </p>
      ) : null}

      <p className="mt-8 text-xs text-ink-dim">
        Published {closeout.published_at ? closeout.published_at.slice(0, 10) : ''}
        {closeout.updated_at &&
        closeout.published_at &&
        closeout.updated_at.slice(0, 10) !== closeout.published_at.slice(0, 10)
          ? `; sections last edited ${closeout.updated_at.slice(0, 10)}`
          : ''}
        .
      </p>

      <section className="mt-10 border-t border-ink/10 pt-6">
        <h2 className="font-display text-2xl font-medium text-ink">The sign-off</h2>
        {signoff?.status === 'approved' &&
        signoff.decided_at &&
        closeout.updated_at &&
        closeout.updated_at > signoff.decided_at ? (
          <p className="mt-2 text-sm text-ink">
            The sections have been edited since this sign-off; what you signed is the earlier
            text.
          </p>
        ) : null}
        {signoff?.status === 'pending' ? (
          <>
            <p className="mt-2 text-sm text-ink">
              Your consultant asks you to sign off that the engagement is complete and the system
              stands with your team.
            </p>
            <form action={decideApproval} className="mt-4 flex flex-col gap-3">
              <input type="hidden" name="approvalId" value={signoff.id} />
              <input type="hidden" name="back" value="/closeout" />
              <textarea
                name="note"
                rows={2}
                maxLength={2000}
                placeholder="A note, if anything needs saying (required if you say not yet)"
                className="rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
              />
              <div className="flex gap-3">
                <button
                  type="submit"
                  name="decision"
                  value="approved"
                  className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                >
                  It stands. Sign off.
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
          </>
        ) : signoff?.status === 'approved' ? (
          <p className="mt-2 text-sm text-ink">
            Signed off by {signoff.decided_by_email ?? 'your team'}
            {signoff.decided_at ? ` on ${signoff.decided_at.slice(0, 10)}` : ''}. The record keeps
            it.
          </p>
        ) : signoff?.status === 'not_yet' ? (
          <p className="mt-2 text-sm text-ink">
            You said not yet{signoff.note_md ? `: "${signoff.note_md}"` : ''}. Your consultant
            picks it up from here.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-dim">No sign-off has been asked yet.</p>
        )}
      </section>
    </RoomShell>
  )
}

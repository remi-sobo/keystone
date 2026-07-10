import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'

/**
 * Outcomes, client side (V2 2C): where this ends, tracked as it
 * happens. Each outcome shows its baseline, its target, the
 * consultant's dated standing note, and the evidence as links into
 * surfaces the client already has. Reached-on renders as history;
 * there is no aggregate, no percentage, no score anywhere.
 */

const EVIDENCE_LINKS: Record<string, { href: string; label: string }> = {
  deliverable: { href: '/deliverables', label: 'deliverable' },
  session: { href: '/sessions', label: 'session' },
  action_item: { href: '/homework', label: 'homework' },
  decision: { href: '/decisions', label: 'decision' },
}

export default async function ClientOutcomesPage() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const supabase = await createServerSupabase()
  const [{ data: outcomes }, { data: evidence }] = await Promise.all([
    supabase
      .from('outcomes')
      .select('id, title, baseline_md, target_md, standing_md, standing_updated_at, reached_on, sort')
      .eq('client_id', viewer.client.clientId)
      .order('sort'),
    supabase
      .from('outcome_evidence')
      .select('id, outcome_id, kind, note')
      .eq('client_id', viewer.client.clientId),
  ])

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Where this ends" maxWidth="max-w-3xl">
      <p className="text-sm text-ink-dim">
        The outcomes this engagement exists to reach, from the charter. Each one shows where it
        started, what done looks like, and the real work behind it.
      </p>

      {(outcomes ?? []).length === 0 ? (
        <p className="mt-6 text-sm text-ink-dim">The outcomes land here after kickoff.</p>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {(outcomes ?? []).map((o) => {
            const links = (evidence ?? []).filter((ev) => ev.outcome_id === o.id)
            return (
              <KeystoneCard key={o.id}>
                <p className="text-sm font-medium text-ink">
                  {o.title}
                  {o.reached_on ? (
                    <span className="font-normal text-ink-dim">
                      {' '}
                      (reached{' '}
                      {new Date(o.reached_on + 'T00:00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                      )
                    </span>
                  ) : null}
                </p>
                {o.baseline_md || o.target_md ? (
                  <p className="mt-1 text-xs text-ink-dim">
                    {o.baseline_md ? `From: ${o.baseline_md}. ` : ''}
                    {o.target_md ? `To: ${o.target_md}.` : ''}
                  </p>
                ) : null}
                {o.standing_md ? (
                  <p className="mt-2 text-sm text-ink">
                    {o.standing_md}
                    {o.standing_updated_at ? (
                      <span className="text-ink-dim">
                        {' '}
                        (from your consultant,{' '}
                        {new Date(o.standing_updated_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                        )
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {links.length > 0 ? (
                  <p className="mt-2 text-xs text-ink-dim">
                    The work behind it:{' '}
                    {links.map((ev, i) => {
                      const target = EVIDENCE_LINKS[ev.kind]
                      return (
                        <span key={ev.id}>
                          {i > 0 ? ', ' : ''}
                          <Link href={target.href} className="text-forest underline">
                            {ev.note || `a ${target.label}`}
                          </Link>
                        </span>
                      )
                    })}
                  </p>
                ) : null}
              </KeystoneCard>
            )
          })}
        </div>
      )}
    </RoomShell>
  )
}

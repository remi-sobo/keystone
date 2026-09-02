import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import SectionTitle from '@/components/hub/SectionTitle'
import Tag from '@/components/hub/Tag'

/**
 * PEOPLE: who are we moving. One list, search then filters; a row is
 * the household, their relationship to the ministry, their last gift,
 * and the next move. The full surface (the six-section household
 * view, the research profile inside it, the needs-follow-up queue) is
 * phase two; this shell reads what exists and says plainly what does
 * not yet.
 */
export default async function HubPeoplePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('hub_donors')
    .select('id, household, greeting, status, do_not_contact, receives_appeals, last_gift_date')
    .eq('org_id', hub.orgId)
    .order('household')

  const donors = data ?? []

  return (
    <div>
      <SectionTitle label="People" title="Who are we moving" />
      {donors.length === 0 ? (
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)', maxWidth: 640 }}>
          No households are in yet. This list fills from the latest Young Life report and from
          people added by hand, and every record keeps who changed it and when.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {donors.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                <td style={{ padding: '12px 8px 12px 0', fontSize: 15, fontWeight: 600 }}>
                  {d.household}
                  {d.greeting ? (
                    <span style={{ fontWeight: 400, color: 'var(--hub-stone-ink)' }}>
                      {' '}
                      · {d.greeting}
                    </span>
                  ) : null}
                </td>
                <td style={{ padding: '12px 8px', fontSize: 13 }}>
                  {/* An enforced rule, rendered unmistakably, never a caution line. */}
                  {d.do_not_contact ? <Tag tone="terracotta">do not contact</Tag> : null}
                  {!d.do_not_contact && !d.receives_appeals ? (
                    <Tag tone="muted">no appeals</Tag>
                  ) : null}
                </td>
                <td
                  style={{
                    padding: '12px 0',
                    fontFamily: 'var(--hub-font-detail)',
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    color: 'var(--hub-stone-ink)',
                    textAlign: 'right',
                  }}
                >
                  {d.status}
                  {d.last_gift_date ? ` · last gift ${d.last_gift_date}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

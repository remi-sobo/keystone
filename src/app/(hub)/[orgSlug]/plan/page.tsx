import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { hubMoney } from '@/lib/hubTheme'
import SectionTitle from '@/components/hub/SectionTitle'
import Card from '@/components/hub/Card'
import Tag from '@/components/hub/Tag'
import ContentBlocks from '@/components/hub/ContentBlocks'

/**
 * PLAN: where the money comes from. The fundraising plan itself, not
 * a page about it: five strategy cards, each carrying the four things
 * the method requires (precondition, dependency, failure mode, done
 * means), with risks and open questions at the bottom. Open questions
 * is load-bearing: the build refuses to invent numbers, and this is
 * where what it refused to invent becomes visible instead of silent.
 */
export default async function HubPlanPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const { data } = await supabase
    .from('hub_strategies')
    .select(
      'id, name, owner, goal_cents, goal_trust, hours_per_week, hours_trust, precondition, dependency, failure_mode, done_means, next_move'
    )
    .eq('org_id', hub.orgId)
    .order('sort')

  const strategies = data ?? []

  const playbookRows = (s: (typeof strategies)[number]) =>
    [
      ['The precondition', s.precondition],
      ['The dependency', s.dependency],
      ['The failure mode', s.failure_mode],
      ['Done means', s.done_means],
    ].filter(([, v]) => v) as [string, string][]

  return (
    <div>
      <SectionTitle label="Plan" title="Where the money comes from" />
      {strategies.length === 0 ? (
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)' }}>
          No strategies are set up yet.
        </p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {strategies.map((s) => (
            <Card key={s.id} rule>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{s.name}</div>
              <div
                style={{
                  fontFamily: 'var(--hub-font-detail)',
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--hub-stone-ink)',
                  marginTop: 6,
                }}
              >
                {s.owner ?? 'owner unassigned'}
                {s.hours_per_week !== null ? (
                  <>
                    {' '}
                    · {Number(s.hours_per_week)} hrs/week
                    {s.hours_trust ? ` · ${s.hours_trust}` : ''}
                  </>
                ) : (
                  ' · hours not settled'
                )}
              </div>
              <div style={{ marginTop: 10, fontFamily: 'var(--hub-font-detail)', fontSize: 14 }}>
                {s.goal_cents !== null ? (
                  <>
                    {hubMoney(Number(s.goal_cents))}
                    {s.goal_trust ? (
                      <span style={{ color: 'var(--hub-stone-ink)', fontSize: 11 }}>
                        {' '}
                        · {s.goal_trust}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <Tag tone="terracotta">no goal yet</Tag>
                )}
              </div>
              {playbookRows(s).map(([k, v]) => (
                <div key={k} style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontFamily: 'var(--hub-font-detail)',
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--hub-gold-ink)',
                    }}
                  >
                    {k}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 4 }}>{v}</div>
                </div>
              ))}
              {s.next_move ? (
                <div style={{ marginTop: 12, fontSize: 14 }}>
                  <span style={{ color: 'var(--hub-gold-ink)' }}>·</span> Next: {s.next_move}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <ContentBlocks orgId={hub.orgId} section="plan-risks" heading="Risks" />
      <ContentBlocks orgId={hub.orgId} section="plan-open-questions" heading="Open questions" />
    </div>
  )
}

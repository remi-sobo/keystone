import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { hubMoney } from '@/lib/hubTheme'
import { committedByStrategy, homeFigures } from '@/lib/hubFigures'
import SectionTitle from '@/components/hub/SectionTitle'
import Card from '@/components/hub/Card'
import Tag from '@/components/hub/Tag'
import ContentBlocks from '@/components/hub/ContentBlocks'

/**
 * PLAN: where the money comes from. The fundraising plan itself, not
 * a page about it: five strategy cards, the gift table (the
 * arithmetic underneath major gifts and monthly together), and at the
 * bottom the risks and open questions, where everything the build
 * refused to invent is visible instead of silent. Opening a card
 * gives that strategy's full playbook.
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

  const figures = await homeFigures(supabase, hub.orgId, hub.fiscalYearStart)
  const [strategiesRes, committed, tasksRes] = await Promise.all([
    supabase
      .from('hub_strategies')
      .select('id, slug, name, owner, goal_cents, goal_trust, hours_per_week, hours_trust, next_move')
      .eq('org_id', hub.orgId)
      .order('sort'),
    committedByStrategy(supabase, hub.orgId, figures.fiscalYear),
    supabase
      .from('hub_tasks')
      .select('strategy_id')
      .eq('org_id', hub.orgId)
      .is('done_at', null)
      .not('strategy_id', 'is', null),
  ])
  const strategies = strategiesRes.data ?? []
  const openMoves = new Map<string, number>()
  for (const t of tasksRes.data ?? []) {
    const k = t.strategy_id as string
    openMoves.set(k, (openMoves.get(k) ?? 0) + 1)
  }

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
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: 20,
          }}
        >
          {strategies.map((s) => {
            const c = committed.get(s.id) ?? 0
            const goal = s.goal_cents !== null ? Number(s.goal_cents) : null
            const status =
              goal === null
                ? 'no goal yet'
                : c === 0
                  ? 'not started'
                  : c >= goal
                    ? 'covered'
                    : 'moving'
            return (
              <Card key={s.id} rule>
                <Link
                  href={`/${orgSlug}/plan/${s.slug}`}
                  style={{ color: 'var(--hub-acid-black)', textDecoration: 'none' }}
                >
                  <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25 }}>{s.name}</div>
                </Link>
                <div
                  style={{
                    fontFamily: 'var(--hub-font-detail)',
                    fontSize: 11,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--hub-stone-ink)',
                    marginTop: 8,
                  }}
                >
                  {s.owner ?? 'owner unassigned'}
                  {s.hours_per_week !== null
                    ? ` · ${Number(s.hours_per_week)} hrs/week${s.hours_trust ? ` · ${s.hours_trust}` : ''}`
                    : ' · hours not settled'}
                </div>
                <div style={{ marginTop: 14, fontFamily: 'var(--hub-font-detail)', fontSize: 16 }}>
                  {goal !== null ? (
                    <>
                      <span style={{ fontWeight: 700 }}>{hubMoney(goal)}</span>
                      {s.goal_trust ? (
                        <span style={{ color: 'var(--hub-stone-ink)', fontSize: 11 }}> · {s.goal_trust}</span>
                      ) : null}
                      <span style={{ color: 'var(--hub-stone-ink)', fontSize: 13 }}>
                        {' '}· {hubMoney(c)} committed
                      </span>
                      <div className="hub-bar" aria-hidden>
                        <i style={{ width: `${Math.min(100, Math.round((c / goal) * 100))}%` }} />
                      </div>
                    </>
                  ) : (
                    <Tag tone="terracotta">no goal yet</Tag>
                  )}
                </div>
                <div style={{ marginTop: 8 }}>
                  <Tag
                    tone={status === 'covered' ? 'gold' : status === 'no goal yet' ? 'terracotta' : 'muted'}
                    fill={status === 'covered'}
                  >
                    {status}
                  </Tag>{' '}
                  <span
                    style={{
                      fontFamily: 'var(--hub-font-detail)',
                      fontSize: 11,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--hub-stone-ink)',
                    }}
                  >
                    {openMoves.get(s.id) ?? 0} open moves
                  </span>
                </div>
                {s.next_move ? (
                  <div style={{ marginTop: 12, fontSize: 15, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--hub-gold-ink)' }}>·</span> Next: {s.next_move}
                  </div>
                ) : null}
                <div style={{ marginTop: 16 }}>
                  <Link href={`/${orgSlug}/plan/${s.slug}`} className="hub-quiet-link">
                    Open the playbook →
                  </Link>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <ContentBlocks orgId={hub.orgId} section="plan-gift-table" heading="The gift table" />
      <ContentBlocks orgId={hub.orgId} section="plan-risks" heading="Risks" />
      <ContentBlocks orgId={hub.orgId} section="plan-open-questions" heading="Open questions" />
    </div>
  )
}

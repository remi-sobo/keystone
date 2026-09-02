import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { homeFigures, worstTrust } from '@/lib/hubFigures'
import { hubMoney } from '@/lib/hubTheme'
import Stat from '@/components/hub/Stat'
import SectionTitle from '@/components/hub/SectionTitle'

/**
 * MONEY: are we funded. Four figures at the top (annual cost, goal,
 * raised and committed, gap), then the cash calendar and the budget
 * detail once the workbook is parsed (phase three). Every figure here
 * computes from hub_budget_lines and gift records or renders as a gap
 * with a plain sentence; no dollar amount is typed into a component.
 */
export default async function HubMoneyPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const figures = await homeFigures(supabase, hub.orgId, hub.fiscalYearStart)
  const { data: costLines } = figures.fiscalYear
    ? await supabase
        .from('hub_budget_lines')
        .select('amount_cents, trust')
        .eq('org_id', hub.orgId)
        .eq('section', 'operating_expenses')
        .eq('fiscal_year', figures.fiscalYear)
    : { data: [] }

  const cost = (costLines ?? []).filter((l) => l.amount_cents !== null)
  const annualCost =
    cost.length === 0
      ? { cents: null as number | null, trust: null as string | null }
      : {
          cents: cost.reduce((s, l) => s + Number(l.amount_cents), 0),
          trust: worstTrust(cost.map((l) => l.trust)),
        }

  return (
    <div>
      <SectionTitle label="Money" title="Are we funded" />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 1,
          background: 'var(--hub-line-on-black)',
          border: '1px solid var(--hub-line-on-black)',
        }}
      >
        <Stat
          label="What the year costs"
          value={annualCost.cents !== null ? hubMoney(annualCost.cents) : null}
          trust={annualCost.trust}
          gap="The budget workbook isn't loaded yet."
        />
        <Stat
          label="The goal"
          value={figures.goal.cents !== null ? hubMoney(figures.goal.cents) : null}
          trust={figures.goal.trust}
          gap="Computed from the budget once it's in: costs, the service charge on gifts, and the capital need."
        />
        <Stat
          label="Raised and committed"
          value={figures.committed.cents !== null ? hubMoney(figures.committed.cents) : null}
          trust={figures.committed.trust}
          gap="No gifts or pledges are recorded yet."
        />
        <Stat
          label="The gap"
          value={figures.gap.cents !== null ? hubMoney(figures.gap.cents) : null}
          trust={figures.gap.trust}
          gap="Computed once the goal is in."
        />
      </div>
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.6,
          color: 'var(--hub-stone-ink)',
          maxWidth: 640,
          marginTop: 24,
        }}
      >
        The cash calendar, the budget detail, and what a gift pays for all land here, every line
        carrying how well it is known: verified, estimated, stated, or placeholder. A number that
        is not settled shows up as not settled.
      </p>
    </div>
  )
}

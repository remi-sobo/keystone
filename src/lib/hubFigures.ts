import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The hub's computed figures (specs/epayl-fundraising-hub.md).
 *
 * The most important rule on the home screen: the progress figure is
 * computed or it is absent. Goal comes from hub_budget_lines rows (the
 * one budget every figure reconciles to), committed from actual gift
 * and pledge records in the current fiscal year. Derived numbers are
 * never stored; storing a derived number is how the numbers start
 * disagreeing.
 */

const TRUST_RANK: Record<string, number> = {
  verified: 0,
  estimated: 1,
  stated: 2,
  placeholder: 3,
}

/** The weakest trust in a set is the trust of the sum. */
export function worstTrust(trusts: (string | null)[]): string | null {
  let worst: string | null = null
  for (const t of trusts) {
    if (!t || !(t in TRUST_RANK)) continue
    if (worst === null || TRUST_RANK[t] > TRUST_RANK[worst]) worst = t
  }
  return worst
}

/**
 * The fiscal year label for an org whose year starts on
 * fiscal_year_start: the label is the calendar year the fiscal year
 * ends in (an October 2026 start is FY2027, the Young Life shape).
 * Null when the org has not settled its fiscal year: a figure keyed
 * to an unsettled year renders as a gap, never as a guess.
 */
export function currentFiscalYear(fiscalYearStart: string | null): number | null {
  if (!fiscalYearStart) return null
  const start = new Date(fiscalYearStart)
  if (Number.isNaN(start.getTime())) return null
  return start.getUTCFullYear() + 1
}

export interface HubFigure {
  cents: number | null
  trust: string | null
}

export interface HomeFigures {
  fiscalYear: number | null
  goal: HubFigure
  committed: HubFigure & { count: number }
  gap: HubFigure
}

/**
 * Goal, committed, and the gap, or their absences. The budget parser
 * (phase three) writes the goal's rows into section 'to_raise'; until
 * they exist the goal is a gap and so is everything computed from it.
 */
export async function homeFigures(
  supabase: SupabaseClient,
  orgId: string,
  fiscalYearStart: string | null
): Promise<HomeFigures> {
  const fy = currentFiscalYear(fiscalYearStart)
  const [goalRes, giftRes] = await Promise.all([
    fy === null
      ? Promise.resolve({ data: [] as { amount_cents: number | null; trust: string }[] })
      : supabase
          .from('hub_budget_lines')
          .select('amount_cents, trust')
          .eq('org_id', orgId)
          .eq('section', 'to_raise')
          .eq('fiscal_year', fy),
    fy === null
      ? Promise.resolve({ data: [] as { amount_cents: number }[] })
      : supabase
          .from('hub_gifts')
          .select('amount_cents')
          .eq('org_id', orgId)
          .eq('fiscal_year', fy),
  ])

  const goalLines = (goalRes.data ?? []).filter((l) => l.amount_cents !== null)
  const goal: HubFigure =
    goalLines.length === 0
      ? { cents: null, trust: null }
      : {
          cents: goalLines.reduce((s, l) => s + Number(l.amount_cents), 0),
          trust: worstTrust(goalLines.map((l) => l.trust)),
        }

  const gifts = giftRes.data ?? []
  const committed = {
    cents: gifts.length === 0 ? null : gifts.reduce((s, g) => s + Number(g.amount_cents), 0),
    trust: gifts.length === 0 ? null : 'stated',
    count: gifts.length,
  }

  const gap: HubFigure =
    goal.cents === null
      ? { cents: null, trust: null }
      : {
          cents: goal.cents - (committed.cents ?? 0),
          trust: worstTrust([goal.trust, committed.cents === null ? null : committed.trust]),
        }

  return { fiscalYear: fy, goal, committed, gap }
}

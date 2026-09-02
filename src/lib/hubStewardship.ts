/**
 * The stewardship rules (specs/epayl-fundraising-hub.md, phase six).
 * Rules in code, not in a table, until the rules stop changing, and
 * this file is the rules. Reading gifts, touches, and the donor
 * facts, each finding says which household, which rule, and why, and
 * carries a deterministic rule key so making it a task fires ONCE per
 * donor per rule per cycle (the unique index on hub_tasks does the
 * remembering).
 *
 * What deliberately does not fire:
 *   - Anything for a do-not-contact household (correction 3; the
 *     database trigger would refuse the task anyway).
 *   - The monthly-donor rule from the handoff. No monthly marker
 *     exists and the plan's own first move is "Count the monthly
 *     donors"; a rule over an uncounted list would be a guess.
 *
 * Pure logic, no IO; gated by e2e/hub-stewardship.spec.ts.
 */

export const BIG_GIFT_CENTS = 1_000_000 // $10,000
const THANK_YOU_DAYS = 7
const REPORT_DAYS = 90
const QUIET_DAYS = 365
const EVENT_FOLLOW_UP_DAYS = 2

export interface StewardDonor {
  id: string
  household: string
  do_not_contact: boolean
  lifetime_cents: number | null
  last_gift_date: string | null
  last_gift_cents: number | null
}

export interface StewardTouch {
  donor_id: string
  kind: string
  occurred_on: string
}

export interface StewardshipFinding {
  donorId: string
  household: string
  rule: 'thank_you' | 'report' | 'quiet_year' | 'event_follow_up'
  title: string
  why: string
  ruleKey: string
}

const daysBetween = (a: string, b: string) =>
  Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000)

export function stewardshipFindings(input: {
  today: string
  donors: StewardDonor[]
  touches: StewardTouch[]
}): StewardshipFinding[] {
  const { today, donors, touches } = input
  const byDonor = new Map<string, StewardTouch[]>()
  for (const t of touches) {
    const list = byDonor.get(t.donor_id) ?? []
    list.push(t)
    byDonor.set(t.donor_id, list)
  }

  const findings: StewardshipFinding[] = []

  for (const d of donors) {
    if (d.do_not_contact) continue
    const mine = byDonor.get(d.id) ?? []

    // A big gift with no thank-you inside seven days.
    if (
      d.last_gift_cents !== null &&
      d.last_gift_cents >= BIG_GIFT_CENTS &&
      d.last_gift_date !== null &&
      daysBetween(d.last_gift_date, today) > THANK_YOU_DAYS &&
      !mine.some((t) => t.kind === 'thank_you' && t.occurred_on >= d.last_gift_date!)
    ) {
      findings.push({
        donorId: d.id,
        household: d.household,
        rule: 'thank_you',
        title: `Thank ${d.household}`,
        why: `A gift over $10,000 on ${d.last_gift_date} has no thank-you on record.`,
        ruleKey: `thank_you:${d.last_gift_date}`,
      })
    }

    // The same gift with no report inside ninety days.
    if (
      d.last_gift_cents !== null &&
      d.last_gift_cents >= BIG_GIFT_CENTS &&
      d.last_gift_date !== null &&
      daysBetween(d.last_gift_date, today) > REPORT_DAYS &&
      !mine.some((t) => t.kind === 'report' && t.occurred_on >= d.last_gift_date!)
    ) {
      findings.push({
        donorId: d.id,
        household: d.household,
        rule: 'report',
        title: `Report to ${d.household} on what their gift did`,
        why: `A gift over $10,000 on ${d.last_gift_date} has had no report in ${REPORT_DAYS} days.`,
        ruleKey: `report:${d.last_gift_date}`,
      })
    }

    // Any giver, quiet for a year. Cycles by calendar year so it can
    // fire again next year if the silence holds.
    const lastTouch = mine.reduce<string | null>(
      (max, t) => (max === null || t.occurred_on > max ? t.occurred_on : max),
      null
    )
    const hasHistory = (d.lifetime_cents ?? 0) > 0
    if (
      hasHistory &&
      (lastTouch === null
        ? d.last_gift_date !== null && daysBetween(d.last_gift_date, today) > QUIET_DAYS
        : daysBetween(lastTouch, today) > QUIET_DAYS)
    ) {
      findings.push({
        donorId: d.id,
        household: d.household,
        rule: 'quiet_year',
        title: `Get back in touch with ${d.household}`,
        why:
          lastTouch === null
            ? 'A giving household with nothing on record from the ministry in over a year.'
            : `Nothing on record since ${lastTouch}, over a year ago.`,
        ruleKey: `quiet_year:${today.slice(0, 4)}`,
      })
    }

    // An event guest with no follow-up inside forty-eight hours.
    const events = mine.filter((t) => t.kind === 'event').sort((a, b) =>
      a.occurred_on < b.occurred_on ? 1 : -1
    )
    const latestEvent = events[0]
    if (
      latestEvent &&
      daysBetween(latestEvent.occurred_on, today) > EVENT_FOLLOW_UP_DAYS &&
      !mine.some((t) => t.kind !== 'event' && t.occurred_on >= latestEvent.occurred_on)
    ) {
      findings.push({
        donorId: d.id,
        household: d.household,
        rule: 'event_follow_up',
        title: `Follow up with ${d.household} after the event`,
        why: `They were at an event on ${latestEvent.occurred_on} and have heard nothing since. The window is 48 hours.`,
        ruleKey: `event_follow_up:${latestEvent.occurred_on}`,
      })
    }
  }

  // The sharpest debts first: thank-yous, reports, event windows, then
  // the quiet year.
  const order = { thank_you: 0, report: 1, event_follow_up: 2, quiet_year: 3 }
  return findings.sort((a, b) => order[a.rule] - order[b.rule])
}

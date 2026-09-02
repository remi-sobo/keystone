import { test, expect } from '@playwright/test'
import { stewardshipFindings, BIG_GIFT_CENTS } from '../src/lib/hubStewardship'
import type { StewardDonor } from '../src/lib/hubStewardship'

/**
 * The stewardship rules gate (specs/epayl-fundraising-hub.md). The
 * rules are code, so they are testable line by line: the seven-day
 * thank-you window, the ninety-day report, the quiet year, the
 * event follow-up, the do-not-contact wall, and the rule keys that
 * make a task fire once per donor per rule per cycle.
 */

const donor = (over: Partial<StewardDonor>): StewardDonor => ({
  id: over.id ?? 'd1',
  household: over.household ?? 'Household',
  do_not_contact: over.do_not_contact ?? false,
  lifetime_cents: over.lifetime_cents ?? BIG_GIFT_CENTS,
  last_gift_date: over.last_gift_date ?? null,
  last_gift_cents: over.last_gift_cents ?? null,
})

test('a big gift with no thank-you fires after seven days, not before, and clears on a thank-you', () => {
  const big = donor({ last_gift_date: '2026-08-20', last_gift_cents: BIG_GIFT_CENTS })
  const early = stewardshipFindings({ today: '2026-08-25', donors: [big], touches: [] })
  expect(early.filter((f) => f.rule === 'thank_you').length).toBe(0)
  const late = stewardshipFindings({ today: '2026-09-02', donors: [big], touches: [] })
  expect(late[0].rule).toBe('thank_you')
  expect(late[0].why).toContain('2026-08-20')
  const thanked = stewardshipFindings({
    today: '2026-09-02',
    donors: [big],
    touches: [{ donor_id: 'd1', kind: 'thank_you', occurred_on: '2026-08-22' }],
  })
  expect(thanked.filter((f) => f.rule === 'thank_you').length).toBe(0)
})

test('the report rule waits ninety days and a small gift never fires either rule', () => {
  const big = donor({ last_gift_date: '2026-05-01', last_gift_cents: BIG_GIFT_CENTS })
  const found = stewardshipFindings({
    today: '2026-09-02',
    donors: [big],
    touches: [{ donor_id: 'd1', kind: 'thank_you', occurred_on: '2026-05-02' }],
  })
  expect(found.map((f) => f.rule)).toEqual(['report'])
  const small = donor({ last_gift_date: '2026-01-01', last_gift_cents: 5000 })
  const none = stewardshipFindings({ today: '2026-09-02', donors: [small], touches: [] })
  expect(none.filter((f) => f.rule === 'thank_you' || f.rule === 'report').length).toBe(0)
})

test('a giving household quiet for a year surfaces, keyed by the year', () => {
  const quiet = donor({ last_gift_date: '2024-01-01', last_gift_cents: 5000, lifetime_cents: 5000 })
  const found = stewardshipFindings({ today: '2026-09-02', donors: [quiet], touches: [] })
  const f = found.find((x) => x.rule === 'quiet_year')!
  expect(f).toBeTruthy()
  expect(f.ruleKey).toBe('quiet_year:2026')
  // A recent touch clears it.
  const touched = stewardshipFindings({
    today: '2026-09-02',
    donors: [quiet],
    touches: [{ donor_id: 'd1', kind: 'call', occurred_on: '2026-06-01' }],
  })
  expect(touched.filter((x) => x.rule === 'quiet_year').length).toBe(0)
})

test('an event guest with no follow-up inside 48 hours surfaces', () => {
  const guest = donor({ lifetime_cents: 0 })
  const found = stewardshipFindings({
    today: '2026-09-02',
    donors: [guest],
    touches: [{ donor_id: 'd1', kind: 'event', occurred_on: '2026-08-28' }],
  })
  expect(found.map((f) => f.rule)).toEqual(['event_follow_up'])
  const followed = stewardshipFindings({
    today: '2026-09-02',
    donors: [guest],
    touches: [
      { donor_id: 'd1', kind: 'event', occurred_on: '2026-08-28' },
      { donor_id: 'd1', kind: 'thank_you', occurred_on: '2026-08-29' },
    ],
  })
  expect(followed.length).toBe(0)
})

test('a do-not-contact household never fires anything', () => {
  const dnc = donor({
    do_not_contact: true,
    last_gift_date: '2020-01-01',
    last_gift_cents: BIG_GIFT_CENTS * 5,
  })
  expect(stewardshipFindings({ today: '2026-09-02', donors: [dnc], touches: [] }).length).toBe(0)
})

test('the sharpest debts come first', () => {
  const both = donor({ last_gift_date: '2026-01-01', last_gift_cents: BIG_GIFT_CENTS })
  const found = stewardshipFindings({ today: '2026-09-02', donors: [both], touches: [] })
  expect(found.map((f) => f.rule)).toEqual(['thank_you', 'report'])
})

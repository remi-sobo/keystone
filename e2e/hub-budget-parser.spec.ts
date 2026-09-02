import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { parseBudgetWorkbook, BUDGET_SECTIONS } from '../src/lib/hubBudget'

/**
 * The budget workbook parser gate (specs/epayl-fundraising-hub.md,
 * phase three; correction 4). Every figure on MONEY and HOME computes
 * from the rows this parser writes, each carrying its trust level, so
 * the rules pinned here are the rules the whole money surface stands
 * on. Runs against an invented fixture with the real tab shapes; the
 * real workbook is verified locally from gitignored sources/.
 */

const FIXTURE = path.join(process.cwd(), 'e2e/fixtures/budget-workbook-fixture.xlsx')

function parsed() {
  return parseBudgetWorkbook(new Uint8Array(fs.readFileSync(FIXTURE)))
}

test('the known tabs parse into the owned sections, and money is integer cents', () => {
  const p = parsed()
  expect(p.warnings).toEqual([])
  expect(p.summary.fiscalYears).toEqual([2027, 2028, 2029])
  for (const l of p.lines) {
    expect(BUDGET_SECTIONS.includes(l.section as (typeof BUDGET_SECTIONS)[number])).toBe(true)
    if (l.amount_cents !== null) expect(Number.isInteger(l.amount_cents)).toBe(true)
  }
  // The two figures everything reconciles to.
  expect(p.summary.operatingExpenseCents[2027]).toBe(545000)
  expect(p.summary.toRaiseCents[2027]).toBe(520000)
})

test('the trust rules hold: first year stated, projections estimated, flagged zeros placeholder', () => {
  const p = parsed()
  const salary27 = p.lines.find(
    (l) => l.line === 'Salaries and wages' && l.fiscal_year === 2027
  )!
  const salary28 = p.lines.find(
    (l) => l.line === 'Salaries and wages' && l.fiscal_year === 2028
  )!
  expect(salary27.trust).toBe('stated')
  expect(salary28.trust).toBe('estimated')
  const tech = p.lines.filter((l) => /^Technology/.test(l.line))
  expect(tech.length).toBe(3)
  for (const t of tech) {
    expect(t.amount_cents).toBe(0)
    expect(t.trust, 'a zero the workbook flags as wrong is a placeholder, not a price').toBe(
      'placeholder'
    )
  }
})

test('income, cash, the cash calendar, the split, and what a gift buys all land', () => {
  const p = parsed()
  const income = p.lines.filter((l) => l.section === 'income' && l.fiscal_year === 2027)
  expect(income.map((l) => l.amount_cents)).toEqual([120000, 10000, 500000, -85000])
  const cash = p.lines.find((l) => l.section === 'cash')!
  expect(cash.amount_cents).toBe(100000)
  expect(cash.trust).toBe('stated')
  const months = p.lines.filter((l) => l.section === 'cash_out')
  // The workbook's OWN month labels, never relabeled: the timing tab
  // predates the fiscal-year decision and the page says so instead of
  // asserting a timing nobody modeled.
  expect(months.map((l) => l.line)).toEqual([
    'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
  ])
  expect(months.reduce((s, l) => s + (l.amount_cents ?? 0), 0)).toBe(545000)
  const functional = p.lines.filter((l) => l.section === 'functional')
  expect(functional.map((l) => `${l.line}:${l.amount_cents}`)).toEqual([
    'Program:240000', 'Administration:230000', 'Fundraising:75000',
  ])
  const full = p.lines.filter((l) => l.section === 'gift_buys_full')
  const direct = p.lines.filter((l) => l.section === 'gift_buys_direct')
  expect(full.length).toBe(1) // the house line has no full cost, and no value is invented for it
  expect(direct.length).toBe(2)
  expect(full[0].amount_cents).toBe(15050)
})

test('the to-raise section is the goal: gross contributions per year plus year-one capital', () => {
  const p = parsed()
  const toRaise27 = p.lines.filter((l) => l.section === 'to_raise' && l.fiscal_year === 2027)
  expect(toRaise27.length).toBe(2)
  expect(toRaise27.map((l) => l.amount_cents)).toEqual([500000, 20000])
  const toRaise28 = p.lines.filter((l) => l.section === 'to_raise' && l.fiscal_year === 2028)
  expect(toRaise28.length).toBe(1)
  expect(toRaise28[0].trust).toBe('estimated')
})

test('a workbook without the known tabs refuses to parse rather than guessing', () => {
  expect(() => parseBudgetWorkbook(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toThrow()
  // The donor-export fixture is a real xlsx but not a budget workbook.
  const other = fs.readFileSync(path.join(process.cwd(), 'e2e/fixtures/yl-export-fixture.xlsx'))
  expect(() => parseBudgetWorkbook(new Uint8Array(other))).toThrow(/3-Year Budget/)
})

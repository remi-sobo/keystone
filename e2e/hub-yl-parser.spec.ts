import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { parseYlExport, buildApplyPlan } from '../src/lib/hubYlExport'

/**
 * The Young Life export parser gate (specs/epayl-fundraising-hub.md,
 * phase two). Runs ONLY against the redacted fixture: ten invented
 * households, invented contact details, real column shapes and real
 * edge cases. No test in this repo ever touches a file with a real
 * household in it; the real export is verified locally from the
 * gitignored sources/ directory.
 *
 * The rule this suite exists to pin (correction 2): a re-parse
 * replaces ONLY rows the parser itself wrote. The plan names its
 * delete scope as source = 'yl_export' and a manual gift survives by
 * construction; the isolation matrix holds the RLS half.
 */

const FIXTURE = path.join(process.cwd(), 'e2e/fixtures/yl-export-fixture.xlsx')

function parsed() {
  return parseYlExport(new Uint8Array(fs.readFileSync(FIXTURE)))
}

test.describe('the fixture stays redacted', () => {
  test('every household and address in the fixture is invented', () => {
    const p = parsed()
    for (const h of p.households) {
      expect(h.household, 'fixture households carry the Household suffix').toMatch(/Household/)
      if (h.email) expect(h.email).toMatch(/@example\.test$/)
      if (h.phone) expect(h.phone).toMatch(/555/)
    }
  })
})

test.describe('the known shape parses exactly', () => {
  test('households, years, and the skip-and-warn rows', () => {
    const p = parsed()
    // Ten data rows: one has no account (skipped), two share an
    // account (later wins), leaving eight households.
    expect(p.households.length).toBe(8)
    expect(p.fiscalYears).toEqual([2020, 2021, 2022, 2023, 2024, 2025, 2026])
    expect(p.warnings.some((w) => w.includes('no account number'))).toBe(true)
    expect(p.warnings.some((w) => w.includes('repeats account'))).toBe(true)
  })

  test('money is integer cents, dates are ISO, ids and zips survive as text', () => {
    const p = parsed()
    const larkspur = p.households.find((h) => h.yl_account_number === 'T00000001')!
    expect(larkspur.lifetime_cents).toBe(5000000)
    expect(larkspur.first_gift_date).toBe('2025-10-13')
    expect(larkspur.gifts).toEqual([{ fiscal_year: 2026, amount_cents: 5000000 }])
    const tamarack = p.households.find((h) => h.yl_account_number === 'T00000005')!
    expect(tamarack.capacity_5yr_cents).toBe(50000000)
    expect(tamarack.foundation_assets_cents).toBe(100000000)
    expect(tamarack.pub_foundation_name).toBe('Community Foundation')
    // A numeric zip keeps its leading zero.
    expect(tamarack.zip).toBe('02139')
  })

  test('the donor line is the newest fiscal year, not lifetime giving', () => {
    const p = parsed()
    const donor = p.households.find((h) => h.yl_account_number === 'T00000001')!
    const oldGiver = p.households.find((h) => h.yl_account_number === 'T00000002')!
    expect(donor.status).toBe('donor')
    // 230 lifetime gifts, none in the newest year: a prospect today.
    expect(oldGiver.status).toBe('prospect')
  })

  test('the contact flags are read, and the channel preferences warn instead of vanishing', () => {
    const p = parsed()
    const dnc = p.households.find((h) => h.yl_account_number === 'T00000003')!
    expect(dnc.do_not_contact).toBe(true)
    expect(dnc.receives_appeals).toBe(false)
    expect(p.households.filter((h) => !h.receives_appeals).length).toBe(2)
    expect(p.warnings.some((w) => w.includes('do-not-call'))).toBe(true)
    expect(p.warnings.some((w) => w.includes('opted out of email'))).toBe(true)
  })

  test('a later duplicate account wins whole', () => {
    const p = parsed()
    const juniper = p.households.filter((h) => h.yl_account_number === 'T00000006')
    expect(juniper.length).toBe(1)
    expect(juniper[0].household).toBe('Juniper Household (Corrected)')
    expect(juniper[0].email).toBe('juniper@example.test')
  })

  test('a reshaped export refuses to parse rather than guessing', () => {
    // Any workbook without the known header shape must throw.
    expect(() => parseYlExport(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toThrow()
  })
})

test.describe('the apply plan (correction 2: manual gifts survive)', () => {
  test('the delete scope is the parser source and nothing wider', () => {
    const plan = buildApplyPlan(parsed(), [])
    expect(plan.giftSourceToReplace).toBe('yl_export')
    // Every gift the plan writes is an export-year row keyed by
    // account; nothing in the plan can touch a manual row.
    expect(plan.gifts.length).toBeGreaterThan(0)
    for (const g of plan.gifts) {
      expect(g.yl_account_number).toMatch(/^T\d+$/)
      expect(g.amount_cents).toBeGreaterThan(0)
    }
  })

  test('matches update, newcomers insert, and an archived household stays archived', () => {
    const p = parsed()
    const plan = buildApplyPlan(p, [
      { id: 'id-1', yl_account_number: 'T00000001', status: 'donor' },
      { id: 'id-3', yl_account_number: 'T00000003', status: 'archived' },
    ])
    expect(plan.inserts.length).toBe(6)
    expect(plan.updates.length).toBe(2)
    const archived = plan.updates.find((u) => u.id === 'id-3')!
    expect(archived.fields.status, 'the parser must not resurrect an archived household').toBe(
      undefined
    )
    const live = plan.updates.find((u) => u.id === 'id-1')!
    expect(live.fields.status).toBe('donor')
  })

  test('the update set never carries notes: the parser does not own them', () => {
    const plan = buildApplyPlan(parsed(), [
      { id: 'id-1', yl_account_number: 'T00000001', status: 'donor' },
    ])
    for (const u of plan.updates) {
      expect('notes' in u.fields).toBe(false)
    }
  })
})

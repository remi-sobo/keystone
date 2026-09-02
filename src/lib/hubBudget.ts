import { readWorkbook, type CellValue, type SheetTable } from '@/lib/xlsxRead'

/**
 * The budget workbook parser (specs/epayl-fundraising-hub.md, phase
 * three; correction 4). The one budget every figure reconciles to:
 * this reads the authoritative workbook's tabs into hub_budget_lines
 * rows, each carrying its trust level, and the pages COMPUTE from
 * those rows. No dollar amount is typed into a component anywhere.
 *
 * Trust rules, deliberate and few:
 *   - FY2027 lines: 'stated'. They come from the completed costing
 *     worksheet and Kendra's own answers.
 *   - FY2028 and FY2029 lines: 'estimated'. Scaled projections.
 *   - A zero-value line the workbook itself flags as wrong (the
 *     technology and consulting rows): 'placeholder'. The zero renders
 *     with its own story instead of pretending to be a price.
 *   - The cash-on-hand line: 'stated' (Kendra's number).
 *   - The monthly cash-out timing: 'estimated' (the workbook calls its
 *     own capital timing a guess).
 *
 * Like the export parser, this refuses a workbook without the known
 * tabs rather than guessing at shapes. Pure logic, no IO; the fixture
 * gates it and the real file is verified locally from sources/.
 */

export interface BudgetLine {
  fiscal_year: number
  section: string
  line: string
  amount_cents: number | null
  trust: 'verified' | 'estimated' | 'stated' | 'placeholder'
  note: string | null
  sort: number
}

export interface ParsedBudget {
  lines: BudgetLine[]
  warnings: string[]
  summary: {
    fiscalYears: number[]
    operatingExpenseCents: Record<number, number>
    toRaiseCents: Record<number, number>
  }
}

/** The sections the parser owns. A budget re-import replaces exactly
 *  these for the org and touches nothing else. */
export const BUDGET_SECTIONS = [
  'income',
  'expenses:personnel',
  'expenses:program',
  'expenses:occupancy',
  'expenses:operations',
  'expenses:fundraising',
  'capital',
  'to_raise',
  'functional',
  'cash',
  'cash_out',
  'gift_buys_full',
  'gift_buys_direct',
] as const

const EXPENSE_HEADINGS: Record<string, string> = {
  personnel: 'expenses:personnel',
  'program delivery': 'expenses:program',
  'occupancy, the house': 'expenses:occupancy',
  operations: 'expenses:operations',
  'fundraising and events': 'expenses:fundraising',
}

/** Zero-value lines the workbook itself flags as almost certainly
 *  wrong; a zero here is a placeholder, not a price. */
const PLACEHOLDER_LINES = [/^technology/i, /^consulting/i]

const norm = (v: CellValue) =>
  v === null ? '' : String(v).replace(/\s+/g, ' ').trim().toLowerCase()
const text = (v: CellValue) => (v === null ? null : String(v).trim() || null)
const cents = (v: CellValue) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : null

function sheet(sheets: SheetTable[], name: string): SheetTable | null {
  return sheets.find((s) => norm(s.name) === norm(name)) ?? null
}

export function parseBudgetWorkbook(buf: Uint8Array): ParsedBudget {
  const sheets = readWorkbook(buf)
  const budget = sheet(sheets, '3-Year Budget')
  if (!budget) {
    throw new Error(
      'this does not look like the three-year budget workbook (no 3-Year Budget tab)'
    )
  }

  const warnings: string[] = []
  const lines: BudgetLine[] = []
  let sort = 0
  const push = (l: Omit<BudgetLine, 'sort'>) => lines.push({ ...l, sort: sort++ })

  // ── 3-Year Budget: income, expenses, capital, what has to be raised ──
  const rows = budget.rows
  const headerIdx = rows.findIndex((r) => norm(r[1]).startsWith('fy'))
  if (headerIdx < 0) throw new Error('the 3-Year Budget tab has no fiscal year columns')
  const fiscalYears: number[] = []
  for (let c = 1; c < rows[headerIdx].length; c++) {
    const m = norm(rows[headerIdx][c]).match(/^fy\s*(\d{4})$/)
    if (!m) break
    fiscalYears.push(Number(m[1]))
  }
  if (fiscalYears.length === 0) throw new Error('no FY columns on the 3-Year Budget tab')
  const firstFy = Math.min(...fiscalYears)
  const trustFor = (fy: number, line: string, amount: number | null) => {
    if (amount === 0 && PLACEHOLDER_LINES.some((re) => re.test(line))) return 'placeholder' as const
    return fy === firstFy ? ('stated' as const) : ('estimated' as const)
  }
  const noteCol = fiscalYears.length + 2 // label, FYs, three-year total, then notes

  let section: string | null = null
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    const label = text(row?.[0])
    if (!label) continue
    const key = norm(label)
    if (key === 'income') { section = 'income'; continue }
    if (key === 'expenses') { section = null; continue }
    if (EXPENSE_HEADINGS[key]) { section = EXPENSE_HEADINGS[key]; continue }
    if (key.startsWith('total ') || key.startsWith('operating surplus')) { section = section === 'income' ? null : section; if (key.startsWith('total ')) section = null; continue }
    if (key === 'capital, separate from operations') { section = 'capital'; continue }
    if (key === 'what has to be raised') { section = 'to_raise_block'; continue }
    if (key === 'against the old placeholders') { section = null; continue }
    if (key === 'total operating expenses') { section = null; continue }

    const note = text(row?.[noteCol]) ?? null
    if (section === 'income' || (section && section.startsWith('expenses:'))) {
      for (const fy of fiscalYears) {
        const amount = cents(row[1 + fiscalYears.indexOf(fy)])
        if (amount === null) continue
        push({
          fiscal_year: fy,
          section,
          line: label,
          amount_cents: amount,
          trust: trustFor(fy, label, amount === 0 ? 0 : amount),
          note: fy === firstFy ? note : null,
        })
      }
    } else if (section === 'capital') {
      const amount = cents(row[1])
      if (amount !== null && key !== 'total capital') {
        push({
          fiscal_year: firstFy,
          section: 'capital',
          line: label,
          amount_cents: amount,
          trust: 'stated',
          note,
        })
      }
    } else if (section === 'to_raise_block') {
      if (key === 'gross contributions needed, operating') {
        for (const fy of fiscalYears) {
          const amount = cents(row[1 + fiscalYears.indexOf(fy)])
          if (amount === null) continue
          push({
            fiscal_year: fy,
            section: 'to_raise',
            line: label,
            amount_cents: amount,
            trust: trustFor(fy, label, amount),
            note: fy === firstFy ? note : null,
          })
        }
      } else if (key === 'plus capital, year one' || key === 'capital still to fund') {
        const amount = cents(row[1])
        if (amount !== null && !lines.some((l) => l.section === 'to_raise' && /capital/i.test(l.line))) {
          push({
            fiscal_year: firstFy,
            section: 'to_raise',
            line: 'Capital still to fund',
            amount_cents: amount,
            trust: 'stated',
            note,
          })
        }
      }
    }
  }

  // ── Assumptions: cash on hand ────────────────────────────────────────
  const assumptions = sheet(sheets, 'Assumptions')
  if (assumptions) {
    const cashRow = assumptions.rows.find((r) => norm(r[0]).startsWith('cash on hand'))
    if (cashRow) {
      push({
        fiscal_year: firstFy,
        section: 'cash',
        line: 'Cash on hand, first day of year one',
        amount_cents: cents(cashRow[1]),
        trust: 'stated',
        note: text(cashRow[4] ?? null),
      })
    } else warnings.push('no cash-on-hand line found on the Assumptions tab')
  } else warnings.push('no Assumptions tab; cash on hand is a gap')

  // ── When Money Is Needed: monthly total out, workbook's own labels ──
  const timing = sheet(sheets, 'When Money Is Needed')
  if (timing) {
    const head = timing.rows.find((r) => norm(r[0]) === 'line')
    const totalRow = timing.rows.find((r) => norm(r[0]) === 'total out')
    if (head && totalRow) {
      for (let c = 1; c <= 12; c++) {
        const month = text(head[c])
        const amount = cents(totalRow[c])
        if (!month || amount === null) break
        push({
          fiscal_year: firstFy,
          section: 'cash_out',
          line: month,
          amount_cents: amount,
          trust: 'estimated',
          note: null,
        })
      }
    } else warnings.push('the When Money Is Needed tab is missing its TOTAL OUT row')
  } else warnings.push('no When Money Is Needed tab; the cash calendar is a gap')

  // ── Functional Expenses: the three-way split ────────────────────────
  const functional = sheet(sheets, 'Functional Expenses')
  if (functional) {
    const totalRow = functional.rows.find((r) => norm(r[0]) === 'total')
    if (totalRow) {
      const labels = ['Program', 'Administration', 'Fundraising']
      // TOTAL row: label, 4 ratio columns, then the three totals.
      labels.forEach((label, i) => {
        push({
          fiscal_year: firstFy,
          section: 'functional',
          line: label,
          amount_cents: cents(totalRow[5 + i]),
          trust: 'estimated',
          note: null,
        })
      })
    } else warnings.push('the Functional Expenses tab is missing its TOTAL row')
  } else warnings.push('no Functional Expenses tab; the split is a gap')

  // ── Funding Menu: what a gift buys, full and direct ─────────────────
  const menu = sheet(sheets, 'Funding Menu')
  if (menu) {
    const head = menu.rows.findIndex((r) => norm(r[0]) === 'opportunity')
    if (head >= 0) {
      for (let r = head + 1; r < menu.rows.length; r++) {
        const row = menu.rows[r]
        const name = text(row?.[0])
        if (!name || norm(name).startsWith('full cost is')) break
        const note = text(row[3])
        const full = cents(row[1])
        const direct = cents(row[2])
        if (full !== null) {
          push({ fiscal_year: firstFy, section: 'gift_buys_full', line: name, amount_cents: full, trust: 'estimated', note })
        }
        if (direct !== null) {
          push({ fiscal_year: firstFy, section: 'gift_buys_direct', line: name, amount_cents: direct, trust: 'stated', note: full === null ? note : null })
        }
      }
    } else warnings.push('the Funding Menu tab is missing its header row')
  } else warnings.push('no Funding Menu tab; what a gift buys is a gap')

  const operatingExpenseCents: Record<number, number> = {}
  const toRaiseCents: Record<number, number> = {}
  for (const fy of fiscalYears) {
    operatingExpenseCents[fy] = lines
      .filter((l) => l.fiscal_year === fy && l.section.startsWith('expenses:'))
      .reduce((s, l) => s + (l.amount_cents ?? 0), 0)
    toRaiseCents[fy] = lines
      .filter((l) => l.fiscal_year === fy && l.section === 'to_raise')
      .reduce((s, l) => s + (l.amount_cents ?? 0), 0)
  }

  if (lines.filter((l) => l.section.startsWith('expenses:')).length === 0) {
    throw new Error('no expense lines found; the workbook shape changed and the parser stops')
  }

  return { lines, warnings, summary: { fiscalYears, operatingExpenseCents, toRaiseCents } }
}

import { excelSerialToISO, readWorkbook, type CellValue } from '@/lib/xlsxRead'

/**
 * The Young Life donor export parser (specs/epayl-fundraising-hub.md,
 * phase two). Pure logic: no IO, no supabase import, so
 * e2e/hub-yl-parser.spec.ts can test every rule directly against the
 * redacted fixture. The real file never enters the repo or the tests;
 * it is verified locally from sources/ only.
 *
 * The known shape: 43 columns, mission unit code in A, household in C,
 * FY giving in Y through AE. The parser upserts on the YL account
 * number inside one org, and its gift replacement is scoped to
 * source = 'yl_export' ONLY (correction 2): what Kendra entered by
 * hand survives every re-upload, by construction and by test.
 *
 * What is deliberately NOT carried (minimized per the handoff's own
 * parsed shape): street address, relationship manager, and primary
 * caller names. Do-not-call and email-opt-out fold into the parse
 * warnings so they are seen, not silently dropped; the two enforced
 * flags are do-not-contact and receives-appeals.
 */

const EXPECTED_HEADERS = [
  'mission unit code',
  'yl account number',
  'donor name',
  'informal greeting',
  'iwave score',
  'estimated 5-year capacity',
  'asking number',
  'lifetime to mu',
  'lifetime gift count to mu',
  'real estate property count',
  'business affiliation',
  'business title',
  'planned giving segment',
  'insights category',
  'first gift date',
  'first gift amount',
  'last gift date',
  'last gift amount',
  'largest gift date',
  'largest gift amount',
  'private foundation name',
  'private foundation assets',
  'public foundation name',
  'public foundation assets',
] as const

const FY_FIRST_COL = 24 // Y: FY2020
const CONTACT_COLS = {
  relationshipManager: 31,
  primaryCaller: 32,
  address: 33,
  city: 34,
  state: 35,
  zip: 36,
  email: 37,
  phone: 38,
  doNotContact: 39,
  doNotCall: 40,
  emailOptOut: 41,
  receiveAppeals: 42,
} as const

export interface ParsedHousehold {
  yl_account_number: string
  household: string
  greeting: string | null
  iwave_score: number | null
  capacity_5yr_cents: number | null
  suggested_ask_cents: number | null
  lifetime_cents: number | null
  gift_count: number | null
  real_estate_count: number | null
  business: string | null
  business_title: string | null
  planned_giving_segment: string | null
  insights_category: string | null
  first_gift_date: string | null
  first_gift_cents: number | null
  last_gift_date: string | null
  last_gift_cents: number | null
  largest_gift_date: string | null
  largest_gift_cents: number | null
  foundation_name: string | null
  foundation_assets_cents: number | null
  pub_foundation_name: string | null
  pub_foundation_assets_cents: number | null
  city: string | null
  state: string | null
  zip: string | null
  email: string | null
  phone: string | null
  do_not_contact: boolean
  receives_appeals: boolean
  /** 'donor' when the newest fiscal year column holds a gift. */
  status: 'donor' | 'prospect'
  gifts: { fiscal_year: number; amount_cents: number }[]
}

export interface ParsedExport {
  households: ParsedHousehold[]
  fiscalYears: number[]
  warnings: string[]
}

const norm = (v: CellValue) =>
  v === null ? '' : String(v).replace(/\s+/g, ' ').trim().toLowerCase()

function text(v: CellValue): string | null {
  if (v === null) return null
  let s = String(v).trim()
  // A numeric-looking id or zip arrives as a float; drop the .0.
  if (typeof v === 'number' && Number.isInteger(v)) s = String(v)
  return s === '' ? null : s
}

function intOrNull(v: CellValue): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.round(v)
}

function dollarsToCents(v: CellValue): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.round(v * 100)
}

function dateFromSerial(v: CellValue): string | null {
  if (typeof v === 'number') return excelSerialToISO(v)
  // Some tools re-save dates as text; accept ISO-looking strings.
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return null
}

function zip5(v: CellValue): string | null {
  if (v === null) return null
  if (typeof v === 'number') return String(Math.round(v)).padStart(5, '0')
  const s = String(v).trim()
  return s === '' ? null : s
}

const yes = (v: CellValue) => norm(v) === 'yes' || norm(v) === 'true' || norm(v) === 'y'

/**
 * Parse the export workbook. Throws with a plain message when the file
 * is not the known shape; the caller lands that on the document row as
 * parse_error rather than guessing at columns.
 */
export function parseYlExport(buf: Uint8Array): ParsedExport {
  const sheets = readWorkbook(buf)
  if (sheets.length === 0) throw new Error('the workbook has no sheets')

  // The export is one sheet; find the one whose header row matches.
  let rows: CellValue[][] | null = null
  for (const s of sheets) {
    const header = s.rows[0] ?? []
    if (norm(header[1]) === 'yl account number' && norm(header[2]) === 'donor name') {
      rows = s.rows
      break
    }
  }
  if (!rows) {
    throw new Error(
      'this does not look like the Young Life donor export (no sheet with the known columns)'
    )
  }

  const header = rows[0]
  const warnings: string[] = []
  for (let i = 0; i < EXPECTED_HEADERS.length; i++) {
    if (norm(header[i]) !== EXPECTED_HEADERS[i]) {
      throw new Error(
        `column ${i + 1} is "${text(header[i]) ?? ''}" where "${EXPECTED_HEADERS[i]}" was expected; the export format changed and the parser stops rather than guessing`
      )
    }
  }

  // FY columns run from Y until the header stops saying FY<year>.
  const fiscalYears: number[] = []
  for (let i = FY_FIRST_COL; i < header.length; i++) {
    const m = norm(header[i]).match(/^fy\s*(\d{4})$/)
    if (!m) break
    fiscalYears.push(Number(m[1]))
  }
  if (fiscalYears.length === 0) throw new Error('no fiscal year columns found after column X')
  const newestFy = Math.max(...fiscalYears)

  const missionUnits = new Set<string>()
  const households: ParsedHousehold[] = []
  const accountsSeen = new Map<string, string>()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c) => c === null || String(c).trim() === '')) continue
    const account = text(row[1])
    const name = text(row[2])
    if (!account || !name) {
      warnings.push(`row ${r + 1} has no account number or name and was skipped`)
      continue
    }
    const mu = text(row[0])
    if (mu) missionUnits.add(mu)
    const dupOf = accountsSeen.get(account)
    if (dupOf) {
      warnings.push(
        `"${name}" repeats account ${account} (first seen as "${dupOf}"); the later row wins`
      )
      const i = households.findIndex((h) => h.yl_account_number === account)
      if (i >= 0) households.splice(i, 1)
    }
    accountsSeen.set(account, name)

    const gifts: { fiscal_year: number; amount_cents: number }[] = []
    fiscalYears.forEach((fy, i) => {
      const cents = dollarsToCents(row[FY_FIRST_COL + i])
      if (cents !== null && cents > 0) gifts.push({ fiscal_year: fy, amount_cents: cents })
    })

    if (yes(row[CONTACT_COLS.doNotCall])) {
      warnings.push(`"${name}" is marked do-not-call; the phone number stays but calling is out`)
    }
    if (yes(row[CONTACT_COLS.emailOptOut])) {
      warnings.push(`"${name}" opted out of email; the address stays but email is out`)
    }

    households.push({
      yl_account_number: account,
      household: name,
      greeting: text(row[3]),
      iwave_score: intOrNull(row[4]),
      capacity_5yr_cents: dollarsToCents(row[5]),
      suggested_ask_cents: dollarsToCents(row[6]),
      lifetime_cents: dollarsToCents(row[7]),
      gift_count: intOrNull(row[8]),
      real_estate_count: intOrNull(row[9]),
      business: text(row[10]),
      business_title: text(row[11]),
      planned_giving_segment: text(row[12]),
      insights_category: text(row[13]),
      first_gift_date: dateFromSerial(row[14]),
      first_gift_cents: dollarsToCents(row[15]),
      last_gift_date: dateFromSerial(row[16]),
      last_gift_cents: dollarsToCents(row[17]),
      largest_gift_date: dateFromSerial(row[18]),
      largest_gift_cents: dollarsToCents(row[19]),
      foundation_name: text(row[20]),
      foundation_assets_cents: dollarsToCents(row[21]),
      pub_foundation_name: text(row[22]),
      pub_foundation_assets_cents: dollarsToCents(row[23]),
      city: text(row[CONTACT_COLS.city]),
      state: text(row[CONTACT_COLS.state]),
      zip: zip5(row[CONTACT_COLS.zip]),
      email: text(row[CONTACT_COLS.email]),
      phone: text(row[CONTACT_COLS.phone]),
      do_not_contact: yes(row[CONTACT_COLS.doNotContact]),
      receives_appeals: yes(row[CONTACT_COLS.receiveAppeals]),
      status: gifts.some((g) => g.fiscal_year === newestFy) ? 'donor' : 'prospect',
      gifts,
    })
  }

  if (missionUnits.size > 1) {
    warnings.push(
      `the file carries ${missionUnits.size} mission unit codes (${[...missionUnits].join(', ')}); expected one`
    )
  }
  if (households.length === 0) throw new Error('no household rows found under the header')

  return { households, fiscalYears, warnings }
}

// ── The apply plan (pure; the action runs it under the caller's RLS) ──

export interface ExistingDonor {
  id: string
  yl_account_number: string | null
  status: string
}

export interface ApplyPlan {
  /** Households with no existing row for their account number. */
  inserts: ParsedHousehold[]
  /** Existing rows to update, with the fields the parser owns. */
  updates: { id: string; fields: Omit<ParsedHousehold, 'gifts' | 'status'> & { status?: string } }[]
  /**
   * The gift replacement contract (correction 2): delete WHERE
   * source = 'yl_export' AND org, nothing wider, then insert these.
   */
  giftSourceToReplace: 'yl_export'
  gifts: { yl_account_number: string; fiscal_year: number; amount_cents: number }[]
  summary: {
    households: number
    added: string[]
    matched: number
    gifts: number
    warnings: string[]
  }
}

/**
 * Turn a parse into a plan against what already exists. Rules the
 * tests pin: notes are never in the update set (the parser does not
 * own them), a household Kendra archived stays archived, and the gift
 * replacement names its source scope explicitly.
 */
export function buildApplyPlan(parsed: ParsedExport, existing: ExistingDonor[]): ApplyPlan {
  const byAccount = new Map<string, ExistingDonor>()
  for (const d of existing) {
    if (d.yl_account_number) byAccount.set(d.yl_account_number, d)
  }

  const inserts: ParsedHousehold[] = []
  const updates: ApplyPlan['updates'] = []
  const gifts: ApplyPlan['gifts'] = []

  for (const h of parsed.households) {
    const { gifts: hGifts, status, ...fields } = h
    for (const g of hGifts) {
      gifts.push({ yl_account_number: h.yl_account_number, ...g })
    }
    const match = byAccount.get(h.yl_account_number)
    if (!match) {
      inserts.push(h)
    } else {
      updates.push({
        id: match.id,
        // An archived household stays archived; otherwise the export's
        // donor-or-prospect read stands.
        fields: match.status === 'archived' ? fields : { ...fields, status },
      })
    }
  }

  return {
    inserts,
    updates,
    giftSourceToReplace: 'yl_export',
    gifts,
    summary: {
      households: parsed.households.length,
      added: inserts.map((h) => h.household),
      matched: updates.length,
      gifts: gifts.length,
      warnings: parsed.warnings,
    },
  }
}

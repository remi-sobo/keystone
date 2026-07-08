import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * The Keystone enumeration ratchet, adapted from the Trellis coverage
 * gate (e2e/isolation-coverage.spec.ts) to the two-level scope.
 *
 * Walks the migrations, finds every scoped table, and asserts:
 *
 *   1. Every table carrying practice_id has RLS enabled. (Hard gate.)
 *   2. Every such table has a policy that actually SCOPES rows to the
 *      caller: a practice_members or client_members subquery filtered on
 *      auth.uid(), or a SECURITY DEFINER scope helper. RLS on with
 *      USING (true) fails; the policy body is inspected, not just its
 *      existence.
 *   3. The denormalization rule: every table carrying client_id or
 *      engagement_id also carries practice_id, so the isolation matrix
 *      can assert scope mechanically and RLS never joins deep.
 *   4. Every scoped table is referenced by an isolation spec, or is in
 *      KNOWN_COVERAGE_GAPS below.
 *
 * The effect: a new scoped table added without RLS, without a membership
 * policy, or without an isolation spec turns CI red. It cannot pass
 * quietly. Green on the empty schema by construction (zero tables, zero
 * violations), and armed from the first migration.
 */

const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase/migrations')
const E2E_DIR = path.join(process.cwd(), 'e2e')
const THIS_SPEC = 'isolation-coverage.spec.ts'

/**
 * Scoped tables without a dedicated isolation spec. Acknowledged tech
 * debt, not an exemption. The list starts EMPTY and may only shrink:
 * new tables ship with their spec in the same PR (the per-feature gate).
 */
const KNOWN_COVERAGE_GAPS: ReadonlyArray<string> = []

/**
 * Scoped tables that intentionally carry NO membership policy: RLS on,
 * zero policies (deny-all), service-role only behind an app-layer gate.
 * The documented operator-ledger pattern. Starts empty; every addition
 * needs a SECURITY.md paragraph.
 */
const SERVICE_ROLE_ONLY_TABLES: ReadonlyArray<string> = [
  'ai_spend_ledger',   // AI cost metadata; written by the anthropicClient chokepoint (SECURITY.md 5)
  'voice_violations',  // voice drift log, model excerpts only (SECURITY.md 5)
]

function readAllMigrations(): string {
  if (!fs.existsSync(MIGRATIONS_DIR)) return ''
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf-8'))
    .join('\n')
}

/** Extract the balanced (...) body of a CREATE TABLE starting at `from`. */
function tableBody(sql: string, from: number): string {
  const open = sql.indexOf('(', from)
  if (open < 0) return ''
  let depth = 0
  for (let j = open; j < sql.length; j++) {
    if (sql[j] === '(') depth++
    else if (sql[j] === ')') {
      depth--
      if (depth === 0) return sql.slice(open, j + 1)
    }
  }
  return sql.slice(open)
}

/** Every table whose CREATE TABLE body declares the given column. */
function tablesWithColumn(sql: string, col: string): Set<string> {
  const tables = new Set<string>()
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi
  let m: RegExpExecArray | null
  const colRe = new RegExp(`\\b${col}\\b`)
  while ((m = re.exec(sql))) {
    const body = tableBody(sql, m.index)
    if (colRe.test(body)) tables.add(m[1])
  }
  return tables
}

function rlsEnabledTables(sql: string): Set<string> {
  const set = new Set<string>()
  const re = /alter\s+table\s+(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) set.add(m[1])
  return set
}

/**
 * Map each table to the bodies of the policies that are actually LIVE:
 * a CREATE POLICY with no later DROP POLICY of the same name. Migrations
 * concatenate in filename order, so a policy dropped by a later
 * hardening migration must not still count as protection.
 */
function livePolicyBodiesByTable(sql: string): Record<string, string[]> {
  type Ev = { i: number; type: 'c' | 'd'; key: string; table: string; body?: string }
  const events: Ev[] = []
  const cre = /create\s+policy\s+(?:"([^"]+)"|([a-z0-9_]+))\s+on\s+(?:public\.)?([a-z0-9_]+)([\s\S]*?);/gi
  const dro = /drop\s+policy\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-z0-9_]+))\s+on\s+(?:public\.)?([a-z0-9_]+)/gi
  let m: RegExpExecArray | null
  while ((m = cre.exec(sql))) {
    const name = m[1] || m[2],
      table = m[3]
    if (table.includes('%') || name.includes('%')) continue
    events.push({ i: m.index, type: 'c', key: `${table}::${name}`, table, body: m[4] })
  }
  while ((m = dro.exec(sql))) {
    const name = m[1] || m[2],
      table = m[3]
    if (table.includes('%') || name.includes('%')) continue
    events.push({ i: m.index, type: 'd', key: `${table}::${name}`, table })
  }
  events.sort((a, b) => a.i - b.i)
  const state: Record<string, { live: boolean; table: string; body: string }> = {}
  for (const e of events) {
    if (e.type === 'c') state[e.key] = { live: true, table: e.table, body: e.body || '' }
    else if (state[e.key]) state[e.key].live = false
  }
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(state)) {
    const s = state[k]
    if (s.live) (out[s.table] = out[s.table] || []).push(s.body)
  }
  return out
}

// The canonical membership predicates. A membership subquery filtered on
// the caller's auth.uid() within a bounded window, so a subquery MISSING
// its auth.uid() filter does not spuriously match. The keystone_can
// permission authority (SECURITY DEFINER, resolves from auth.uid()) also
// counts once it exists.
const MEMBERSHIP_PREDICATE =
  /(practice_members|client_members)[\s\S]{0,160}?auth\.uid\(\)|keystone_can\s*\(/i

const sql = readAllMigrations()
const practiceSet = tablesWithColumn(sql, 'practice_id')
const practiceTables = [...practiceSet].sort()
const clientTables = [...tablesWithColumn(sql, 'client_id')].sort()
const engagementTables = [...tablesWithColumn(sql, 'engagement_id')].sort()
const rls = rlsEnabledTables(sql)
const policyBodies = livePolicyBodiesByTable(sql)
const gaps = new Set(KNOWN_COVERAGE_GAPS)
const serviceRoleOnly = new Set(SERVICE_ROLE_ONLY_TABLES)

function hasMembershipPolicy(table: string): boolean {
  return (policyBodies[table] || []).some((b) => MEMBERSHIP_PREDICATE.test(b))
}

/** The isolation/privacy specs, the only ones that count as coverage. */
const ISOLATION_SIGNATURE = /cross-practice|cross-client|isolation|privacy/i
function isolationSpecText(): string {
  return fs
    .readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts') && f !== THIS_SPEC)
    .filter((f) => {
      if (/isolation|privacy/i.test(f)) return true
      return ISOLATION_SIGNATURE.test(fs.readFileSync(path.join(E2E_DIR, f), 'utf-8'))
    })
    .map((f) => fs.readFileSync(path.join(E2E_DIR, f), 'utf-8'))
    .join('\n')
}
const isoText = isolationSpecText()

/** Whole-identifier match so one table name never covers another. */
function specsCover(table: string): boolean {
  return new RegExp(`(?<![a-z0-9_])${table}(?![a-z0-9_])`).test(isoText)
}

test('every practice-scoped table has RLS enabled', () => {
  const missing = practiceTables.filter((t) => !rls.has(t))
  expect(
    missing,
    `Scoped tables with NO 'enable row level security': ${missing.join(', ')}`
  ).toEqual([])
})

test('every practice-scoped table has a membership-scoped policy (not just RLS on)', () => {
  const unscoped = practiceTables.filter((t) => !hasMembershipPolicy(t) && !serviceRoleOnly.has(t))
  expect(
    unscoped,
    `Scoped table(s) with RLS on but NO membership-scoped policy ` +
      `(practice_members/client_members with auth.uid(), or keystone_can). ` +
      `Add the policy, or, only if genuinely deny-all service-role-only, ` +
      `SERVICE_ROLE_ONLY_TABLES with a SECURITY.md paragraph: ${unscoped.join(', ')}`
  ).toEqual([])
})

test('every table carrying client_id or engagement_id also carries practice_id (denormalization rule)', () => {
  const missing = [...new Set([...clientTables, ...engagementTables])]
    .filter((t) => !practiceSet.has(t))
    .filter((t) => !['practices'].includes(t))
    .sort()
  expect(
    missing,
    `Table(s) scoped below practice level but missing the denormalized ` +
      `practice_id column (spec 5.1): ${missing.join(', ')}`
  ).toEqual([])
})

test('every practice-scoped table is covered by an isolation spec or the known backlog', () => {
  const uncovered = practiceTables.filter((t) => !specsCover(t) && !gaps.has(t))
  expect(
    uncovered,
    `New scoped table(s) with no isolation coverage. Add the table to the ` +
      `seeded matrix and an isolation assertion (preferred) or, deliberately, ` +
      `to KNOWN_COVERAGE_GAPS: ${uncovered.join(', ')}`
  ).toEqual([])
})

test('the coverage backlog has no stale entries and only shrinks', () => {
  const nowCovered = KNOWN_COVERAGE_GAPS.filter((t) => specsCover(t))
  expect(
    nowCovered,
    `These tables now have coverage; remove them from KNOWN_COVERAGE_GAPS: ${nowCovered.join(', ')}`
  ).toEqual([])
  const vanished = KNOWN_COVERAGE_GAPS.filter((t) => !practiceTables.includes(t))
  expect(
    vanished,
    `These backlog tables are no longer scoped tables; remove them: ${vanished.join(', ')}`
  ).toEqual([])
})

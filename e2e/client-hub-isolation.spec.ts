import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * The client hub isolation gate (specs/epayl-fundraising-hub.md).
 *
 * Keystone's first client user logs in here: a hub member on the
 * platform that holds every other client's delivery data, SOBO's
 * engagement records, and the commission ledger. The existing privacy
 * walls run practice-outward (the sales lead, the client member); this
 * is the OPPOSITE direction and it gets its own suite, written before
 * the feature. Phase one ships nothing past these tests.
 *
 * A hub member must not be able to read, infer, or enumerate:
 *   - any other org's rows in any table, hub tables included
 *   - any SOBO engagement, client, or financial record
 *   - the commission ledger
 *   - the list of other orgs, including their count or their names
 *
 * Structural half here (migration SQL and route source, no live DB);
 * the live half is the seeded matrix in
 * supabase/tests/isolation-seed.sql: a hub persona claims membership
 * through the real RPC, sweeps EVERY practice-scoped table
 * mechanically (cross-org and client-direction), and every existing
 * persona plus anon reads zero hub rows.
 *
 * Green on the empty schema by construction; armed forever the moment
 * migration 0046 lands the hub tables.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const MIGRATIONS_DIR = 'supabase/migrations'
const SEED_MATRIX = 'supabase/tests/isolation-seed.sql'

/** Every hub table the schema defines. The list is the contract: a new
 *  hub_ table must be added here (and to the matrix) in the same PR. */
const HUB_TABLES = [
  'hub_orgs',
  'hub_members',
  'hub_donors',
  'hub_gifts',
  'hub_profiles',
  'hub_tasks',
  'hub_strategies',
  'hub_budget_lines',
  'hub_documents',
  'hub_touches',
  'hub_content_blocks',
  'hub_collateral',
  'hub_capacity',
] as const

/** Hub tables a member session must NOT be able to write: org identity
 *  and membership are operator work, so a hub session can never widen
 *  its own access or mint another org. */
const OPERATOR_ONLY_HUB_TABLES = ['hub_orgs', 'hub_members'] as const

function walk(dir: string, ext: string[]): string[] {
  const out: string[] = []
  const root = path.join(process.cwd(), dir)
  if (!fs.existsSync(root)) return out
  const rec = (rel: string) => {
    for (const e of fs.readdirSync(path.join(process.cwd(), rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`
      if (e.isDirectory()) rec(child)
      else if (ext.some((x) => e.name.endsWith(x))) out.push(child)
    }
  }
  rec(dir)
  return out
}

function allMigrationsSql(): string {
  const root = path.join(process.cwd(), MIGRATIONS_DIR)
  if (!fs.existsSync(root)) return ''
  return fs
    .readdirSync(root)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => read(`${MIGRATIONS_DIR}/${f}`))
    .join('\n')
}

const sql = allMigrationsSql()
const nsql = norm(sql)
const armed = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?hub_orgs/i.test(sql)

/** Live policy bodies per table (a CREATE POLICY with no later DROP),
 *  with the policy's FOR clause kept so write policies are visible. */
function livePolicies(table: string): { name: string; body: string }[] {
  const cre = new RegExp(
    `create\\s+policy\\s+(?:"([^"]+)"|([a-z0-9_]+))\\s+on\\s+(?:public\\.)?${table}\\b([\\s\\S]*?);`,
    'gi'
  )
  const dro = new RegExp(
    `drop\\s+policy\\s+(?:if\\s+exists\\s+)?(?:"([^"]+)"|([a-z0-9_]+))\\s+on\\s+(?:public\\.)?${table}\\b`,
    'gi'
  )
  const state: Record<string, { i: number; body: string; live: boolean }> = {}
  let m: RegExpExecArray | null
  while ((m = cre.exec(sql))) {
    const name = m[1] || m[2]
    state[name] = { i: m.index, body: m[3], live: true }
  }
  while ((m = dro.exec(sql))) {
    const name = m[1] || m[2]
    if (state[name] && m.index > state[name].i) state[name].live = false
  }
  return Object.entries(state)
    .filter(([, s]) => s.live)
    .map(([name, s]) => ({ name, body: s.body }))
}

test.describe('the hub schema wall (structural)', () => {
  test('every hub table exists once armed, with RLS enabled', () => {
    if (!armed) return
    for (const t of HUB_TABLES) {
      expect(
        new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${t}\\b`, 'i').test(sql),
        `${t} is in the hub contract but no migration creates it`
      ).toBe(true)
      expect(
        nsql.includes(`alter table ${t} enable row level security`) ||
          nsql.includes(`alter table public.${t} enable row level security`),
        `${t} never enables RLS`
      ).toBe(true)
    }
  })

  test('every hub table policy resolves scope through is_hub_member, from the authenticated user', () => {
    if (!armed) return
    for (const t of HUB_TABLES) {
      const pols = livePolicies(t)
      expect(pols.length, `${t} has RLS on but no live policy at all`).toBeGreaterThan(0)
      for (const p of pols) {
        expect(
          /is_hub_member\s*\(/i.test(p.body),
          `policy ${p.name} on ${t} does not resolve through private.is_hub_member; ` +
            `scope must come from the authenticated user, never the browser`
        ).toBe(true)
      }
    }
  })

  test('is_hub_member is SECURITY DEFINER, pins search_path, and honors revocation', () => {
    if (!armed) return
    const defs = [
      ...sql.matchAll(
        /create\s+or\s+replace\s+function\s+private\.is_hub_member[\s\S]*?\$\$([\s\S]*?)\$\$/gi
      ),
    ]
    expect(defs.length, 'private.is_hub_member must be defined').toBeGreaterThan(0)
    const last = defs[defs.length - 1][0]
    expect(last).toMatch(/security\s+definer/i)
    expect(last).toMatch(/set\s+search_path/i)
    expect(last).toMatch(/auth\.uid\(\)/)
    expect(last, 'a revoked hub member must stop resolving as one').toMatch(/revoked_at\s+is\s+null/i)
  })

  test('a hub session can never write org identity or membership', () => {
    if (!armed) return
    for (const t of OPERATOR_ONLY_HUB_TABLES) {
      for (const p of livePolicies(t)) {
        expect(
          /for\s+(insert|update|delete|all)/i.test(p.body),
          `policy ${p.name} on ${t} opens a write path; org identity and membership are operator work only`
        ).toBe(false)
      }
    }
  })

  test('hub_gifts carries the source column that keeps manual gifts alive across a re-parse', () => {
    if (!armed) return
    const m = sql.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?hub_gifts\s*\(([\s\S]*?)\);/i)
    expect(m, 'hub_gifts create table not found').toBeTruthy()
    const body = m![1]
    expect(body).toMatch(/source\s+text\s+not\s+null/i)
    expect(body).toMatch(/yl_export/)
    expect(body).toMatch(/manual/)
  })

  test('do-not-contact is enforced by a trigger, not annotated: a task for a flagged household is refused in the database', () => {
    if (!armed) return
    expect(nsql, 'no trigger function guards hub_tasks against do-not-contact households').toMatch(
      /hub_tasks_refuse_do_not_contact|refuse_do_not_contact/
    )
    expect(nsql).toMatch(/create\s+trigger\s+[a-z0-9_]*do_not_contact[a-z0-9_]*\s+before\s+insert/)
  })

  test('the LAST claim RPC definition claims hub membership too', () => {
    if (!armed) return
    const defs = [
      ...sql.matchAll(
        /create\s+or\s+replace\s+function\s+public\.keystone_claim_membership[\s\S]*?\$\$([\s\S]*?)\$\$/gi
      ),
    ]
    expect(defs.length).toBeGreaterThan(0)
    const last = defs[defs.length - 1][1]
    expect(
      last,
      'the live keystone_claim_membership no longer claims hub_members; invited hub users can never get in'
    ).toMatch(/hub_members/)
    expect(last, 'hub claim must exclude revoked rows').toMatch(/revoked_at\s+is\s+null/i)
  })
})

test.describe('the hub surface is pure RLS and reads variables only', () => {
  const surfaces = [
    ...walk('src/app/(hub)', ['.ts', '.tsx']),
    ...walk('src/components/hub', ['.ts', '.tsx']),
  ]

  test('no file under the hub surface touches the service role', () => {
    for (const f of surfaces) {
      const src = stripJsComments(read(f))
      expect(src, `${f} must not use the service role`).not.toMatch(/service_role/i)
      expect(src, `${f} must not import supabaseAdmin`).not.toMatch(/supabaseadmin/i)
      expect(src, `${f} must not read the service-role key`).not.toContain(
        'SUPABASE_SERVICE_ROLE_KEY'
      )
    }
  })

  test('no hex color appears in a hub component, ever: the theme is a row, not a branch in the code', () => {
    for (const f of surfaces) {
      const src = stripJsComments(read(f))
      const hex = src.match(/#[0-9a-fA-F]{3,8}\b/)
      expect(hex, `${f} hardcodes a color (${hex?.[0]}); read a --hub-* variable instead`).toBeNull()
    }
  })

  test('the door carve-out in the proxy is backed by every Keystone layout guarding itself', () => {
    // src/proxy.ts lets single-segment paths through the coarse gate so
    // an org's door can render signed-out. That is only safe while
    // every OTHER surface layout bounces a signed-out visitor itself.
    const groups = fs
      .readdirSync(path.join(process.cwd(), 'src/app'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith('(') && e.name !== '(hub)')
      .map((e) => `src/app/${e.name}/layout.tsx`)
      .filter((f) => fs.existsSync(path.join(process.cwd(), f)))
    expect(groups.length, 'no surface layouts found; the walk is broken').toBeGreaterThan(0)
    for (const f of groups) {
      expect(
        read(f),
        `${f} no longer bounces a signed-out visitor; the proxy door carve-out depends on it`
      ).toMatch(/if\s*\(!viewer\.user\)\s*redirect\('\/login'\)/)
    }
  })

  test('the hub surface never renders Keystone chrome', () => {
    for (const f of surfaces) {
      const src = stripJsComments(read(f))
      expect(src, `${f} imports the Keystone sidebar; the hub renders none of Keystone's chrome`).not.toMatch(
        /components\/Sidebar/
      )
      expect(src, `${f} imports Keystone nav`).not.toMatch(/components\/nav/)
    }
  })
})

test.describe('the live matrix covers the client direction', () => {
  test('the seeded matrix carries the hub personas and both sweep directions', () => {
    if (!armed) return
    expect(fs.existsSync(path.join(process.cwd(), SEED_MATRIX))).toBe(true)
    const seed = norm(read(SEED_MATRIX))
    // Two orgs under the same practice, so the cross-org wall is real.
    expect(seed).toMatch(/org_h1|org h1/)
    expect(seed).toMatch(/org_h2|org h2/)
    // The mechanical client-direction sweep: every practice-scoped
    // table, zero rows for the hub persona.
    expect(seed).toMatch(/client-direction sweep/)
    expect(seed).toMatch(/cross-org/)
    // The reverse direction: existing personas read zero hub rows.
    expect(seed).toMatch(/leak hub|LEAK hub/i)
    // Every hub table appears in the matrix.
    for (const t of HUB_TABLES) {
      expect(seed, `${t} is not exercised by the live matrix`).toContain(t)
    }
  })
})

import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * The sales-lead privacy wall (specs/keystone-sales.md, Ring 1).
 *
 * The sales lead is a contractor with a login. He sells the practice's
 * offers and must never reach the practice's delivery: no engagement,
 * no session, no note, no client, no deliverable, no message, no
 * finance row, and no deal he did not register.
 *
 * The wall is ONE predicate. Every practice-side read policy in the
 * schema resolves through private.is_practice_member, so redefining
 * that function to exclude the role walls the whole existing system in
 * a single place. This gate pins that fact structurally, because a
 * later migration restating the predicate without the exclusion would
 * silently reopen every door at once. The live half is the seeded
 * matrix, which signs in as the role and counts rows.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')

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

const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const MIG_1 = 'supabase/migrations/0044_sales_registration.sql'
const MIG_4 = 'supabase/migrations/0045_sales_commission.sql'
const SEED = 'supabase/tests/isolation-seed.sql'
const SALES_SURFACE = 'src/app/(sales)'

/**
 * Every migration in the tree, so the check below sees the LAST
 * definition of the predicate rather than only the one this ring wrote.
 */
function allMigrationsSql(): string {
  const dir = path.join(process.cwd(), 'supabase/migrations')
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf-8'))
    .join('\n')
}

test.describe('the wall, in one predicate', () => {
  test('the LAST definition of is_practice_member excludes the sales lead', () => {
    const sql = allMigrationsSql()
    const defs = [
      ...sql.matchAll(
        /create\s+or\s+replace\s+function\s+private\.is_practice_member[\s\S]*?\$\$([\s\S]*?)\$\$/g
      ),
    ]
    expect(defs.length, 'is_practice_member must be defined somewhere').toBeGreaterThan(0)
    const last = defs[defs.length - 1][1]
    expect(
      last,
      'the live is_practice_member no longer excludes the sales lead, which reopens ' +
        'every practice-side read policy in the schema to a contractor'
    ).toMatch(/role\s*<>\s*'sales_lead'/)
  })

  test('the sales lead holds sales permissions only, never delivery ones', () => {
    const sql = allMigrationsSql()
    const grants = [...sql.matchAll(/\(\s*'sales_lead'\s*,\s*'([a-z_.]+)'\s*\)/g)].map((m) => m[1])
    expect(grants.length, 'the sales_lead role must hold at least one permission').toBeGreaterThan(
      0
    )
    for (const perm of grants) {
      expect(
        perm.startsWith('sales.'),
        `sales_lead was granted '${perm}', which is not a sales permission`
      ).toBe(true)
    }
    for (const forbidden of [
      'engagement.read',
      'engagement.write',
      'members.manage',
      'practice.manage',
    ]) {
      expect(grants, `sales_lead must never hold ${forbidden}`).not.toContain(forbidden)
    }
  })

  test('the role is a checked value, not a free-text column', () => {
    expect(read(MIG_1)).toMatch(/check\s*\(role in \('owner', 'consultant', 'sales_lead'\)\)/)
  })
})

test.describe('the sales tables carry their own wall', () => {
  const sql = read(MIG_1) + '\n' + read(MIG_4)

  test('every sales table enables RLS and scopes reads to the caller', () => {
    for (const table of [
      'house_accounts',
      'sales_prospects',
      'sales_deals',
      'sales_payments',
      'sales_commissions',
    ]) {
      expect(sql, `${table} must enable RLS`).toContain(
        `alter table public.${table} enable row level security`
      )
      expect(sql, `${table} must have a read policy`).toMatch(
        new RegExp(`create policy ${table}_read on public\\.${table}`)
      )
    }
  })

  test('a rep reads only rows he owns; the practice owner reads them all', () => {
    for (const [table, ownerCol] of [
      ['sales_prospects', 'registered_by'],
      ['sales_deals', 'owner_id'],
      ['sales_commissions', 'owner_id'],
    ] as const) {
      const policy = sql.slice(sql.indexOf(`create policy ${table}_read`))
      const body = policy.slice(0, policy.indexOf(';'))
      expect(body, `${table} read must admit the practice owner`).toContain("'sales.manage'")
      expect(body, `${table} read must scope the rep to his own rows`).toContain(
        `${ownerCol} = auth.uid()`
      )
      expect(body, `${table} read must use the sales predicate, not the delivery one`).toContain(
        'is_sales_lead'
      )
    }
  })

  test('registration is self-authored and money is not the rep to write', () => {
    const insert = sql.slice(sql.indexOf('create policy sales_prospects_insert'))
    expect(insert.slice(0, insert.indexOf(';'))).toContain('registered_by = auth.uid()')
    // No manual deal creation for the sales role (spec failure mode 4),
    // and no self-recorded payments.
    for (const table of ['sales_deals', 'sales_payments']) {
      const p = sql.slice(sql.indexOf(`create policy ${table}_insert`))
      const body = p.slice(0, p.indexOf(';'))
      expect(body, `${table} insert must be sales.manage only`).toContain("'sales.manage'")
      expect(body, `${table} insert must not admit the register permission`).not.toContain(
        "'sales.register'"
      )
    }
  })

  test('the record is append-only: no delete path anywhere in the module', () => {
    expect(sql).not.toMatch(/create policy sales_prospects_delete/)
    expect(sql).not.toMatch(/create policy sales_deals_delete/)
    expect(sql).not.toMatch(/create policy sales_payments_delete/)
    expect(sql).not.toMatch(/create policy sales_commissions_delete/)
  })

  test('the house-account list is never readable by the role it constrains', () => {
    const policy = sql.slice(sql.indexOf('create policy house_accounts_read'))
    const body = policy.slice(0, policy.indexOf(';'))
    expect(body, 'house_accounts must be delivery-side only').toContain('is_practice_member')
    expect(body, 'a rep must not be able to enumerate Exhibit A').not.toContain('is_sales_lead')
    // He gets a verdict on the one name he typed instead.
    expect(sql).toContain('function public.keystone_sales_registration_check')
    expect(sql).toContain("return 'house_account'")
  })

  test('the collision guard lives in the database, on every insert path', () => {
    expect(sql).toContain('create trigger sales_prospects_guard')
    expect(sql).toContain('before insert on public.sales_prospects')
    for (const collision of [
      'sales_collision_house_account',
      'sales_collision_existing_client',
      'sales_collision_already_registered',
    ]) {
      expect(sql, `the guard must refuse: ${collision}`).toContain(collision)
    }
  })
})

test.describe('the sales surface is pure RLS', () => {
  test('no file under app/(sales) touches the service role', () => {
    const files = walk(SALES_SURFACE, ['.ts', '.tsx'])
    expect(files.length, 'the sales surface must exist').toBeGreaterThan(0)
    for (const f of files) {
      const src = stripJsComments(read(f))
      expect(src, `${f} must not use the service role`).not.toMatch(/service_role/i)
      expect(src, `${f} must not import supabaseAdmin`).not.toMatch(/supabaseadmin/i)
      expect(src, `${f} must not read the service-role key`).not.toContain(
        'SUPABASE_SERVICE_ROLE_KEY'
      )
    }
  })

  test('every sales-surface route guards through requireSalesLead', () => {
    const routes = walk(SALES_SURFACE, ['route.ts'])
    for (const f of routes) {
      expect(read(f), `${f} must guard via requireSalesLead`).toContain('requireSalesLead')
      expect(read(f), `${f} must not read a client-supplied scope id`).not.toMatch(
        /(payload|body|params|searchparams)\.?\w*\.(practice_id|practiceid)/i
      )
    }
  })

  test('the sales surface never queries a delivery table by name', () => {
    // Defense in depth behind RLS: even a query that would return zero
    // rows has no business being written on this surface.
    const delivery = [
      'engagements',
      'sessions',
      'session_notes',
      'clients',
      'client_members',
      'action_items',
      'deliverables',
      'resources',
      'messages',
      'workstreams',
      'digests',
      'charters',
    ]
    for (const f of walk(SALES_SURFACE, ['.ts', '.tsx'])) {
      const src = stripJsComments(read(f))
      for (const table of delivery) {
        expect(src, `${f} queries the delivery table '${table}'`).not.toContain(`from('${table}')`)
      }
    }
  })

  test('the practice resolver refuses a sales lead', () => {
    const auth = read('src/lib/auth.ts')
    expect(auth).toContain("const DELIVERY_ROLES: PracticeRole[] = ['owner', 'consultant']")
    const fn = auth.slice(auth.indexOf('export async function requirePracticeMember'))
    const body = fn.slice(0, fn.indexOf('export async function requireSalesLead'))
    expect(
      (body.match(/\.in\('role', DELIVERY_ROLES\)/g) ?? []).length,
      'both membership reads in requirePracticeMember must filter to delivery roles'
    ).toBe(2)
    // And the page-level resolver keeps the populations in separate
    // fields, so `viewer.practice` can never be a sales lead.
    const membership = read('src/lib/membership.ts')
    expect(membership).toContain("const isSales = pm.data?.role === 'sales_lead'")
    expect(membership).toContain('pm.data && !isSales')
  })

  test('the practice ledger is owner-only at the page and in the action', () => {
    expect(read('src/app/(practice)/sales-ledger/page.tsx')).toContain(
      "viewer.practice.role !== 'owner'"
    )
    const actions = read('src/app/(practice)/sales-ledger/actions.ts')
    expect(actions).toContain("viewer.practice.role !== 'owner'")
    for (const fn of ['recordDeal', 'recordPayment', 'markCommissionPaid', 'addHouseAccount']) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`))
      expect(body.slice(0, 300), `${fn} guards the ledger`).toContain('guardLedger()')
    }
  })
})

test.describe('the seeded matrix carries the sales wall', () => {
  const seed = read(SEED)

  test('a sales lead signs in and reads zero of the delivery record', () => {
    for (const leak of [
      'LEAK sales: a sales lead reads engagements',
      'LEAK sales: a sales lead reads the practice client list',
      'LEAK sales: a sales lead reads sessions',
      'LEAK sales: a sales lead reads session notes',
      'LEAK sales: a sales lead reads homework',
      'LEAK sales: a sales lead reads deliverables',
      'LEAK sales: a sales lead reads messages',
      'LEAK sales: a sales lead enumerates the house-account list',
      'LEAK sales: a sales lead enumerates the practice roster',
    ]) {
      expect(seed, `the matrix must assert: ${leak}`).toContain(leak)
    }
  })

  test('the collision guard and the ownership wall are exercised live', () => {
    for (const hole of [
      'HOLE sales: a house account was registered',
      'HOLE sales: an existing client of the practice was registered',
      'HOLE sales: the same org was registered twice',
      'HOLE sales: a registration was filed in another persons name',
      'HOLE sales: a registration crossed the practice wall',
      'HOLE sales: a sales lead created their own deal',
      'HOLE sales: a posted owner_id overrode the registration record',
      'LEAK sales: a rep reads another reps registrations',
      'LEAK sales: a rep reads another reps money',
      'LEAK cross-practice: sales_b reads practice_a sales rows',
      'LEAK sales: a client member reads sales rows',
    ]) {
      expect(seed, `the matrix must assert: ${hole}`).toContain(hole)
    }
  })

  test('the wall did not cost delivery anything', () => {
    expect(seed).toContain('the sales wall broke a consultants delivery visibility')
    expect(seed).toContain('LEAK sales: a consultant reads the sales pipeline')
  })
})

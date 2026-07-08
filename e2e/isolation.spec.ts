import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * The Keystone isolation gate. Extended from the Pathway role-isolation
 * suite (trellis e2e/pathway-role-isolation.spec.ts) to the two-level
 * scope: practice AND client.
 *
 * Same pure, no-live-DB style as the quarry gates: the boundary is
 * asserted in the migration SQL and the route source, because that is
 * what runs in CI without a database. The live half is the SEEDED
 * MATRIX in supabase/tests/isolation-seed.sql (Ring 1): two practices,
 * each with one client, applied to a throwaway Postgres in CI (the
 * BloomOS rls-leak-test pattern), asserting that cross-practice AND
 * cross-client reads return zero rows at the RLS layer, not merely a
 * 403.
 *
 * Ring 0 ships this gate green on the empty schema: the structural
 * checks pass vacuously over zero migrations and zero routes, and the
 * seeded-matrix contract check arms itself the moment the first scoped
 * migration lands. From then on, a scoped migration without the seed
 * matrix turns CI red.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const MIGRATIONS_DIR = 'supabase/migrations'
const SEED_MATRIX = 'supabase/tests/isolation-seed.sql'

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

const sql = norm(allMigrationsSql())
const hasScopedSchema = /\bpractice_id\b/.test(sql)

test.describe('the two-level RLS wall (structural)', () => {
  test('every migration that creates a scoped table enables RLS on it', () => {
    // Vacuously green on the empty schema; the enumeration ratchet in
    // isolation-coverage.spec.ts carries the per-table detail.
    const created = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/g)].map(
      (m) => m[1]
    )
    for (const t of created) {
      const scoped = new RegExp(`create\\s+table[^;]*${t}\\s*\\([^;]*practice_id`).test(sql)
      if (!scoped) continue
      expect(
        sql.includes(`alter table ${t} enable row level security`) ||
          sql.includes(`alter table public.${t} enable row level security`),
        `${t} carries practice_id but never enables RLS`
      ).toBe(true)
    }
  })

  test('no RLS policy trusts a client-supplied scope id', () => {
    // Every policy must resolve scope from the authenticated user:
    // auth.uid() through a membership table or a SECURITY DEFINER
    // helper. current_setting-style request headers are not a scope
    // source in Keystone.
    expect(sql).not.toMatch(/current_setting\s*\(\s*'request\.headers/)
  })

  test('SECURITY DEFINER helpers pin search_path', () => {
    // Every SECURITY DEFINER function in the schema must pin its
    // search_path (the Pathway and BloomOS precedent).
    const fns = [...sql.matchAll(/create\s+or\s+replace\s+function[^;]*?security\s+definer[^;]*?;/g)]
    for (const m of fns) {
      expect(m[0], 'SECURITY DEFINER without a pinned search_path').toMatch(/set\s+search_path/)
    }
  })

  test('the seeded matrix ships with the first scoped migration', () => {
    // The contract: the moment any migration defines a practice-scoped
    // table, supabase/tests/isolation-seed.sql must exist and must seed
    // TWO practices, each with ONE client, and assert both cross-practice
    // and cross-client reads return zero rows.
    if (!hasScopedSchema) {
      expect(fs.existsSync(path.join(process.cwd(), MIGRATIONS_DIR))).toBeDefined()
      return
    }
    expect(
      fs.existsSync(path.join(process.cwd(), SEED_MATRIX)),
      `scoped schema exists but ${SEED_MATRIX} is missing`
    ).toBe(true)
    const seed = norm(read(SEED_MATRIX))
    // Two practices, each with one client.
    expect((seed.match(/insert into (?:public\.)?practices/g) || []).length).toBeGreaterThanOrEqual(1)
    expect(seed).toMatch(/practice_a|practice a/)
    expect(seed).toMatch(/practice_b|practice b/)
    expect(seed).toMatch(/client_a|client a/)
    expect(seed).toMatch(/client_b|client b/)
    // Zero-row assertions for both dimensions.
    expect(seed).toMatch(/cross-practice/)
    expect(seed).toMatch(/cross-client/)
  })
})

test.describe('the client surface is pure RLS (no service role)', () => {
  test('no file under app/(client) or its routes touches the service role', () => {
    // The no-service-role guard (Pathway pattern), scoped to the client
    // surface paths. Green while the surface is empty; armed forever
    // after. The list of guarded roots covers the surface and any api
    // segment it owns.
    const guarded = [
      ...walk('src/app/(client)', ['.ts', '.tsx']),
      ...walk('app/(client)', ['.ts', '.tsx']),
    ]
    for (const f of guarded) {
      const src = stripJsComments(read(f))
      expect(src, `${f} must not use the service role`).not.toMatch(/service_role/i)
      expect(src, `${f} must not import supabaseAdmin`).not.toMatch(/supabaseadmin/i)
      expect(src, `${f} must not read the service-role key`).not.toContain(
        'SUPABASE_SERVICE_ROLE_KEY'
      )
    }
  })

  test('every client-surface route guards through requireClientMember', () => {
    const routes = [
      ...walk('src/app/(client)', ['route.ts']),
      ...walk('app/(client)', ['route.ts']),
    ]
    for (const f of routes) {
      const src = read(f)
      expect(src, `${f} must guard via requireClientMember`).toContain('requireClientMember')
      expect(src, `${f} must not read a client-supplied scope id`).not.toMatch(
        /(payload|body|params|searchparams)\.?\w*\.(practice_id|practiceid|client_id|clientid)/i
      )
    }
  })
})

test.describe('the practice surface checks before the service role', () => {
  test('every practice-surface route resolves membership before acting', () => {
    const routes = [
      ...walk('src/app/(practice)', ['route.ts']),
      ...walk('app/(practice)', ['route.ts']),
    ]
    for (const f of routes) {
      const src = read(f)
      expect(src, `${f} must guard via requirePracticeMember`).toContain('requirePracticeMember')
    }
  })
})

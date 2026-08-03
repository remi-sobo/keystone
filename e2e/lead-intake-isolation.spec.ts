import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { leadIntakeSchema, secretMatches, stagingRow } from '../src/lib/intake'

/**
 * The website lead intake gate (specs/website-to-keystone-lead-intake.md,
 * commit 2). Structural checks over the migration and the route, plus
 * unit coverage of the pure logic in src/lib/intake.ts.
 *
 * What this pins:
 *   1. sales_intake_staging is deny-all, and the isolation matrix carries
 *      the cross-practice and cross-client cases.
 *   2. The scope comes from the environment, never from the request body.
 *   3. The payload cannot express anything except a lead.
 *   4. Rate limiting is spent BEFORE the secret check.
 *   5. The secret comparison is constant-time.
 *   6. The insert is idempotent on the site's own submission id.
 *   7. The route is carved out of the session bounce, so a bearer caller
 *      is not 307'd to /login (the Phase 6 recon finding).
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

const MIGRATION = 'supabase/migrations/0044_sales_intake_staging.sql'
const ROUTE = 'src/app/api/intake/lead/route.ts'

test.describe('the staging table is a wall, not a queue anyone can read', () => {
  test('RLS on with zero policies: deny-all to every session', () => {
    const mig = read(MIGRATION)
    expect(mig).toContain('alter table public.sales_intake_staging enable row level security')
    // Not "no policy for members": no policy at all, on this table.
    const policies = mig.match(/create\s+policy\s+\S+\s+on\s+(?:public\.)?sales_intake_staging/gi)
    expect(policies, 'sales_intake_staging must carry zero policies').toBeNull()
  })

  test('it is registered as deny-all in the coverage ratchet', () => {
    const ratchet = read('e2e/isolation-coverage.spec.ts')
    const list = ratchet.slice(
      ratchet.indexOf('SERVICE_ROLE_ONLY_TABLES'),
      ratchet.indexOf('function readAllMigrations')
    )
    expect(list).toContain('sales_intake_staging')
  })

  test('the matrix proves the wall from every side', () => {
    const seed = read('supabase/tests/isolation-seed.sql')
    expect(seed).toContain('LEAK: a practice owner session reads untriaged inbound')
    expect(seed).toContain('HOLE: a practice owner session wrote a staging row')
    expect(seed).toContain('LEAK: a client member reads untriaged inbound')
    expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a inbound')
    expect(seed).toContain('LEAK: a membershipless session reads untriaged inbound')
    expect(seed).toContain('HOLE: a replayed submission id inserted a second staging row')
  })

  test('the table carries practice_id and no client_id', () => {
    const mig = read(MIGRATION)
    expect(mig).toContain('practice_id             uuid not null references public.practices(id)')
    // There is no client here. An inbound lead is not a client of anyone
    // yet, and pretending otherwise would put it on the wrong wall.
    expect(mig).not.toMatch(/client_id\s+uuid/)
  })
})

test.describe('the scope comes from the environment, never the caller', () => {
  test('the route reads INTAKE_PRACTICE_ID and the payload has no scope field', () => {
    const route = read(ROUTE)
    expect(route).toContain('env.INTAKE_PRACTICE_ID')

    // The schema itself is where a smuggled scope would have to appear.
    // stagingRow of course SETS practice_id; the point is that its value
    // comes from the argument, never from the parsed payload.
    const lib = read('src/lib/intake.ts')
    const schema = lib.slice(
      lib.indexOf('export const leadIntakeSchema'),
      lib.indexOf('export type LeadIntakePayload')
    )
    expect(schema.length).toBeGreaterThan(0)
    for (const scoped of ['practice_id', 'client_id', 'engagement_id']) {
      expect(schema, `the payload must not accept ${scoped}`).not.toContain(scoped)
    }
    expect(lib).toContain('stagingRow(payload: LeadIntakePayload, practiceId: string)')
    expect(lib).toContain('practice_id: practiceId')
  })

  test('an unconfigured intake fails closed with an honest 503', () => {
    const route = read(ROUTE)
    expect(route).toContain("if (!secret || !practiceId)")
    expect(route).toContain("{ status: 503 }")
  })
})

test.describe('the payload can express a lead and nothing else', () => {
  const valid = {
    submission_id: '3f1a9c2e-7b4d-4a19-9c83-2e5f8a1b6d40',
    org_name: 'SafeSpace',
    contact_name: 'A Person',
    email: 'person@example.test',
    audience: 'nonprofit',
    budget_band: 'Under $250K',
  }

  test('it accepts a well-formed lead', () => {
    expect(leadIntakeSchema.safeParse(valid).success).toBe(true)
  })

  test('an unexpected key is rejected, not quietly dropped', () => {
    for (const smuggled of ['practice_id', 'client_id', 'engagement_id', 'role_grant']) {
      const result = leadIntakeSchema.safeParse({ ...valid, [smuggled]: 'x' })
      expect(result.success, `${smuggled} must be rejected`).toBe(false)
    }
  })

  test('org_name is required: without it the collision check cannot run', () => {
    const { org_name, ...without } = valid
    expect(org_name).toBeTruthy()
    expect(leadIntakeSchema.safeParse(without).success).toBe(false)
    expect(leadIntakeSchema.safeParse({ ...valid, org_name: '   ' }).success).toBe(false)
  })

  test('submission_id must be a uuid: it is the idempotency key', () => {
    expect(leadIntakeSchema.safeParse({ ...valid, submission_id: 'not-a-uuid' }).success).toBe(
      false
    )
  })

  test('utm keys are fixed, so nothing arbitrary reaches the jsonb column', () => {
    expect(
      leadIntakeSchema.safeParse({ ...valid, utm: { utm_source: 'newsletter' } }).success
    ).toBe(true)
    expect(leadIntakeSchema.safeParse({ ...valid, utm: { anything: 'goes' } }).success).toBe(false)
  })

  test('stagingRow puts the passed scope on the row and normalizes nothing itself', () => {
    const row = stagingRow(leadIntakeSchema.parse(valid), 'practice-uuid')
    expect(row.practice_id).toBe('practice-uuid')
    expect(row.external_submission_id).toBe(valid.submission_id)
    expect(row.org_name).toBe('SafeSpace')
    // The collision key is a generated column. If the app computed it too,
    // the two could drift.
    expect(Object.keys(row)).not.toContain('org_name_normalized')
  })
})

test.describe('the secret door', () => {
  test('the comparison is constant-time, not ===', () => {
    const lib = read('src/lib/intake.ts')
    expect(lib).toContain('crypto.timingSafeEqual')
    expect(secretMatches('correct-horse', 'correct-horse')).toBe(true)
    expect(secretMatches('correct-horse', 'correct-horsf')).toBe(false)
    expect(secretMatches('correct-horse', 'short')).toBe(false)
    expect(secretMatches('correct-horse', '')).toBe(false)
    expect(secretMatches('correct-horse', null)).toBe(false)
    // An unset secret never matches, so a missing env var cannot open the door.
    expect(secretMatches(undefined, 'anything')).toBe(false)
    expect(secretMatches('', '')).toBe(false)
  })

  test('rate limiting is spent BEFORE the secret check, so guessing is bounded', () => {
    const route = read(ROUTE)
    const limitAt = route.indexOf('enforceRateLimits')
    const secretAt = route.indexOf('secretMatches')
    expect(limitAt).toBeGreaterThan(-1)
    expect(secretAt).toBeGreaterThan(-1)
    expect(limitAt, 'the limit must be spent before the secret is compared').toBeLessThan(secretAt)
  })

  test('the limits exist and are per IP', () => {
    const limits = read('src/lib/rateLimit.ts')
    expect(limits).toContain('INTAKE_LEAD_PER_MIN')
    expect(limits).toContain('INTAKE_LEAD_PER_HOUR')
    expect(limits).toContain("kind: 'intake-lead:ip:min'")
  })

  test('a wrong secret is 401 and an unparseable body is 400', () => {
    const route = read(ROUTE)
    expect(route).toContain("{ status: 401 }")
    expect(route).toContain("'invalid_json'")
    expect(route).toContain("'invalid_payload'")
  })

  test('logs carry field names and status, never payload values', () => {
    const route = read(ROUTE)
    // The rejection log maps issues to their paths, never their input.
    expect(route).toContain("parsed.error.issues.map((i) => i.path.join('.'))")
    for (const leak of ['data.email', 'parsed.data.email', 'payload.message', 'body)']) {
      expect(route, `log must not carry ${leak}`).not.toContain(`console.error('[intake/lead]', ${leak}`)
    }
  })
})

test.describe('idempotency and reachability', () => {
  test('the unique index is the enforcement, scoped by practice', () => {
    const mig = read(MIGRATION)
    expect(mig).toContain('create unique index if not exists sales_intake_staging_external_idx')
    expect(mig).toContain('(practice_id, external_submission_id)')
  })

  test('the route ignores duplicates and answers 200 either way', () => {
    const route = read(ROUTE)
    expect(route).toContain('ignoreDuplicates: true')
    expect(route).toContain("onConflict: 'practice_id,external_submission_id'")
    // Both branches return ok. A replay is success, not an error the
    // site's reconcile job would keep retrying forever.
    expect(route).toContain("ok(created ? 'created' : 'duplicate')")
  })

  test('the route is carved out of the session bounce', () => {
    // The Phase 6 recon finding: without this a bearer caller is 307'd
    // to /login and the forward silently never lands.
    expect(read('src/proxy.ts')).toContain("'/api/intake'")
  })

  test('it runs on the node runtime, since it uses node crypto', () => {
    expect(read(ROUTE)).toContain("export const runtime = 'nodejs'")
  })
})

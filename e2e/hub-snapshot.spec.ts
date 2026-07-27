import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  parseHubMemberIds,
  parseSince,
  qualifiesForHub,
  hubTaskFilterExpression,
  serializeEngagement,
  serializeWorkstream,
  serializeActionItem,
  openProjectIds,
} from '../src/lib/hub'

/**
 * The Life hub snapshot gate (trellis specs/Life-hub-spec 3.3, Phase 6).
 *
 * Two layers, the digest-engine pattern: unit tests of the pure filter
 * and serializers (the filter IS the feature), then source pins on the
 * route and migration so the wall cannot silently regress.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const ROUTE = 'src/app/api/hub/v1/snapshot/route.ts'
const LIB = 'src/lib/hub.ts'
const MIGRATION = 'supabase/migrations/0043_hub_updated_at.sql'

const REMI_A = '45272293-2b93-4993-8513-be295c0dd336'
const REMI_B = 'c81551db-55ed-4154-98d1-6adb0304e8f5'
const KENDRA = '78f1309f-2a32-49da-88a2-77cb9f4c5aaf'
const SHANNON = 'cecd0c62-605f-441d-b4e1-21af47f9beec'
const HUB_IDS = [REMI_A, REMI_B, KENDRA]

// ── 1. The filter ───────────────────────────────────────────────────────────

test.describe('the audience filter (spec 3.3: THE FILTER IS THE FEATURE)', () => {
  test('client homework never qualifies: unassigned or client-member rows', () => {
    // The live shape at recon time: client-audience homework rows with
    // no practice assignee. All of them stay behind the wall.
    for (let i = 0; i < 34; i++) {
      expect(
        qualifiesForHub({ audience: 'client', assigned_practice_member_id: null }, HUB_IDS)
      ).toBe(false)
    }
  })

  test('a row assigned to a practice member who is not a hub member never qualifies', () => {
    expect(
      qualifiesForHub({ audience: 'client', assigned_practice_member_id: SHANNON }, HUB_IDS)
    ).toBe(false)
  })

  test('practice-audience rows qualify', () => {
    expect(
      qualifiesForHub({ audience: 'practice', assigned_practice_member_id: null }, HUB_IDS)
    ).toBe(true)
    expect(
      qualifiesForHub({ audience: 'practice', assigned_practice_member_id: REMI_A }, HUB_IDS)
    ).toBe(true)
  })

  test('a row assigned to a hub member qualifies per the spec OR, regardless of audience', () => {
    // FLAGGED for Remi (Phase 6 summary): one live client-audience row
    // is assigned to Remi himself. The spec filter admits it because it
    // is Remi's own work; it is not SafeSpace staff homework.
    expect(
      qualifiesForHub({ audience: 'client', assigned_practice_member_id: REMI_A }, HUB_IDS)
    ).toBe(true)
    expect(
      qualifiesForHub({ audience: 'client', assigned_practice_member_id: KENDRA }, HUB_IDS)
    ).toBe(true)
  })

  test('with no hub members configured the filter narrows to practice-audience only', () => {
    expect(qualifiesForHub({ audience: 'client', assigned_practice_member_id: REMI_A }, [])).toBe(
      false
    )
    expect(hubTaskFilterExpression([])).toBe('audience.eq.practice')
  })

  test('the SQL expression is the same wall the predicate describes', () => {
    expect(hubTaskFilterExpression(HUB_IDS)).toBe(
      `audience.eq.practice,assigned_practice_member_id.in.(${HUB_IDS.join(',')})`
    )
  })
})

test.describe('HUB_MEMBER_IDS parsing', () => {
  test('only uuid-shaped entries survive, so the or() embed stays inert', () => {
    expect(parseHubMemberIds(`${REMI_A}, ${KENDRA}`)).toEqual([REMI_A, KENDRA])
    expect(parseHubMemberIds(`${REMI_A},audience.eq.client`)).toEqual([REMI_A])
    expect(parseHubMemberIds('not-a-uuid,)or(')).toEqual([])
    expect(parseHubMemberIds(undefined)).toEqual([])
    expect(parseHubMemberIds('')).toEqual([])
  })
})

test.describe('the since cursor', () => {
  test('absent means full snapshot; garbage is rejected; valid input normalizes', () => {
    expect(parseSince(null)).toEqual({ ok: true, value: null })
    expect(parseSince('')).toEqual({ ok: true, value: null })
    expect(parseSince('nonsense')).toEqual({ ok: false })
    expect(parseSince('2026-07-27T10:00:00Z')).toEqual({
      ok: true,
      value: '2026-07-27T10:00:00.000Z',
    })
  })
})

// ── 2. Serialization and the open-id sets ───────────────────────────────────

const ENG = {
  id: 'e1',
  title: 'Systems and leaders',
  status: 'active',
  owner_practice_member_id: REMI_A,
  updated_at: '2026-07-27T00:00:00Z',
  client_name: 'SafeSpace',
}
const WS = {
  id: 'w1',
  engagement_id: 'e1',
  title: 'Fundraising system',
  stage: 'build',
  owner_practice_member_id: null,
  updated_at: '2026-07-27T00:00:00Z',
  client_name: 'SafeSpace',
}

test.describe('serialization', () => {
  test('engagements and workstreams become projects with prefixed external ids', () => {
    const e = serializeEngagement(ENG)
    expect(e.external_id).toBe('eng:e1')
    expect(e.kind).toBe('engagement')
    expect(e.engagement_external_id).toBeNull()
    const w = serializeWorkstream(WS)
    expect(w.external_id).toBe('ws:w1')
    expect(w.kind).toBe('workstream')
    expect(w.engagement_external_id).toBe('eng:e1')
    expect(w.status).toBe('build')
  })

  test('a task parents to its workstream when set, else its engagement', () => {
    const base = {
      id: 'a1',
      title: 'Wire the invite flow',
      status: 'open',
      due_on: '2026-07-14',
      audience: 'practice',
      assigned_practice_member_id: REMI_A,
      engagement_id: 'e1',
      body_md: null,
      updated_at: '2026-07-27T00:00:00Z',
    }
    expect(serializeActionItem({ ...base, workstream_id: 'w1' }).project_external_id).toBe('ws:w1')
    expect(serializeActionItem({ ...base, workstream_id: null }).project_external_id).toBe('eng:e1')
  })

  test('open ids exclude done engagements, done-stage workstreams', () => {
    const ids = openProjectIds(
      [
        { id: 'e1', status: 'active' },
        { id: 'e2', status: 'done' },
      ],
      [
        { id: 'w1', stage: 'build' },
        { id: 'w2', stage: 'done' },
      ]
    )
    expect(ids).toEqual(['eng:e1', 'ws:w1'])
  })
})

// ── 3. Source pins ──────────────────────────────────────────────────────────

test.describe('the route stays inside its wall', () => {
  const src = read(ROUTE)

  test('rate limit runs before the bearer check, which fails closed', () => {
    const limitAt = src.indexOf('enforceRateLimits')
    const secretAt = src.indexOf('HUB_SECRET_KEYSTONE')
    expect(limitAt).toBeGreaterThan(-1)
    expect(secretAt).toBeGreaterThan(limitAt)
    expect(src).toContain("status: 503")
    expect(src).toContain("status: 401")
    expect(src).toContain('Bearer ${secret}')
  })

  test('the audience filter rides every action_items query', () => {
    const aiQueries = src.split("from('action_items')").length - 1
    const orFilters = src.split('.or(taskFilter)').length - 1
    expect(aiQueries).toBeGreaterThan(0)
    expect(orFilters).toBe(aiQueries)
  })

  test('every table read is practice-scoped and read-only', () => {
    const reads = src.split(".from('").length - 1
    const scoped = src.split(".in('practice_id', practiceIds)").length - 1
    // every query except the practice_members resolve carries the scope
    expect(scoped).toBe(reads - 1)
    expect(src).not.toContain('.insert(')
    expect(src).not.toContain('.update(')
    expect(src).not.toContain('.delete(')
  })

  test('revoked members cannot anchor the scope', () => {
    expect(src).toContain(".is('revoked_at', null)")
  })

  test('the proxy carves the machine path out of the session bounce', () => {
    const proxy = read('src/proxy.ts')
    expect(proxy).toContain("'/api/hub'")
    expect(proxy).toContain('isMachine')
  })

  test('the pure module has no IO', () => {
    const lib = read(LIB)
    expect(lib).not.toMatch(/from ['"]@\/lib\/supabase/)
    expect(lib).not.toContain('fetch(')
  })
})

test.describe('the 3.1.3 migration', () => {
  const sql = read(MIGRATION)

  test('all three tables get updated_at and the touch trigger', () => {
    for (const t of ['action_items', 'engagements', 'workstreams']) {
      expect(sql).toContain(`alter table public.${t}\n  add column if not exists updated_at`)
      expect(sql).toContain(`create trigger ${t}_touch_updated_at`)
      expect(sql).toContain(`before update on public.${t}`)
    }
    expect(sql).toContain('create or replace function private.touch_updated_at()')
  })
})

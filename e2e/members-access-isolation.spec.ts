import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 1A: members and access (specs/keystone-v2-admin-ui.md). Pins the
 * revocation shapes in migration 0009 the same static way the spine
 * spec pins 0001. The live half is the revocation block at the end of
 * supabase/tests/isolation-seed.sql: a revoked practice_members or
 * client_members row reads zero rows everywhere, cannot write, and a
 * revoked pending invite cannot be claimed (cross-practice and
 * cross-client walls stay closed after the predicate rewrite).
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const sql = norm(read('supabase/migrations/0009_v2_1a_members_access.sql'))

test.describe('the soft-revocation columns', () => {
  test('both membership tables gain the four columns, no new tables', () => {
    for (const t of ['practice_members', 'client_members']) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${t} ` +
            `add column if not exists revoked_at timestamptz, ` +
            `add column if not exists revoked_by uuid[^;]*, ` +
            `add column if not exists invited_by uuid[^;]*, ` +
            `add column if not exists last_invite_sent_at timestamptz`
        )
      )
    }
    expect(sql).not.toContain('create table')
  })
})

test.describe('every membership predicate carries the revoked filter', () => {
  const PREDICATES = [
    'private.is_practice_member',
    'private.is_member_of_client',
    'private.is_client_member_of_practice',
    'private.owns_client_membership',
    'public.keystone_claim_membership',
    'public.keystone_message_notify_targets',
  ]

  test('each re-created function filters on revoked_at is null', () => {
    for (const fn of PREDICATES) {
      const at = sql.indexOf(`create or replace function ${fn}`)
      expect(at, `${fn} must be re-created in 0009`).toBeGreaterThan(-1)
      const body = sql.slice(at, sql.indexOf('$$;', at))
      expect(body.includes('revoked_at is null'), `${fn} must filter revoked rows`).toBe(true)
    }
  })

  test('keystone_can filters revoked rows on BOTH membership arms', () => {
    const at = sql.indexOf('create or replace function private.keystone_can')
    expect(at).toBeGreaterThan(-1)
    const body = sql.slice(at, sql.indexOf('$$;', at))
    expect(body).toContain('m.revoked_at is null')
    expect(body).toContain('cm.revoked_at is null')
  })

  test('the claim skips revoked pending rows on both tables', () => {
    const at = sql.indexOf('create or replace function public.keystone_claim_membership')
    const body = sql.slice(at, sql.indexOf('$$;', at))
    const claims = body.match(/where user_id is null and revoked_at is null/g) || []
    expect(claims.length, 'both claim updates must skip revoked rows').toBe(2)
  })
})

test.describe('the invite model stays email-keyed', () => {
  test('no bearer-token invite scheme enters with 0009', () => {
    expect(sql).not.toMatch(/invite_token|bearer|access_token/)
  })

  test('every re-created function keeps SECURITY DEFINER and the pinned search_path', () => {
    const defs = sql.match(/create or replace function [^$]*?as \$\$/g) || []
    expect(defs.length).toBeGreaterThanOrEqual(7)
    for (const d of defs) {
      expect(d, 'function must be security definer').toContain('security definer')
      expect(d, 'function must pin search_path').toContain("set search_path = ''")
    }
  })
})

test.describe('the live matrix covers revocation', () => {
  const seed = read('supabase/tests/isolation-seed.sql')

  test('the seed asserts revoked reads, the write wall, claim denial, and reactivation', () => {
    expect(seed).toContain('LEAK: revoked consultant reads engagements')
    expect(seed).toContain('LEAK: revoked client member reads action items')
    expect(seed).toContain('HOLE: a revoked consultant wrote a stage event')
    expect(seed).toContain('HOLE: a revoked pending invite was claimed')
    expect(seed).toContain('reactivated consultant visibility wrong')
    expect(seed).toContain('LEAK: revoked client member enumerates notify targets')
  })
})

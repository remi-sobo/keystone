import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Ring 1: the spine's cross-practice and cross-client isolation, pinned
 * in the migration SQL (the Pathway static style). The live half of the
 * story is supabase/tests/isolation-seed.sql, run against a throwaway
 * Postgres by scripts/test-rls.sh in CI (rls-test.yml); this spec pins
 * the policy SHAPES so a regression is caught even before the live run.
 *
 * Covered tables (the enumeration ratchet reads these names):
 * practice_members, clients, client_members, engagements, workstreams,
 * workstream_stage_events, and the service-role-only ai_spend_ledger,
 * voice_violations, audit_log, rate_limit_hits.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const MIGRATION = 'supabase/migrations/0001_keystone_spine.sql'
const sql = norm(read(MIGRATION))

test.describe('RLS is enabled on every spine table', () => {
  test('all scoped tables enable row level security', () => {
    for (const t of [
      'practices',
      'practice_members',
      'clients',
      'client_members',
      'engagements',
      'workstreams',
      'workstream_stage_events',
      'role_permissions',
      'ai_spend_ledger',
      'voice_violations',
      'audit_log',
      'rate_limit_hits',
    ]) {
      expect(
        sql.includes(`alter table public.${t} enable row level security`),
        `${t} must enable RLS`
      ).toBe(true)
    }
  })
})

test.describe('the read policies carry BOTH scope dimensions', () => {
  test('engagements: practice membership OR own-client membership, never practice-wide for a client member', () => {
    expect(sql).toMatch(
      /create policy engagements_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
  })

  test('workstreams and stage events: the same two-dimension shape on the denormalized columns', () => {
    expect(sql).toMatch(
      /create policy workstreams_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
    expect(sql).toMatch(
      /create policy stage_events_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
  })

  test('clients: a client member sees their own client row only', () => {
    expect(sql).toMatch(
      /create policy clients_read[^;]*is_member_of_client\(id\)/
    )
  })

  test('client_members: rosters are scoped to the member own client', () => {
    expect(sql).toMatch(
      /create policy client_members_read[^;]*is_member_of_client\(client_id\)/
    )
  })

  test('practice_members: readable by practice members and the row owner only', () => {
    expect(sql).toMatch(
      /create policy practice_members_read[^;]*is_practice_member\(practice_id\)[^;]*user_id = auth\.uid\(\)/
    )
  })
})

test.describe('the permission authority', () => {
  test('keystone_can is SECURITY DEFINER with a pinned search_path', () => {
    expect(sql).toMatch(
      /function private\.keystone_can\(p_practice uuid, p_client uuid, p_perm text\)[^$]*security definer[^$]*set search_path = ''/
    )
  })

  test('the client-member path in keystone_can requires the client dimension', () => {
    // A client member's permission never applies practice-wide: the
    // predicate demands p_client match their own client_id.
    expect(sql).toMatch(
      /p_client is not null and cm\.client_id = p_client/
    )
  })

  test('writes go through keystone_can, and client_member holds no write permission', () => {
    expect(sql).toMatch(/engagements_write[^;]*keystone_can\(practice_id, client_id, 'engagement\.write'\)/)
    expect(sql).toMatch(/workstreams_write[^;]*keystone_can\(practice_id, client_id, 'engagement\.write'\)/)
    // The seeded permission map grants client_member exactly one
    // permission: engagement.read.
    expect(sql).toMatch(/\('client_member', 'engagement\.read'\)/)
    expect(sql).not.toMatch(/\('client_member', 'engagement\.write'\)/)
    expect(sql).not.toMatch(/\('client_member', 'members\.manage'\)/)
    expect(sql).not.toMatch(/\('client_member', 'practice\.manage'\)/)
  })

  test('every helper is revoked from anon and granted to authenticated only', () => {
    for (const fn of [
      'is_practice_member\\(uuid\\)',
      'is_member_of_client\\(uuid\\)',
      'is_client_member_of_practice\\(uuid\\)',
      'keystone_can\\(uuid, uuid, text\\)',
    ]) {
      expect(sql).toMatch(new RegExp(`revoke all on function private\\.${fn} from public, anon`))
    }
  })
})

test.describe('the email-keyed claim (no bearer invites)', () => {
  test('claim is keyed on the verified JWT email and pending rows only', () => {
    expect(sql).toContain('create or replace function public.keystone_claim_membership()')
    expect(sql).toMatch(/where user_id is null and lower\(email\) = lower\(nullif\(auth\.jwt\(\) ->> 'email', ''\)\)/)
    expect(sql).toContain('revoke all on function public.keystone_claim_membership() from public, anon')
  })

  test('no bearer-token invite scheme exists', () => {
    expect(sql).not.toMatch(/invite_token|bearer|access_token/)
  })
})

test.describe('service-role-only tables carry zero policies', () => {
  test('ai_spend_ledger, voice_violations, audit_log, rate_limit_hits are deny-all to sessions', () => {
    for (const t of ['ai_spend_ledger', 'voice_violations', 'audit_log', 'rate_limit_hits']) {
      expect(
        new RegExp(`create policy [a-z0-9_"]* on (public\\.)?${t}\\b`).test(sql),
        `${t} must have NO policies (RLS on, service role only)`
      ).toBe(false)
    }
  })

  test('role_permissions is the documented global reference exception', () => {
    // SELECT to authenticated, no write policy: only migrations seed it.
    expect(sql).toMatch(/create policy role_permissions_read on public\.role_permissions for select to authenticated using \(true\)/)
    expect(sql).not.toMatch(/create policy role_permissions_(write|insert|update|delete)/)
  })
})

test.describe('the denormalized scope columns exist', () => {
  test('workstreams and stage events carry practice_id AND client_id', () => {
    expect(sql).toMatch(/create table if not exists public\.workstreams \([^;]*practice_id[^;]*client_id/)
    expect(sql).toMatch(/create table if not exists public\.workstream_stage_events \([^;]*practice_id[^;]*client_id/)
  })
})

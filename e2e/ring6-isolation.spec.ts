import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Ring 6 isolation: digests and the cron path. Static policy pinning;
 * the live half runs in the seeded matrix. The enumeration ratchet
 * reads the table name here.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const sql = norm(read('supabase/migrations/0008_ring6_digest.sql'))

test.describe('digests carries the wall', () => {
  test('RLS on, practice-only read, no client read', () => {
    expect(sql).toContain('alter table public.digests enable row level security')
    expect(sql).toMatch(/create policy digests_read[^;]*is_practice_member\(practice_id\)/)
    expect(sql).not.toMatch(/create policy digests_read[^;]*is_member_of_client/)
  })

  test('no session writes: the approve action is the only path in', () => {
    expect(sql).not.toMatch(/create policy [a-z0-9_]+ on public\.digests for (insert|update|delete)/)
  })

  test('one digest per engagement per week', () => {
    expect(sql).toMatch(/unique \(engagement_id, week_of\)/)
  })
})

test.describe('the cron route is a locked door', () => {
  const src = read('src/app/api/digest/route.ts')

  test('fail-closed on a missing CRON_SECRET, 401 on a wrong one', () => {
    expect(src).toContain('env.CRON_SECRET')
    expect(src).toMatch(/if \(!secret\)[\s\S]{0,200}503/)
    expect(src).toMatch(/authorization[\s\S]{0,120}Bearer \$\{secret\}/)
    expect(src).toContain('status: 401')
  })

  test('drafts ride the one AI chokepoint into an inert proposal row', () => {
    expect(src).toContain('callClaudeChecked')
    expect(src).toContain('AiBudgetExceededError')
    expect(src).toContain('AI_DIGEST_PER_HOUR')
    expect(src).toMatch(/from\('ai_proposals'\)\.insert/)
    // The cron never writes live tables and never sends email.
    expect(src).not.toMatch(/from\('digests'\)\s*\.(insert|update|upsert)/)
    expect(src).not.toContain('sendEmail')
    // Voice gate at the boundary.
    expect(src).toContain('validateVoice')
  })

  test('the empty week is refused in code, before any model call', () => {
    expect(src).toContain('hasDigestContent')
    const refuseAt = src.indexOf('hasDigestContent(facts)')
    const callAt = src.indexOf('await callClaudeChecked')
    expect(refuseAt).toBeGreaterThan(-1)
    expect(callAt).toBeGreaterThan(-1)
    expect(refuseAt).toBeLessThan(callAt)
  })

  test('the cron schedule is wired in vercel.json', () => {
    const vercel = JSON.parse(read('vercel.json'))
    const cron = (vercel.crons ?? []).find((c: { path: string }) => c.path === '/api/digest')
    expect(cron).toBeTruthy()
  })
})

test.describe('the approve action is the single human path', () => {
  const src = read('src/app/(practice)/today/actions.ts')

  test('membership-checked, proposal-scoped, honest about failed sends', () => {
    expect(src).toContain("eq('practice_id', practiceId)")
    expect(src).toContain("eq('status', 'proposed')")
    expect(src).toContain("eq('kind', 'digest')")
    // A digest never claims 'sent' unless every recipient send succeeded.
    expect(src).toContain('digest_no_email')
    expect(src).toMatch(/if \(allSent\)[\s\S]{0,200}status: 'sent'/)
    expect(src).toContain('logAuditAction')
  })
})

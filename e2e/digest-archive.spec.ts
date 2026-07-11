import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 3G (specs/keystone-v2-digest-archive.md): the digest archive, the
 * last epic of Phase 3. Pins the 0024 shape (the sent-only client
 * read, the cadence column, the digest anchor value), the cron's
 * cadence-before-model contract, and the live matrix assertions.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0024_v2_digest_archive.sql'))
const seed = read('supabase/tests/isolation-seed.sql')
const cron = read('src/app/api/digest/route.ts')

test('0024: the client reads sent digests only; cadence is constrained; digest anchors join', () => {
  expect(mig).toContain(
    "using (status = 'sent' and private.is_member_of_client(client_id))"
  )
  expect(mig).toContain("check (digest_cadence in ('weekly','biweekly','off'))")
  expect(mig).toMatch(/messages_anchor_type_check[\s\S]*?'digest'/)
  // Still zero session writes on digests.
  expect(mig).not.toMatch(/create policy \S+ on public\.digests\s+for (insert|update|delete)/)
})

test('the cron checks cadence BEFORE any model call', () => {
  const loopStart = cron.indexOf('for (const e of engagements')
  const modelCall = cron.indexOf('callClaudeChecked', loopStart)
  const cadenceCheck = cron.indexOf("digest_cadence === 'off'", loopStart)
  expect(cadenceCheck).toBeGreaterThan(loopStart)
  expect(cadenceCheck).toBeLessThan(modelCall)
  expect(cron).toContain("digest_cadence === 'biweekly'")
  expect(cron).toContain('skipped_cadence')
})

test('the digest anchor resolves engagement-scoped with a server-derived label', () => {
  const lib = read('src/lib/messageAnchors.ts')
  expect(lib).toContain("'digest',")
  expect(lib).toMatch(/from\('digests'\)[\s\S]{0,200}eq\('engagement_id', engagementId\)/)
  expect(lib).toContain('the digest for the week of')
})

test('the live matrix asserts the sent-only wall from every direction', () => {
  expect(seed).toContain('member_a1 must read exactly the SENT digest')
  expect(seed).toContain('LEAK 3G: a client member reads an approved-but-unsent digest')
  expect(seed).toContain('HOLE 3G: a session rewrote a digest')
  expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 digests')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a digests')
  expect(seed).toContain('the practice must read all its digests, sent and approved')
})

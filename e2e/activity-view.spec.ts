import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 activity view (specs/keystone-v2-activity.md): the per-engagement
 * trail over the audit log. The gate pins the walls: 0027 adds scope
 * columns and NOTHING else (the table stays deny-all), the engagement
 * callers stamp scope, the fold renders action/when/who and never
 * detail payloads, and the client surface never touches lib/audit.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('0027 adds scope columns with no FKs, no policies, no grants', () => {
  const mig = read('supabase/migrations/0027_v2_audit_scope.sql')
  expect(mig).toContain('add column if not exists practice_id uuid')
  expect(mig).toContain('add column if not exists engagement_id uuid')
  // No foreign keys: audit rows outlive their subjects.
  expect(mig).not.toContain('references')
  // Deny-all stands: no policy ever existed and none arrives now.
  expect(mig).not.toContain('create policy')
  expect(mig).not.toMatch(/\bgrant\b/i)
})

test('the engagement-scoped callers stamp scope on every audit row', () => {
  for (const f of [
    'src/app/(practice)/engagements/[id]/actions.ts',
    'src/app/(practice)/sessions/[id]/actions.ts',
    'src/app/(practice)/engagements/[id]/charter/actions.ts',
  ]) {
    const body = read(f)
    const calls = body.match(/logAuditAction\(\{/g)?.length ?? 0
    const stamps = body.match(/^\s*engagementId: /gm)?.length ?? 0
    expect(stamps, `${f}: every logAuditAction stamps engagementId`).toBeGreaterThanOrEqual(calls)
  }
})

test('the fold renders action, when, who; never detail payloads', () => {
  const page = read('src/app/(practice)/engagements/[id]/page.tsx')
  expect(page).toContain('listEngagementAudit')
  const fold = page.slice(page.indexOf('Activity ('), page.indexOf('</RoomShell>'))
  expect(fold).toContain('a.action')
  expect(fold).toContain('a.actor_email')
  expect(fold).not.toContain('a.detail')
  expect(fold).not.toContain('a.target')
})

test('the client surface never imports the audit lib', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name)
      return d.isDirectory() ? walk(p) : [p]
    })
  for (const f of walk(path.join(process.cwd(), 'src/app/(client)'))) {
    expect(fs.readFileSync(f, 'utf-8'), `${f} must not import lib/audit`).not.toContain('lib/audit')
  }
})

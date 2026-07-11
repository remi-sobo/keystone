import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 4F (specs/keystone-v2-notifications.md): the notifications layer.
 * Pins the 0020 shape (the recipient wall on notifications and
 * notification_prefs, the read_at column grant, zero session
 * insert/delete), the cron's contract (secret-gated, batched, honoring
 * the mute), and the live matrix's assertions.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0020_v2_notifications.sql'))
const seed = read('supabase/tests/isolation-seed.sql')
const cron = read('src/app/api/notify/route.ts')

test('0020: the recipient wall, not a membership read', () => {
  const readPolicy = mig.slice(
    mig.indexOf('create policy notifications_read'),
    mig.indexOf('create policy notifications_mark_read')
  )
  expect(readPolicy).toContain('owns_client_membership(recipient_client_member_id)')
  expect(readPolicy).toContain('owns_practice_membership(recipient_practice_member_id)')
  // The one predicate that would hand your inbox to the whole roster.
  expect(readPolicy).not.toContain('is_member_of_client')
})

test('0020: sessions mark read and nothing else; the chokepoint is the only writer', () => {
  expect(mig).toContain('revoke update on public.notifications from authenticated')
  expect(mig).toContain('grant update (read_at) on public.notifications to authenticated')
  expect(mig).not.toMatch(/create policy \S+ on public\.notifications\s+for insert/)
  expect(mig).not.toMatch(/create policy \S+ on public\.notifications\s+for delete/)
  // Exactly one recipient per row; reminders are idempotent.
  expect(mig).toContain('num_nonnulls(recipient_client_member_id, recipient_practice_member_id) = 1')
  expect(mig).toContain('dedupe_key text unique')
})

test('0020: prefs are yours alone, with the mute as the only knob', () => {
  expect(mig).toMatch(/notification_prefs_insert[\s\S]*?owns_client_membership\(client_member_id\)/)
  expect(mig).toMatch(/notification_prefs_insert[\s\S]*?owns_practice_membership\(practice_member_id\)/)
  expect(mig).toContain("check (email_mode in ('batched','off'))")
  expect(mig).not.toMatch(/create policy \S+ on public\.notification_prefs\s+for delete/)
})

test('the cron fails closed, batches one email per recipient, and honors the mute', () => {
  expect(cron).toContain('CRON_SECRET')
  expect(cron).toContain("status: 503")
  expect(cron).toContain("status: 401")
  // The mute and the batch contract.
  expect(cron).toContain("email_mode")
  expect(cron).toContain("'batched') === 'off'")
  expect(cron).toMatch(/dedupeKey: `\$\{kind\}:\$\{it\.id\}`/)
  // A failed send is retried tomorrow, never falsely stamped.
  expect(cron).toContain('Not stamped')
})

test('the live matrix asserts the recipient wall from every direction', () => {
  expect(seed).toContain("LEAK 4F: a teammate reads another member''s notifications")
  expect(seed).toContain('the recipient wall must cut both ways (owner reads only their own row)')
  expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 notifications')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a notifications')
  expect(seed).toContain('HOLE: a session rewrote a notification title')
  expect(seed).toContain('HOLE: a session inserted a notification')
  expect(seed).toContain('HOLE: a session deleted a notification')
  expect(seed).toContain("LEAK: a member set a teammate''s notification pref")
})

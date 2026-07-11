import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 4I (specs/keystone-v2-scheduling-upgrade.md): the scheduling
 * upgrade. Pins the 0026 shape (scheduling_settings both sides read and
 * practice writes; scheduling_blackouts practice-only; calendar_busy
 * deny-all like the token store; the bridge function unioning all three
 * busy sources behind the same membership check) and the live matrix's
 * assertions.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0026_v2_scheduling_upgrade.sql'))
const seed = read('supabase/tests/isolation-seed.sql')

test('0026: three scoped tables, every one behind RLS', () => {
  for (const t of ['scheduling_settings', 'scheduling_blackouts', 'calendar_busy']) {
    expect(mig).toMatch(
      new RegExp(`create table if not exists public\\.${t}[\\s\\S]*?practice_id\\s+uuid not null`)
    )
    expect(mig).toContain(`alter table public.${t} enable row level security`)
  }
  // One settings row per practice; boundaries bounded by checks.
  expect(mig).toMatch(/scheduling_settings[\s\S]*?practice_id\s+uuid not null unique/)
  expect(mig).toContain('check (buffer_min between 0 and 120)')
})

test('0026: settings read by both sides, written by the practice, never deleted', () => {
  expect(mig).toMatch(
    /scheduling_settings_read[\s\S]*?is_practice_member\(practice_id\)\s+or private\.is_client_member_of_practice\(practice_id\)/
  )
  expect(mig).toMatch(/scheduling_settings_insert[\s\S]*?keystone_can/)
  expect(mig).toMatch(/scheduling_settings_update[\s\S]*?keystone_can/)
  expect(mig).not.toMatch(/create policy \S+ on public\.scheduling_settings\s+for delete/)
})

test('0026: blackouts are practice-only rows (gate 4I-5)', () => {
  expect(mig).toMatch(/scheduling_blackouts_read[\s\S]*?is_practice_member\(practice_id\)/)
  // The read policy never widens to client members.
  expect(mig).not.toMatch(/scheduling_blackouts_read[\s\S]{0,200}?is_client_member_of_practice/)
  expect(mig).toMatch(/scheduling_blackouts_insert[\s\S]*?keystone_can/)
  expect(mig).toMatch(/scheduling_blackouts_delete[\s\S]*?keystone_can/)
  expect(mig).not.toMatch(/create policy \S+ on public\.scheduling_blackouts\s+for update/)
})

test('0026: calendar_busy is deny-all; the bridge is the only read', () => {
  // RLS on, zero policies: no create policy statement names the table.
  expect(mig).not.toMatch(/create policy \S+ on public\.calendar_busy/)
  // The widened bridge unions all three sources, keeps the bare shape,
  // the membership check, and the 60 day cap.
  expect(mig).toMatch(
    /keystone_busy_intervals[\s\S]*?from public\.sessions[\s\S]*?union all[\s\S]*?from public\.calendar_busy[\s\S]*?union all[\s\S]*?from public\.scheduling_blackouts/
  )
  expect(mig).toMatch(/keystone_busy_intervals[\s\S]*?security definer/)
  expect(mig).toMatch(/keystone_busy_intervals[\s\S]*?interval '60 days'/)
  expect(mig).toMatch(
    /keystone_busy_intervals[\s\S]*?is_practice_member\(p_practice\)\s+or private\.is_client_member_of_practice\(p_practice\)/
  )
})

test('the live matrix asserts every wall of the upgrade', () => {
  expect(seed).toContain('owner_a must read their scheduling settings')
  expect(seed).toContain('member_a1 must read the practice scheduling settings')
  expect(seed).toContain('LEAK: a client member reads blackout rows (gate 4I-5)')
  expect(seed).toContain('LEAK: a client member reads calendar_busy')
  expect(seed).toContain('LEAK: session reads calendar_busy (the real calendar is deny-all)')
  expect(seed).toContain('LEAK: a client member edited scheduling settings')
  expect(seed).toContain('LEAK: a client member inserted scheduling settings')
  expect(seed).toContain('LEAK: a client member created a blackout')
  expect(seed).toContain('LEAK: a client member deleted a blackout')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a scheduling settings')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a blackouts')
  expect(seed).toContain('LEAK cross-practice: the bridge handed practice_a busy time to owner_b')
  expect(seed).toContain('the bridge must union sessions, calendar busy, and blackouts')
  expect(seed).toContain('the bridge must hand the client the anonymous busy list')
})

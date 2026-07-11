import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { readinessFacts } from '../src/lib/readinessFacts'

/**
 * V2 4D (specs/keystone-v2-readiness.md): readiness evidence. Pins the
 * 0025 shape (the lens wall: practice-only read; no update policy),
 * the matrix cases including the same-client zero-read, and the
 * execution facts lib: history in prose, never a grade.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0025_v2_readiness_evidence.sql'))
const seed = read('supabase/tests/isolation-seed.sql')

const NOW = Date.parse('2026-07-11T12:00:00Z')

test('0025: the lens wall, both scope columns, no update policy', () => {
  expect(mig).toMatch(
    /create table if not exists public\.readiness_evidence[\s\S]*?practice_id\s+uuid not null[\s\S]*?client_id\s+uuid not null/
  )
  const readPolicy = mig.slice(
    mig.indexOf('create policy readiness_evidence_read'),
    mig.indexOf('create policy readiness_evidence_insert')
  )
  expect(readPolicy).toContain('is_practice_member(practice_id)')
  expect(readPolicy).not.toContain('is_member_of_client')
  expect(mig).not.toMatch(/create policy \S+ on public\.readiness_evidence\s+for update/)
  expect(mig).toContain("check (pillar in ('philosophy','system','execution'))")
  expect(mig).toContain("check (kind in ('session','action_item','decision','deliverable'))")
})

test('the live matrix asserts the lens wall from every direction', () => {
  expect(seed).toContain('LEAK 4D: a client member reads readiness evidence (the lens wall)')
  expect(seed).toContain('LEAK 4D: a client member linked readiness evidence')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a readiness evidence')
  expect(seed).toContain('HOLE 4D: an evidence link was edited (removed, never edited)')
  expect(seed).toContain('the practice must be able to remove a mistaken evidence link')
})

test('execution facts: history in prose, never a grade', () => {
  const lines = readinessFacts({
    now: NOW,
    windowDays: 30,
    sessions: [
      { startsAt: '2026-07-01T17:00:00Z', status: 'held' },
      { startsAt: '2026-07-08T17:00:00Z', status: 'booked' },
      { startsAt: '2026-08-01T17:00:00Z', status: 'booked' },
      { startsAt: '2026-05-01T17:00:00Z', status: 'held' },
    ],
    items: [
      { status: 'done', dueOn: '2026-07-05', doneAt: '2026-07-04T10:00:00Z' },
      { status: 'done', dueOn: '2026-07-05', doneAt: '2026-07-07T10:00:00Z' },
      { status: 'done', dueOn: null, doneAt: '2026-07-06T10:00:00Z' },
      { status: 'open', dueOn: '2026-07-20', doneAt: null },
    ],
    trail: [
      { kind: 'submission', createdAt: '2026-07-03T10:00:00Z' },
      { kind: 'comment', createdAt: '2026-07-03T11:00:00Z' },
    ],
  })
  expect(lines).toEqual([
    '2 sessions held in the last 30 days',
    '1 of 2 homework items done on time',
    '1 review submission',
  ])
  for (const line of lines) {
    expect(line).not.toMatch(/%|grade|score/i)
  }
})

test('a quiet month says so without shame', () => {
  const lines = readinessFacts({ now: NOW, windowDays: 30, sessions: [], items: [], trail: [] })
  expect(lines).toEqual(['No sessions held in the last 30 days'])
})

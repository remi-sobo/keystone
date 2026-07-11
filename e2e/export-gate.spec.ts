import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  safeName,
  dedupePath,
  renderCharter,
  renderDecisions,
  renderHomework,
  renderMessages,
  renderReadme,
  EXPORT_BYTE_CEILING,
} from '../src/lib/exportRecord'

/**
 * V2 5B, engagement export and portability
 * (specs/keystone-v2-portability.md). The pure renderers unit-tested,
 * and the two laws pinned statically: the archive is assembled on the
 * caller's session with every query filtered to the SHARED shape, and
 * the standing exclusions (transcripts, proposals, readiness, Q&A
 * exchanges) never enter the assembly at all.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const LIB = 'src/lib/exportRecord.ts'
const CLIENT_ROUTE = 'src/app/(client)/export/route.ts'
const PRACTICE_ROUTE = 'src/app/(practice)/engagements/[id]/export/route.ts'

// The pure helpers.

test('safeName produces a filesystem-safe fragment and never an empty one', () => {
  expect(safeName('SafeSpace Center, Inc.')).toBe('safespace-center-inc')
  expect(safeName('___')).toBe('item')
  expect(safeName('!!!', 'client')).toBe('client')
})

test('dedupePath keeps every colliding file, numbered honestly', () => {
  const taken = new Set<string>()
  expect(dedupePath('deliverables/plan.pdf', taken)).toBe('deliverables/plan.pdf')
  expect(dedupePath('deliverables/plan.pdf', taken)).toBe('deliverables/plan-2.pdf')
  expect(dedupePath('deliverables/plan.pdf', taken)).toBe('deliverables/plan-3.pdf')
})

test('the charter renders every version with superseded history marked', () => {
  const md = renderCharter([
    { version: 2, body_md: '## Why\nThe next ten years.', status: 'published', published_at: '2026-07-12T00:00:00Z' },
    { version: 1, body_md: 'The first cut.', status: 'superseded', published_at: '2026-07-10T00:00:00Z' },
  ])
  expect(md).toContain('Version 2, published 2026-07-12')
  expect(md).toContain('Version 1 (superseded)')
  expect(md).toContain('The next ten years.')
})

test('a superseded decision is marked, and attribution renders in prose', () => {
  const md = renderDecisions([
    { id: 'a', decided_on: '2026-07-07', title: 'Fundraising first', context_md: null, decided_by_label: 'Remi and Susan', revisit_on: null, supersedes: null },
    { id: 'b', decided_on: '2026-07-11', title: 'Ownership refined', context_md: 'Per the agreement.', decided_by_label: null, revisit_on: null, supersedes: 'a' },
  ])
  expect(md).toContain('Fundraising first (superseded)')
  expect(md).toContain('Decided by Remi and Susan.')
  expect(md).toContain('Per the agreement.')
})

test('homework threads render for the client side and never for the practice side', () => {
  const items = [
    { id: 'h1', title: 'Map the top ten donors', body_md: null, status: 'open', due_on: '2026-07-20', done_at: null, review_requested: true },
  ]
  const activity = [
    { action_item_id: 'h1', kind: 'submission', body_md: 'Done, list attached.', link_url: null, created_at: '2026-07-18T10:00:00Z', by: 'client' as const },
    { action_item_id: 'h1', kind: 'send_back', body_md: 'Add giving history.', link_url: null, created_at: '2026-07-19T10:00:00Z', by: 'practice' as const },
  ]
  const clientMd = renderHomework(items, activity, { side: 'client', practiceName: 'Sobo Consulting' })
  expect(clientMd).toContain('You submitted')
  expect(clientMd).toContain('Sobo Consulting sent it back with a note')
  const practiceMd = renderHomework(items, activity, { side: 'practice', practiceName: 'Sobo Consulting' })
  expect(practiceMd).not.toContain('submitted')
  expect(practiceMd).not.toContain('Add giving history')
})

test('messages carry the side names, dates, and anchors in plain words', () => {
  const md = renderMessages(
    [
      { created_at: '2026-07-14T09:00:00Z', author_side: 'client', body: 'Question on the deck.', anchor_label: 'the pitch deck' },
      { created_at: '2026-07-14T11:00:00Z', author_side: 'practice', body: 'Answered inline.', anchor_label: null },
    ],
    { clientName: 'SafeSpace', practiceName: 'Sobo Consulting' }
  )
  expect(md).toContain('**SafeSpace, 2026-07-14** (about: the pitch deck)')
  expect(md).toContain('**Sobo Consulting, 2026-07-14**')
})

test('the README states what is inside, what never ships, and what failed', () => {
  const md = renderReadme(
    {
      engagementTitle: 'Systems and leaders: fundraising first',
      clientName: 'SafeSpace',
      practiceName: 'Sobo Consulting',
      startsOn: '2026-07-15',
      endsOn: '2027-01-15',
      exportedFor: 'susan@safespace.org',
      side: 'client',
      exportedOn: '2026-08-01',
    },
    [{ title: 'Build the system', stage: 'design', note_md: null }],
    { charters: 1, decisions: 17, outcomes: 8, sessions: 6, homework: 12, deliverables: 3, digests: 2, messages: 40, documents: 1, library: 12, closeout: 0, files: 5 },
    ['deliverables/deck.pdf (Pitch deck)']
  )
  expect(md).toContain('It belongs to SafeSpace.')
  expect(md).toContain('the decision log (17)')
  expect(md).toContain('Build the system: design')
  expect(md).toContain('What is never in an export')
  expect(md).toContain('Raw session transcripts')
  expect(md).toContain('Not included this time')
  expect(md).toContain('deliverables/deck.pdf (Pitch deck)')
})

test('the byte ceiling is real and generous, not decorative', () => {
  expect(EXPORT_BYTE_CEILING).toBeGreaterThanOrEqual(50 * 1024 * 1024)
  expect(EXPORT_BYTE_CEILING).toBeLessThanOrEqual(500 * 1024 * 1024)
})

// The walls, pinned statically.

test('the assembly never touches transcript columns (SECURITY.md 4.2)', () => {
  const src = read(LIB)
  expect(src.includes('raw_transcript,') || /select\([^)]*raw_transcript/.test(src)).toBe(false)
  expect(/select\([^)]*transcript_path/.test(src)).toBe(false)
})

test('the assembly never queries the excluded tables at all', () => {
  const src = read(LIB)
  for (const table of ['ai_proposals', 'readiness_markers', 'readiness_evidence', 'qa_exchanges', 'notifications', 'audit_log', 'engagement_drafts']) {
    expect(src, `exportRecord must never read ${table}`).not.toContain(`'${table}'`)
  }
})

test('every query filters to the shared shape, so both sides export the same record (gate 5B-3)', () => {
  const src = read(LIB)
  expect(src).toContain("in('status', ['published', 'superseded'])")
  expect(src).toContain("eq('visibility', 'shared')")
  expect(src).toContain("eq('audience', 'client')")
  expect(src).toContain("eq('status', 'sent')")
  expect(src).toContain("eq('visible_to_client', true)")
})

test('the lib holds no service role and no schema change (no migration in this epic)', () => {
  const src = read(LIB)
  expect(src).not.toMatch(/supabaseadmin/i)
  expect(src).not.toMatch(/service_role/i)
  expect(src).not.toMatch(/create table/i)
})

test('both export routes are guarded and rate-limited; only the practice side audits', () => {
  const client = read(CLIENT_ROUTE)
  expect(client).toContain('requireClientMember')
  expect(client).toContain('LIMITS.EXPORT_PER_HOUR')
  expect(client).toContain('LIMITS.EXPORT_PER_DAY')
  // The activity-view rule: a client action never feeds the practice's
  // activity fold, so the client surface never imports lib/audit.
  expect(client).not.toContain('lib/audit')
  const practice = read(PRACTICE_ROUTE)
  expect(practice).toContain('requirePracticeMember')
  expect(practice).toContain(".eq('practice_id', ctx.practiceId)")
  expect(practice).toContain('LIMITS.EXPORT_PER_HOUR')
  expect(practice).toContain('logAuditAction')
  expect(practice).toContain('...result.counts')
})

test('homework activity is queried only for the client side', () => {
  const src = read(LIB)
  const idx = src.indexOf("meta.side === 'client'")
  const activityIdx = src.indexOf("from('homework_activity')")
  expect(idx).toBeGreaterThan(-1)
  expect(activityIdx).toBeGreaterThan(idx)
})

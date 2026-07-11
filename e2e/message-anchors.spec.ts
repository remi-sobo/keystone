import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { anchorHref, parseAnchorParam } from '../src/lib/messageAnchors'

/**
 * V2 3E (specs/keystone-v2-anchors.md): contextual message anchors.
 * Pins the 0023 shape (the whole-anchor check, the type list without
 * digest until 3G), the server-derived label discipline in both send
 * paths, the immutability matrix case, and the pure helpers.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const mig = norm(read('supabase/migrations/0023_v2_message_anchors.sql'))
const seed = read('supabase/tests/isolation-seed.sql')

test('0023: whole anchors only, no digest until 3G, no policy or grant changes', () => {
  expect(mig).toContain(
    "check (anchor_type in ('session','action_item','deliverable','workstream','decision'))"
  )
  expect(mig).not.toContain("'digest'")
  expect(mig).toContain('messages_anchor_whole')
  // The 0007 grant does the sealing; this migration must not touch it.
  expect(mig).not.toContain('create policy')
  expect(mig).not.toContain('grant update')
})

test('both send paths resolve the anchor through the SESSION and derive the label', () => {
  for (const f of [
    'src/app/(client)/messages/actions.ts',
    'src/app/(practice)/engagements/[id]/actions.ts',
  ]) {
    const src = read(f)
    expect(src, f).toContain('parseAnchorParam')
    expect(src, f).toContain('resolveAnchor(supabase')
    // A parseable anchor that fails to resolve refuses the send.
    expect(src, f).toMatch(/anchorParam && !anchor\) redirect/)
  }
  const lib = read('src/lib/messageAnchors.ts')
  // Every resolution is engagement-scoped.
  expect(lib.match(/eq\('engagement_id', engagementId\)/g)?.length).toBeGreaterThanOrEqual(2)
})

test('the pure helpers: parsing is strict, hrefs are side-appropriate', () => {
  expect(parseAnchorParam('deliverable:8ad0a26e-0000-4000-8000-000000000001')).toEqual({
    type: 'deliverable',
    id: '8ad0a26e-0000-4000-8000-000000000001',
  })
  expect(parseAnchorParam('digest:8ad0a26e-0000-4000-8000-000000000001')).toBeNull()
  expect(parseAnchorParam('deliverable:not-a-uuid')).toBeNull()
  expect(parseAnchorParam('')).toBeNull()
  expect(anchorHref('client', 'action_item', 'x', 'e')).toBe('/homework/x')
  expect(anchorHref('practice', 'action_item', 'x', 'e')).toBe('/engagements/e/homework/x')
  expect(anchorHref('client', 'deliverable', 'x', 'e')).toBe('/deliverables')
  expect(anchorHref('practice', 'decision', 'x', 'e')).toBe('/engagements/e#decisions')
})

test('the live matrix asserts an anchor is sealed at send', () => {
  expect(seed).toContain('HOLE 3E: a session repointed a message anchor')
  expect(seed).toContain("'deliverable', '80000000-0000-0000-0000-0000000000a1'")
})

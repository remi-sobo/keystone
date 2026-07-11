import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 5B (specs/keystone-v2-portability.md): the export. The gate pins
 * the shape: one builder on the caller's session, published-and-sent
 * shapes only, no service role on either route, no migration.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('the builder rides the caller session and exports the given record only', () => {
  const lib = read('src/lib/exportRecord.ts')
  expect(lib).toContain('SupabaseClient')
  expect(lib).not.toContain('supabaseAdmin')
  // Both sides export the same paper: published charter, sent digests,
  // published closeout.
  expect(lib).toContain(".eq('status', 'published')")
  expect(lib).toContain(".eq('status', 'sent')")
})

test('both routes are session-client; the client route is pure RLS', () => {
  const client = read('src/app/(client)/export/route.ts')
  expect(client).toContain('requireClientMember')
  expect(client).not.toContain('supabaseAdmin')
  expect(client).toContain('attachment; filename=')
  const practice = read('src/app/(practice)/engagements/[id]/export/route.ts')
  expect(practice).toContain('requirePracticeMember')
  expect(practice).not.toContain('supabaseAdmin')
})

test('5B shipped with no migration', () => {
  const migs = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'))
  expect(migs.some((f) => /export|portab/i.test(f))).toBe(false)
})

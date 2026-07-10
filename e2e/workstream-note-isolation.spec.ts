import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 2F (specs/keystone-v2-workstream-detail.md): the why-we're-here
 * note rides the existing workstreams walls (cross-practice and
 * cross-client isolation pinned since Ring 1). This gate pins the 0014
 * shape and the live matrix's note assertions: a client member reads
 * the note and can never write it.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

test('0014 adds the two note columns and nothing else', () => {
  const sql = norm(read('supabase/migrations/0014_v2_workstream_note.sql'))
  expect(sql).toContain(
    'alter table public.workstreams add column if not exists note_md text, add column if not exists note_updated_at timestamptz'
  )
  expect(sql).not.toContain('create table')
  expect(sql).not.toContain('create policy')
})

test('the live matrix asserts the note read and the client write wall', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('member_a1 must read their workstream note')
  expect(seed).toContain('HOLE: a client member wrote a workstream note')
})

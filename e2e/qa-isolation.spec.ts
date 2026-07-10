import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 2E (specs/keystone-v2-qa.md): qa_exchanges is deny-all, service
 * role only, like ai_spend_ledger and voice_violations. The cross-
 * practice and cross-client story for Q&A itself is the standing RLS
 * matrix: the corpus is built on the asker's session, so every wall
 * those tables prove is the wall the model sits behind.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

test('qa_exchanges: RLS on, ZERO policies, both scoped ids', () => {
  const sql = norm(read('supabase/migrations/0016_v2_qa_exchanges.sql'))
  expect(sql).toMatch(
    /create table if not exists public\.qa_exchanges \([^;]*practice_id uuid not null[^;]*client_id uuid not null/
  )
  expect(sql).toContain('alter table public.qa_exchanges enable row level security')
  expect(sql).not.toMatch(/create policy/)
})

test('the live matrix asserts deny-all for every session', () => {
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('LEAK: a session reads qa_exchanges (owner)')
  expect(seed).toContain(
    'LEAK: a session reads qa_exchanges (client member, own question included)'
  )
  expect(seed).toContain('HOLE: a session wrote a qa exchange')
})

test('the corpus query never touches transcript columns (SECURITY.md 4.2)', () => {
  // Comments may NAME the rule; the code must not touch the columns.
  const src = read('src/lib/qaCorpus.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  expect(src).not.toMatch(/raw_transcript|transcript_path/)
})

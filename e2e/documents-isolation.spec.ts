import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Client Agreement Document: the visibility wall in migration 0011,
 * pinned statically; the live half is the engagement_documents block in
 * supabase/tests/isolation-seed.sql (cross-practice and cross-client
 * zero-reads, the unshared-document wall, and the storage-object walls
 * on both dimensions).
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const sql = norm(read('supabase/migrations/0011_engagement_documents.sql'))

test.describe('engagement_documents carries both walls', () => {
  test('RLS is on and the table carries practice_id AND client_id', () => {
    expect(sql).toContain('alter table public.engagement_documents enable row level security')
    expect(sql).toMatch(
      /create table if not exists public\.engagement_documents \([^;]*practice_id uuid not null[^;]*client_id uuid not null/
    )
  })

  test('the client read is gated on visibility AND own-client membership', () => {
    expect(sql).toMatch(
      /create policy engagement_documents_read[^;]*is_practice_member\(practice_id\)[^;]*visible_to_client and private\.is_member_of_client\(client_id\)/
    )
  })

  test('writes are practice-only on every verb', () => {
    for (const verb of ['insert', 'update', 'delete']) {
      expect(sql).toMatch(
        new RegExp(
          `create policy engagement_documents_${verb}[^;]*is_practice_member\\(practice_id\\)`
        )
      )
    }
    expect(sql).not.toMatch(/create policy engagement_documents_[a-z]*[^;]*is_member_of_client\(client_id\)\s*\)\s*with check/)
  })

  test('visibility defaults to false: nothing reaches the client unshared', () => {
    expect(sql).toContain('visible_to_client boolean not null default false')
  })
})

test.describe('the storage bucket follows the 0006 contract', () => {
  test('the bucket is private and has NO write policies', () => {
    expect(sql).toMatch(
      /insert into storage\.buckets \(id, name, public\) values \('engagement-documents', 'engagement-documents', false\)/
    )
    expect(sql).not.toMatch(/create policy [a-z0-9_"]* on storage\.objects\s*for (insert|update|delete)/)
  })

  test('a client object read demands a visible row of their own client', () => {
    expect(sql).toMatch(
      /create policy keystone_engagement_docs_read[^;]*d\.storage_path = name[^;]*d\.visible_to_client[^;]*is_member_of_client\(d\.client_id\)/
    )
  })
})

test.describe('the live matrix covers the document walls', () => {
  const seed = read('supabase/tests/isolation-seed.sql')

  test('the seed asserts visibility, both scope walls, and the storage walls', () => {
    expect(seed).toContain('LEAK: a client member reads an unshared document')
    expect(seed).toContain('LEAK: a client member reads an UNSHARED document object by path')
    expect(seed).toContain('LEAK cross-client: member_a2 reads client_a1 documents')
    expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a documents')
    expect(seed).toContain('HOLE: a client member wrote a document row')
    expect(seed).toContain('HOLE: a client member flipped document visibility')
  })
})

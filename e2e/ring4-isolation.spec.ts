import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Ring 4 isolation: deliverables, resources, session_prep_resources,
 * and the storage buckets. Static policy pinning; the live half runs in
 * the seeded matrix (cross-practice and cross-client reads, client
 * write refusal, path-scoped storage objects). The enumeration ratchet
 * reads the table names here.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()

const sql = norm(read('supabase/migrations/0006_ring4_deliverables_library.sql'))

test.describe('the three tables carry the wall', () => {
  test('RLS is enabled everywhere', () => {
    for (const t of ['deliverables', 'resources', 'session_prep_resources']) {
      expect(sql.includes(`alter table public.${t} enable row level security`)).toBe(true)
    }
  })

  test('deliverables read with both dimensions; writes are practice-only', () => {
    expect(sql).toMatch(
      /create policy deliverables_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
    for (const p of ['deliverables_insert', 'deliverables_update', 'deliverables_delete']) {
      expect(sql).toMatch(new RegExp(`create policy ${p}[^;]*is_practice_member\\(practice_id\\)`))
      expect(sql).not.toMatch(new RegExp(`create policy ${p}[^;]*is_member_of_client`))
    }
  })

  test('resources are the documented practice-wide catalog: no client_id, practice-wide read, consultant write', () => {
    // The deliberate no-client_id case (spec 5.1): the catalog is
    // practice IP, readable by every client member of that practice.
    const body = sql.slice(
      sql.indexOf('create table if not exists public.resources'),
      sql.indexOf('create index if not exists resources_practice_idx')
    )
    expect(body).not.toContain('client_id')
    expect(sql).toMatch(
      /create policy resources_read[^;]*is_practice_member\(practice_id\)[^;]*is_client_member_of_practice\(practice_id\)/
    )
    for (const p of ['resources_insert', 'resources_update', 'resources_delete']) {
      expect(sql).toMatch(new RegExp(`create policy ${p}[^;]*is_practice_member\\(practice_id\\)`))
      expect(sql).not.toMatch(new RegExp(`create policy ${p}[^;]*client_member`))
    }
  })

  test('prep links read with both dimensions so a sibling client never sees them', () => {
    expect(sql).toMatch(
      /create policy session_prep_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
    expect(sql).not.toMatch(/create policy session_prep_(insert|delete)[^;]*is_member_of_client/)
  })

  test('a file deliverable carries its path, a link its url (kind constraint)', () => {
    expect(sql).toMatch(
      /constraint deliverables_kind_payload check \( \(kind = 'file' and storage_path is not null\) or \(kind = 'link' and url is not null\) \)/
    )
  })
})

test.describe('the storage walls', () => {
  test('both buckets are private', () => {
    expect(sql).toMatch(/values \('deliverables', 'deliverables', false\)/)
    expect(sql).toMatch(/values \('resources', 'resources', false\)/)
  })

  test('object reads are path-scoped through the membership helpers', () => {
    expect(sql).toMatch(
      /create policy keystone_deliverables_read on storage\.objects[^;]*bucket_id = 'deliverables'[^;]*is_practice_member\(private\.try_uuid\(\(storage\.foldername\(name\)\)\[1\]\)\)[^;]*is_member_of_client\(private\.try_uuid\(\(storage\.foldername\(name\)\)\[2\]\)\)/
    )
    expect(sql).toMatch(
      /create policy keystone_resources_read on storage\.objects[^;]*bucket_id = 'resources'[^;]*is_client_member_of_practice\(private\.try_uuid\(\(storage\.foldername\(name\)\)\[1\]\)\)/
    )
  })

  test('no session writes storage directly: zero insert/update/delete policies', () => {
    // Uploads ride signed upload URLs minted server-side after the
    // membership check; deletes ride the service role.
    expect(sql).not.toMatch(/create policy [a-z0-9_]+ on storage\.objects for (insert|update|delete)/)
  })

  test('the path parser fails closed: try_uuid pins search_path and is revoked from anon', () => {
    expect(sql).toMatch(/function private\.try_uuid\(p text\)[^$]*set search_path = ''/)
    expect(sql).toContain('revoke all on function private.try_uuid(text) from public, anon')
  })
})

test.describe('the surfaces hold their enforcement model', () => {
  test('client deliverables and library stay pure RLS', () => {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    for (const f of [
      'src/app/(client)/deliverables/page.tsx',
      'src/app/(client)/deliverables/[id]/file/route.ts',
      'src/app/(client)/library/page.tsx',
      'src/app/(client)/library/[id]/page.tsx',
    ]) {
      const src = strip(read(f))
      expect(src, `${f} must stay pure RLS`).not.toMatch(/supabaseadmin|service_role/i)
    }
  })

  test('the signed-upload mint checks practice membership before touching the service role', () => {
    const src = read('src/app/(practice)/engagements/[id]/actions.ts')
    expect(src).toContain('createSignedUploadUrl')
    // The membership guard appears before the first admin use.
    const guardAt = src.indexOf('guardPractice')
    const adminAt = src.indexOf('supabaseAdmin.storage')
    expect(guardAt).toBeGreaterThan(-1)
    expect(adminAt).toBeGreaterThan(guardAt)
  })
})

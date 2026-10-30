import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Read AI import isolation (migration 0050, specs/keystone-readai.md):
 * session_transcripts and readai_meetings are practice-only, the client
 * surface never reads a transcript, and the webhook is a fail-closed
 * machine route. Static pins; the live half is the Read AI block at the
 * end of supabase/tests/isolation-seed.sql (cross-practice and
 * cross-client reads of both tables return zero rows).
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(path.join(process.cwd(), dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(rel))
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}

const sql = norm(read('supabase/migrations/0050_readai_import.sql'))

test.describe('the transcript wall', () => {
  test('session_transcripts has RLS and no client-member branch in any policy', () => {
    expect(sql).toContain('alter table public.session_transcripts enable row level security')
    expect(sql).toMatch(/create policy session_transcripts_read[^;]*is_practice_member\(practice_id\)/)
    const policies = sql.match(/create policy session_transcripts_[a-z]+ on public\.session_transcripts[^;]*;/g) ?? []
    expect(policies.length).toBe(4)
    for (const p of policies) {
      expect(p).not.toMatch(/is_member_of_client|client_members|is_client_member_of_practice/)
    }
  })

  test('existing transcripts move across and the old column is kept empty by constraint', () => {
    expect(sql).toMatch(/insert into public\.session_transcripts[^;]*from public\.session_notes/)
    expect(sql).toContain('update public.session_notes set raw_transcript = null')
    expect(sql).toContain('check (raw_transcript is null)')
  })

  test('no client surface file reads a transcript', () => {
    for (const f of walk('src/app/(client)')) {
      const src = stripJsComments(read(f))
      expect(src, `${f} reads session_transcripts`).not.toContain('session_transcripts')
      expect(src, `${f} reads raw_transcript`).not.toContain('raw_transcript')
      expect(src, `${f} imports the Read AI writer`).not.toContain('readai/import')
    }
  })

  test('nothing in src still reads or writes the retired column', () => {
    for (const f of walk('src')) {
      const src = stripJsComments(read(f))
      expect(/select\([^)]*raw_transcript/.test(src), `${f} selects raw_transcript`).toBe(false)
      expect(/raw_transcript\s*:/.test(src), `${f} writes raw_transcript`).toBe(false)
    }
  })
})

test.describe('the Read AI ledger', () => {
  test('readai_meetings is practice-read only and has no write policy', () => {
    expect(sql).toContain('alter table public.readai_meetings enable row level security')
    expect(sql).toMatch(/create policy readai_meetings_read[^;]*for select[^;]*is_practice_member\(practice_id\)/)
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.readai_meetings for (insert|update|delete)/)
    expect(sql).not.toMatch(/create policy readai_meetings_read[^;]*is_member_of_client/)
  })

  test('a skipped or discarded meeting holds no content, by constraint', () => {
    expect(sql).toContain('readai_meetings_no_content_unless_review')
    expect(sql).toContain('readai_meetings_content_only_while_waiting')
    expect(sql).toContain('unique (practice_id, readai_id)')
  })
})

test.describe('the webhook route', () => {
  const ROUTE = 'src/app/api/readai/webhook/route.ts'
  const src = read(ROUTE)

  test('rate limits before the secret check, then fails closed', () => {
    const limit = src.indexOf('enforceRateLimits(')
    const secret = src.indexOf('secretMatches(')
    expect(limit).toBeGreaterThan(-1)
    expect(secret).toBeGreaterThan(limit)
    expect(src).toContain("'not_configured' }, { status: 503 }")
    expect(src).toContain("'unauthorized' }, { status: 401 }")
  })

  test('the practice comes from config, never from the request', () => {
    expect(src).toContain('env.READAI_PRACTICE_ID')
    expect(src).not.toMatch(/searchParams\.get\(['"]practice/)
    expect(src).not.toMatch(/practice_id['"]?\]/)
  })

  test('the secret is compared in constant time', () => {
    expect(read('src/lib/readai/payload.ts')).toContain('timingSafeEqual')
  })

  test('the proxy lets the machine routes through to their own secret checks', () => {
    const proxy = read('src/proxy.ts')
    for (const p of ['/api/readai', '/api/digest', '/api/notify', '/api/calendar/refresh']) {
      expect(proxy).toContain(`'${p}'`)
    }
  })
})

test.describe('the import writes only inert or practice-only rows', () => {
  const src = read('src/lib/readai/import.ts')

  test('the only live-record writes are the transcript, the empty note row, and one proposal', () => {
    const writes = [...src.matchAll(/from\('([a-z_]+)'\)\s*\.(insert|update|upsert)/g)].map((m) => m[1])
    expect(new Set(writes)).toEqual(
      new Set(['readai_meetings', 'session_transcripts', 'session_notes', 'ai_proposals'])
    )
    expect(src).not.toMatch(/from\('(action_items|decisions|deliverables)'\)/)
  })

  test('the note row it makes is never shared and carries no content', () => {
    const noteWrite = src.slice(src.indexOf("from('session_notes')"), src.indexOf("from('session_notes')") + 400)
    expect(noteWrite).not.toMatch(/visibility|summary_md|decisions_md/)
    expect(noteWrite).toContain('ignoreDuplicates: true')
  })

  test('proposals pass the voice gate and name their source', () => {
    expect(src).toContain('validateVoice')
    expect(src).toContain("model_used: 'read.ai'")
  })

  test('logs never carry meeting content', () => {
    for (const m of src.matchAll(/console\.(error|log|warn)\(([^)]*)\)/g)) {
      expect(m[2]).not.toMatch(/summary|transcript_text|title|body|participant/)
    }
  })
})

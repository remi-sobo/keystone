import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Ring 3 isolation: session_notes, action_items, ai_proposals,
 * readiness_markers. Static policy pinning; the live half runs in the
 * seeded matrix. The enumeration ratchet reads the table names here.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const norm = (s: string) => s.replace(/\s+/g, ' ').toLowerCase()
const stripJsComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const sql = norm(read('supabase/migrations/0005_ring3_notes_homework.sql'))

test.describe('the four tables carry the wall', () => {
  test('RLS is enabled everywhere', () => {
    for (const t of ['session_notes', 'action_items', 'ai_proposals', 'readiness_markers']) {
      expect(sql.includes(`alter table public.${t} enable row level security`)).toBe(true)
    }
  })

  test('an unshared note (and its transcript) never reaches a client session', () => {
    expect(sql).toMatch(
      /create policy session_notes_read[^;]*is_practice_member\(practice_id\)[^;]*visibility = 'shared' and private\.is_member_of_client\(client_id\)/
    )
  })

  test('action items read with both dimensions; the client check-off is assignment-scoped', () => {
    expect(sql).toMatch(
      /create policy action_items_read[^;]*is_practice_member\(practice_id\)[^;]*is_member_of_client\(client_id\)/
    )
    expect(sql).toMatch(
      /create policy action_items_checkoff[^;]*owns_client_membership\(assigned_client_member_id\)/
    )
  })

  test('proposals are readable by the practice only and writable by NO session', () => {
    expect(sql).toMatch(/create policy ai_proposals_read[^;]*is_practice_member\(practice_id\)/)
    expect(sql).not.toMatch(/create policy ai_proposals_read[^;]*is_member_of_client/)
    // Inert by construction: zero insert/update/delete policies.
    expect(sql).not.toMatch(/create policy [a-z0-9_]* on public\.ai_proposals for (insert|update|delete)/)
  })

  test('readiness is consultant-only in both directions', () => {
    expect(sql).toMatch(/create policy readiness_read[^;]*is_practice_member\(practice_id\)/)
    expect(sql).not.toMatch(/create policy readiness_read[^;]*is_member_of_client/)
  })

  test('owns_client_membership pins search_path and is revoked from anon', () => {
    expect(sql).toMatch(
      /function private\.owns_client_membership\(p_member uuid\)[^$]*security definer[^$]*set search_path = ''/
    )
    expect(sql).toContain(
      'revoke all on function private.owns_client_membership(uuid) from public, anon'
    )
  })
})

test.describe('the AI contract in the actions', () => {
  const ACTIONS = 'src/app/(practice)/sessions/[id]/actions.ts'

  test('extraction is guarded, rate-limited, spend-scoped, and writes ONE proposals row', () => {
    const src = read(ACTIONS)
    expect(src).toContain('AI_EXTRACT_PER_MIN')
    expect(src).toContain('AI_EXTRACT_PER_HOUR')
    expect(src).toContain('callClaudeChecked')
    expect(src).toContain('practiceId')
    expect(src).toContain('AiBudgetExceededError')
    // The one write target of the extraction path.
    expect(src).toMatch(/from\('ai_proposals'\)\s*\.insert/)
    // Extraction never writes live tables.
    const extractFn = src.slice(src.indexOf('extractFromTranscript'), src.indexOf('decideProposal'))
    expect(extractFn).not.toMatch(/from\('(action_items|session_notes)'\)\s*\.(insert|update|upsert)/)
    // Voice gate at the boundary.
    expect(src).toContain('validateVoice')
    expect(src).toContain('logVoiceViolation')
  })

  test('decideProposal is the single path into live tables and validates assignees against the proposal client', () => {
    const src = read(ACTIONS)
    expect(src).toContain("eq('status', 'proposed')")
    // Assignee ids are checked against the proposal's own client roster.
    expect(src).toMatch(/from\('client_members'\)[\s\S]{0,120}eq\('client_id', proposal\.client_id\)/)
    expect(src).toContain('validIds.has(rawAssign)')
    // Accept publishes the note and audits metadata only.
    expect(src).toContain("visibility: 'shared'")
    expect(src).toContain('logAuditAction')
  })

  test('the client surfaces stay pure RLS', () => {
    for (const f of [
      'src/app/(client)/homework/actions.ts',
      'src/app/(client)/homework/page.tsx',
      'src/app/(client)/sessions/[id]/page.tsx',
    ]) {
      const src = stripJsComments(read(f))
      expect(src, `${f} must stay pure RLS`).not.toMatch(/supabaseadmin|service_role/i)
    }
  })

  test('no client surface file reads ai_proposals or readiness_markers', () => {
    const root = path.join(process.cwd(), 'src/app/(client)')
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
      )
    for (const f of walk(root).filter((f) => /\.(ts|tsx)$/.test(f))) {
      const src = fs.readFileSync(f, 'utf-8')
      expect(src, `${f} must not touch proposals`).not.toContain("from('ai_proposals')")
      expect(src, `${f} must not touch readiness`).not.toContain("from('readiness_markers')")
    }
  })
})

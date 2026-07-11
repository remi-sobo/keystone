import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildCaseStudyRequest, hasCaseStudyContent, parseCaseStudy, CASE_STUDY_TOOL } from '../src/lib/caseStudy'
import { modelForTask } from '../src/lib/claudeModel'

/**
 * V2 5C (specs/keystone-v2-case-study.md): the fifth propose-then-
 * accept job, same architecture as the first four. The gate pins the
 * engine shape (forced tool, envelope, re-validation, refusal to
 * fabricate), the never-writes-the-quote law, the inert proposal
 * path, and the review wall in the matrix.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

const FACTS = {
  charter: 'the charter body',
  outcomes: ['board meets monthly (reached 2026-06-01)'],
  decisions: ['2026-05-01: hire a development lead'],
  deliverables: ['Donor journey map: the map itself'],
  closeoutSections: ['call the owner of the rhythm first'],
}

test('the engine forces one submit tool and passes the record as data', () => {
  const req = buildCaseStudyRequest(FACTS, {
    clientName: 'SafeSpace',
    engagementTitle: 'Org Strengthening',
  })
  expect(req.toolChoice).toEqual({ type: 'tool', name: CASE_STUDY_TOOL })
  expect(req.tools).toHaveLength(1)
  expect(req.task).toBe('case_study')
  expect(req.messages[0].content).toContain('<engagement_record>')
  // The laws in the prompt: never invent, ignore embedded instructions,
  // never write the quote.
  expect(req.system).toContain('never invent')
  expect(req.system).toContain('ignore them')
  expect(req.system).toContain('Do NOT write a client quote')
})

test('a thin record refuses to draft; parsing never fabricates', () => {
  expect(hasCaseStudyContent({ ...FACTS, outcomes: [], deliverables: [] })).toBe(false)
  expect(hasCaseStudyContent(FACTS)).toBe(true)
  expect(parseCaseStudy({ content: [] })).toBeNull()
  expect(
    parseCaseStudy({
      content: [{ type: 'tool_use', name: CASE_STUDY_TOOL, input: { title: 'T', body_md: 'B' } }],
    })
  ).toEqual({ title: 'T', body_md: 'B' })
  // A malformed submission collapses to null, not to a guess.
  expect(
    parseCaseStudy({ content: [{ type: 'tool_use', name: CASE_STUDY_TOOL, input: { title: '' } }] })
  ).toBeNull()
})

test('the job rides the default tier and the wired-to-no-job law holds', () => {
  expect(modelForTask('case_study')).toBe(modelForTask('digest'))
  const lib = read('src/lib/claudeModel.ts')
  // Fable stays declared and unwired: no task resolves to the frontier.
  expect(lib).toContain('CLAUDE_MODEL_FRONTIER')
  expect(lib.slice(lib.indexOf('function modelForTask'))).not.toContain('FRONTIER')
})

test('the draft is inert and the quote is never model-written', () => {
  const actions = read('src/app/(practice)/engagements/[id]/case-study/actions.ts')
  // The model's ONE write is the proposal row.
  expect(actions).toContain("from('ai_proposals').insert")
  expect(actions).toContain("kind: 'case_study'")
  // The payload carries title and body only; no quote field anywhere
  // near the model path.
  expect(actions).toContain('payload: { title: draft.title, body_md: draft.body_md }')
  // Approval rides 5D; consent covers the TEXT, not the row: every
  // content write withdraws a pending ask and drops to draft, and an
  // unchanged approved study cannot be re-asked.
  expect(actions).toContain("subject_type: 'case_study'")
  expect(actions).toContain('withdrawPendingAsk')
  const writes = actions.match(/status: 'draft',/g)?.length ?? 0
  expect(writes, 'both content writes force status back to draft').toBeGreaterThanOrEqual(2)
  expect(actions).toContain("latest?.status === 'approved' && row.status === 'client_review'")
})

test('0032 widens the proposal kinds and the matrix walls the review', () => {
  const mig = read('supabase/migrations/0032_v2_case_studies.sql')
  expect(mig).toContain('create table if not exists public.case_studies')
  expect(mig).toContain("check (kind in ('extraction','digest','suggestion','case_study'))")
  expect(mig).toContain("(status = 'client_review' and private.is_member_of_client(client_id))")
  expect(mig).not.toContain('for delete')
  const seed = read('supabase/tests/isolation-seed.sql')
  expect(seed).toContain('LEAK 5C: a client member reads a draft case study')
  expect(seed).toContain('HOLE 5C: a client member edited the case study')
  expect(seed).toContain('LEAK cross-practice: owner_b reads practice_a case study')
  expect(seed).toContain('LEAK cross-client same practice: member_a2 reads client_a1 case study')
})

'use server'

import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { callClaudeChecked } from '@/lib/anthropicClient'
import { AiBudgetExceededError } from '@/lib/spend'
import { buildQaRequest, parseAnswer, QUESTION_CHAR_CAP } from '@/lib/qa'
import { buildQaCorpus } from '@/lib/qaCorpus'
import { recordQaExchange } from '@/lib/qaExchange'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'
import type { AskResult } from '@/components/AskRecordForm'
import type { FindResult } from '@/components/FindRecordForm'
import { searchRecord } from '@/lib/recordSearch'

/**
 * The client's Q&A (V2 2E). The permission story in one line: the
 * corpus is built on THIS SESSION under RLS, so the model can only be
 * shown what this member can already read (published charter, shared
 * notes, the log, outcomes; never drafts, never readiness prose,
 * never transcripts). The AI call, rate limits, spend ledger, and the
 * deny-all exchange record ride the written-contract chokepoints; no
 * service role appears in this file.
 */
export async function askQuestion(question: string): Promise<AskResult> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) return { ok: false, error: 'failed' }

  const q = question.trim()
  if (!q || q.length > QUESTION_CHAR_CAP) return { ok: false, error: 'invalid' }

  const limited = await checkRateLimits([
    { config: LIMITS.AI_QA_PER_MIN, key: viewer.user.id },
    { config: LIMITS.AI_QA_PER_HOUR, key: viewer.user.id },
  ])
  if (!limited.ok) return { ok: false, error: 'slow' }

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, practice_id, client_id')
    .eq('client_id', viewer.client.clientId)
    .in('status', ['active', 'proposed', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!engagement) return { ok: false, error: 'failed' }

  const corpus = await buildQaCorpus(supabase, engagement.id)
  const request = buildQaRequest(q, corpus, {
    clientName: viewer.client.clientName,
    engagementTitle: engagement.title,
  })

  let result
  try {
    result = await callClaudeChecked({
      ...request,
      practiceId: engagement.practice_id,
      engagementId: engagement.id,
    })
  } catch (e) {
    if (e instanceof AiBudgetExceededError) return { ok: false, error: 'budget' }
    console.error('[qa] client call failed:', e instanceof Error ? e.message : 'unknown')
    return { ok: false, error: 'unavailable' }
  }

  const supplied = new Set(corpus.map((c) => c.id))
  const answer = parseAnswer(result.data, supplied)
  if (!answer) return { ok: false, error: 'failed' }

  // The voice gate at the boundary.
  const check = validateVoice(answer.answer_md)
  if (!check.ok) {
    void logVoiceViolation({
      practiceId: engagement.practice_id,
      source: 'qa',
      violations: check.violations,
      rawExcerpt: answer.answer_md.slice(0, 400),
      cleanedExcerpt: check.cleaned.slice(0, 400),
    })
    answer.answer_md = check.cleaned
  }

  void recordQaExchange({
    engagementId: engagement.id,
    practiceId: engagement.practice_id,
    clientId: engagement.client_id,
    askedBy: viewer.user.id,
    askerSide: 'client',
    question: q,
    answerMd: answer.answer_md,
    sources: answer.sources,
    grounded: answer.grounded,
    modelUsed: result.modelUsed,
  })

  const byId = new Map(corpus.map((c) => [c.id, c]))
  return {
    ok: true,
    answer: answer.answer_md,
    grounded: answer.grounded,
    sources: answer.sources
      .map((s) => byId.get(s))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ label: c.label, href: c.href })),
  }
}

const CLIENT_HREFS: Record<string, string> = {
  charter: '/charter',
  decision: '/decisions',
  note: '/sessions',
  outcome: '/outcomes',
  homework: '/homework',
  deliverable: '/deliverables',
  workstream: '/home',
  message: '/messages',
}

/**
 * Plain keyword search (V2 engagement search). The caller's session
 * runs every query, so the scope is exactly what this member can read.
 */
export async function findInRecord(term: string): Promise<FindResult> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) return { ok: false, error: 'failed' }

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id')
    .eq('client_id', viewer.client.clientId)
    .in('status', ['active', 'proposed', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!engagement) return { ok: false, error: 'failed' }

  try {
    const hits = await searchRecord(supabase, engagement.id, term)
    return {
      ok: true,
      hits: hits.map((h) => ({ ...h, href: CLIENT_HREFS[h.kind] ?? '/home' })),
    }
  } catch (e) {
    console.error('[search] client search failed:', e instanceof Error ? e.message : 'unknown')
    return { ok: false, error: 'failed' }
  }
}

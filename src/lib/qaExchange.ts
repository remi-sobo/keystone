import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * lib/qaExchange.ts
 *
 * SERVER-ONLY. The one writer of qa_exchanges, the deny-all
 * accountability copy of every Q&A exchange (RLS on, zero policies;
 * SECURITY.md section 5). Best-effort like the audit log: recording
 * must never fail or slow the answer it records. Callers verify
 * membership BEFORE the call, per service-role-after-check.
 */
export async function recordQaExchange(opts: {
  engagementId: string
  practiceId: string
  clientId: string
  askedBy: string
  askerSide: 'practice' | 'client'
  question: string
  answerMd: string | null
  sources: string[]
  grounded: boolean | null
  modelUsed: string | null
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('qa_exchanges').insert({
      engagement_id: opts.engagementId,
      practice_id: opts.practiceId,
      client_id: opts.clientId,
      asked_by: opts.askedBy,
      asker_side: opts.askerSide,
      question: opts.question,
      answer_md: opts.answerMd,
      sources: opts.sources,
      grounded: opts.grounded,
      model_used: opts.modelUsed,
    })
    if (error) console.error('[qa] exchange record failed:', error.message)
  } catch (e) {
    console.error('[qa] exchange record threw:', e instanceof Error ? e.message : 'unknown')
  }
}

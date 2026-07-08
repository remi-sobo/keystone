'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { callClaudeChecked } from '@/lib/anthropicClient'
import { AiBudgetExceededError } from '@/lib/spend'
import { buildExtractionRequest, parseExtraction, TRANSCRIPT_CHAR_CAP } from '@/lib/extract'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'
import { logAuditAction } from '@/lib/audit'

/**
 * Practice session-detail actions (Ring 3). The AI contract in code:
 * extraction writes ONE ai_proposals row (service role, after the
 * membership check, scoped by the resolved practice); decideProposal is
 * the single human path from a proposal into live tables. The
 * transcript itself saves through the SESSION client so RLS stays the
 * wall for the raw PII write.
 */

const back = (id: string, state: string) => `/sessions/${id}/notes?state=${state}`

async function guardPractice() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  return viewer
}

// ── Save the pasted transcript (session client, RLS) ─────────────────

const TranscriptShape = z.object({
  sessionId: z.string().uuid(),
  transcript: z.string().min(1).max(TRANSCRIPT_CHAR_CAP),
})

export async function saveTranscript(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = TranscriptShape.safeParse({
    sessionId: formData.get('sessionId'),
    transcript: formData.get('transcript'),
  })
  if (!parsed.success) redirect('/clients')
  const { sessionId, transcript } = parsed.data

  const supabase = await createServerSupabase()
  const { data: session } = await supabase
    .from('sessions')
    .select('id, engagement_id, practice_id, client_id')
    .eq('id', sessionId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!session) redirect('/clients')

  const { error } = await supabase.from('session_notes').upsert(
    {
      session_id: session.id,
      engagement_id: session.engagement_id,
      practice_id: session.practice_id,
      client_id: session.client_id,
      raw_transcript: transcript,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id' }
  )
  if (error) {
    console.error('[notes] transcript save failed:', error.message)
    redirect(back(sessionId, 'save_failed'))
  }
  revalidatePath(`/sessions/${sessionId}/notes`)
  redirect(back(sessionId, 'saved'))
}

// ── Extract (the AI call; service role after the check) ──────────────

const ExtractShape = z.object({ sessionId: z.string().uuid() })

export async function extractFromTranscript(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = ExtractShape.safeParse({ sessionId: formData.get('sessionId') })
  if (!parsed.success) redirect('/clients')
  const sessionId = parsed.data.sessionId
  const practiceId = viewer.practice!.practiceId

  const limited = await checkRateLimits([
    { config: LIMITS.AI_EXTRACT_PER_MIN, key: viewer.user!.id },
    { config: LIMITS.AI_EXTRACT_PER_HOUR, key: viewer.user!.id },
  ])
  if (!limited.ok) redirect(back(sessionId, 'slow'))

  // Scoped load: the session, its note, the client, and the roster.
  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('id, engagement_id, practice_id, client_id, starts_at, clients(name)')
    .eq('id', sessionId)
    .eq('practice_id', practiceId)
    .maybeSingle()
  if (!session) redirect('/clients')

  const [{ data: note }, { data: roster }] = await Promise.all([
    supabaseAdmin
      .from('session_notes')
      .select('raw_transcript')
      .eq('session_id', session.id)
      .maybeSingle(),
    supabaseAdmin
      .from('client_members')
      .select('email')
      .eq('client_id', session.client_id),
  ])
  if (!note?.raw_transcript) redirect(back(sessionId, 'no_transcript'))

  const request = buildExtractionRequest(note.raw_transcript, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientName: ((session.clients as any)?.name as string) ?? 'the client',
    sessionDate: new Date(session.starts_at).toISOString().slice(0, 10),
    memberNames: (roster ?? []).map((m) => m.email.split('@')[0]),
  })

  let result
  try {
    result = await callClaudeChecked({
      ...request,
      practiceId,
      engagementId: session.engagement_id,
    })
  } catch (e) {
    if (e instanceof AiBudgetExceededError) redirect(back(sessionId, 'budget'))
    console.error('[extract] model call failed:', e instanceof Error ? e.message : 'unknown')
    redirect(back(sessionId, 'ai_failed'))
  }

  const extraction = parseExtraction(result.data)
  if (!extraction) redirect(back(sessionId, 'ai_failed'))

  // The voice gate at the boundary: mechanical repairs ship, drift logs.
  for (const field of ['summary_md', 'decisions_md'] as const) {
    const check = validateVoice(extraction[field])
    if (!check.ok) {
      extraction[field] = check.cleaned
      void logVoiceViolation({
        practiceId,
        source: 'extract',
        violations: check.violations,
        rawExcerpt: extraction[field],
        cleanedExcerpt: check.cleaned,
      })
    }
  }

  // The ONE write: an inert proposal row.
  const { error } = await supabaseAdmin.from('ai_proposals').insert({
    kind: 'extraction',
    engagement_id: session.engagement_id,
    practice_id: session.practice_id,
    client_id: session.client_id,
    session_id: session.id,
    payload: extraction,
    model_used: result.modelUsed,
  })
  if (error) {
    console.error('[extract] proposal insert failed:', error.message)
    redirect(back(sessionId, 'ai_failed'))
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'ai.extract',
    target: session.id,
    detail: {
      items: extraction.action_items.length,
      model: result.modelUsed,
      fell_back: result.fellBack,
    },
  })

  revalidatePath(`/sessions/${sessionId}/notes`)
  redirect(back(sessionId, 'extracted'))
}

// ── Decide (the single human path into live tables) ──────────────────

const DecideShape = z.object({
  proposalId: z.string().uuid(),
  sessionId: z.string().uuid(),
  decision: z.enum(['accept', 'dismiss']),
})

export async function decideProposal(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = DecideShape.safeParse({
    proposalId: formData.get('proposalId'),
    sessionId: formData.get('sessionId'),
    decision: formData.get('decision'),
  })
  if (!parsed.success) redirect('/clients')
  const { proposalId, sessionId, decision } = parsed.data
  const practiceId = viewer.practice!.practiceId

  const { data: proposal } = await supabaseAdmin
    .from('ai_proposals')
    .select('id, kind, payload, status, engagement_id, practice_id, client_id, session_id')
    .eq('id', proposalId)
    .eq('practice_id', practiceId)
    .eq('status', 'proposed')
    .maybeSingle()
  if (!proposal) redirect(back(sessionId, 'proposal_gone'))

  if (decision === 'dismiss') {
    await supabaseAdmin
      .from('ai_proposals')
      .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: viewer.user!.id })
      .eq('id', proposal.id)
    await logAuditAction({
      actorEmail: viewer.user!.email ?? '',
      action: 'ai.proposal.dismiss',
      target: proposal.id,
    })
    revalidatePath(`/sessions/${sessionId}/notes`)
    redirect(back(sessionId, 'dismissed'))
  }

  // Accept: publish the note and create the items, with per-item
  // assignments the consultant set in the form (assign_<index> fields
  // carrying a client_members id or empty). Every assignee id is
  // validated against the proposal's OWN client before it is written.
  const payload = proposal.payload as {
    summary_md: string
    decisions_md: string
    action_items: Array<{ title: string; timing: string; due_hint?: string }>
  }

  const { data: validMembers } = await supabaseAdmin
    .from('client_members')
    .select('id')
    .eq('client_id', proposal.client_id)
  const validIds = new Set((validMembers ?? []).map((m) => m.id))

  const items = payload.action_items.map((item, i) => {
    const rawAssign = String(formData.get(`assign_${i}`) ?? '')
    const rawDue = String(formData.get(`due_${i}`) ?? '')
    const due = /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null
    return {
      engagement_id: proposal.engagement_id,
      practice_id: proposal.practice_id,
      client_id: proposal.client_id,
      session_id: proposal.session_id,
      title: item.title.slice(0, 200),
      assigned_client_member_id: validIds.has(rawAssign) ? rawAssign : null,
      due_on: due,
      timing: ['before_session', 'after_session', 'standing'].includes(item.timing)
        ? item.timing
        : 'standing',
      status: 'open',
      source: 'accepted_proposal',
      proposal_id: proposal.id,
    }
  })

  const { error: noteError } = await supabaseAdmin
    .from('session_notes')
    .update({
      summary_md: payload.summary_md,
      decisions_md: payload.decisions_md,
      visibility: 'shared',
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', proposal.session_id)
    .eq('practice_id', practiceId)
  if (noteError) {
    console.error('[accept] note publish failed:', noteError.message)
    redirect(back(sessionId, 'accept_failed'))
  }

  if (items.length > 0) {
    const { error: itemsError } = await supabaseAdmin.from('action_items').insert(items)
    if (itemsError) {
      console.error('[accept] items insert failed:', itemsError.message)
      redirect(back(sessionId, 'accept_failed'))
    }
  }

  await supabaseAdmin
    .from('ai_proposals')
    .update({ status: 'accepted', decided_at: new Date().toISOString(), decided_by: viewer.user!.id })
    .eq('id', proposal.id)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'ai.proposal.accept',
    target: proposal.id,
    detail: { items: items.length, assigned: items.filter((i) => i.assigned_client_member_id).length },
  })

  revalidatePath(`/sessions/${sessionId}/notes`)
  revalidatePath('/homework')
  redirect(back(sessionId, 'accepted'))
}

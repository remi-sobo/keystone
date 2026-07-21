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
import { sendPublishNotices, type PublishedHomework } from '@/lib/publishNotice'
import {
  decisionsBlock,
  type EditedPayload,
  type ItemDisposition,
  type ReviewDecision,
  type ReviewItem,
} from '@/lib/aiReview'

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
    engagementId: session.engagement_id,
    practiceId: session.practice_id,
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

// ── Prep resources (Ring 4): attach a catalog entry to a session ─────

const PrepShape = z.object({
  sessionId: z.string().uuid(),
  resourceId: z.string().uuid(),
})

export async function attachPrepResource(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = PrepShape.safeParse({
    sessionId: formData.get('sessionId'),
    resourceId: formData.get('resourceId'),
  })
  if (!parsed.success) redirect('/clients')
  const { sessionId, resourceId } = parsed.data
  const practiceId = viewer.practice!.practiceId

  // Both ends verified in THIS practice before the link exists: the
  // session (which carries the client scope) and the catalog entry.
  const supabase = await createServerSupabase()
  const [{ data: session }, { data: resource }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, practice_id, client_id')
      .eq('id', sessionId)
      .eq('practice_id', practiceId)
      .maybeSingle(),
    supabase
      .from('resources')
      .select('id')
      .eq('id', resourceId)
      .eq('practice_id', practiceId)
      .maybeSingle(),
  ])
  if (!session || !resource) redirect('/clients')

  const { error } = await supabase.from('session_prep_resources').upsert(
    {
      session_id: session.id,
      resource_id: resource.id,
      practice_id: session.practice_id,
      client_id: session.client_id,
    },
    { onConflict: 'session_id,resource_id', ignoreDuplicates: true }
  )
  if (error) console.error('[prep] attach failed:', error.message)
  revalidatePath(`/sessions/${sessionId}/notes`)
  redirect(back(sessionId, 'prep_attached'))
}

export async function removePrepResource(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = PrepShape.safeParse({
    sessionId: formData.get('sessionId'),
    resourceId: formData.get('resourceId'),
  })
  if (!parsed.success) redirect('/clients')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('session_prep_resources')
    .delete()
    .eq('session_id', parsed.data.sessionId)
    .eq('resource_id', parsed.data.resourceId)
    .eq('practice_id', viewer.practice!.practiceId)
  if (error) console.error('[prep] remove failed:', error.message)
  revalidatePath(`/sessions/${parsed.data.sessionId}/notes`)
  redirect(back(parsed.data.sessionId, 'prep_removed'))
}

// ── Dismiss (the review workspace below is the only accept path) ─────

const DecideShape = z.object({
  proposalId: z.string().uuid(),
  sessionId: z.string().uuid(),
  decision: z.literal('dismiss'),
})

export async function decideProposal(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = DecideShape.safeParse({
    proposalId: formData.get('proposalId'),
    sessionId: formData.get('sessionId'),
    decision: formData.get('decision'),
  })
  if (!parsed.success) redirect('/clients')
  const { proposalId, sessionId } = parsed.data

  const { data: proposal } = await supabaseAdmin
    .from('ai_proposals')
    .select('id, status, practice_id, engagement_id')
    .eq('id', proposalId)
    .eq('practice_id', viewer.practice!.practiceId)
    .eq('status', 'proposed')
    .maybeSingle()
  if (!proposal) redirect(back(sessionId, 'proposal_gone'))

  await supabaseAdmin
    .from('ai_proposals')
    .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: viewer.user!.id })
    .eq('id', proposal.id)
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    engagementId: proposal.engagement_id,
    practiceId: proposal.practice_id,
    action: 'ai.proposal.dismiss',
    target: proposal.id,
  })
  revalidatePath(`/sessions/${sessionId}/notes`)
  redirect(back(sessionId, 'dismissed'))
}

// ── The review workspace (V2 3A): edit, save as draft, publish ───────
// The original payload is trigger-immutable; every edit lands in
// edited_payload. Publishing stays the ONE human path into the record,
// now selective: the note, the decision-log rows, and the items each
// publish only when checked. Accepted is accepted (gate 3A-4): a
// published proposal never reopens.

const ReviewShape = z.object({
  proposalId: z.string().uuid(),
  sessionId: z.string().uuid(),
  mode: z.enum(['draft', 'publish']),
})

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function reviewProposal(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = ReviewShape.safeParse({
    proposalId: formData.get('proposalId'),
    sessionId: formData.get('sessionId'),
    mode: formData.get('mode'),
  })
  if (!parsed.success) redirect('/clients')
  const { proposalId, sessionId, mode } = parsed.data
  const practiceId = viewer.practice!.practiceId

  const { data: proposal } = await supabaseAdmin
    .from('ai_proposals')
    .select('id, kind, status, engagement_id, practice_id, client_id, session_id')
    .eq('id', proposalId)
    .eq('practice_id', practiceId)
    .eq('kind', 'extraction')
    .eq('status', 'proposed')
    .maybeSingle()
  if (!proposal) redirect(back(sessionId, 'proposal_gone'))

  // Client-facing prose rides the voice gate like every shipped string.
  const sweep = (text: string): string => {
    const check = validateVoice(text)
    if (check.ok) return text
    void logVoiceViolation({
      practiceId,
      source: 'ai_review',
      violations: check.violations,
      rawExcerpt: text.slice(0, 400),
      cleanedExcerpt: check.cleaned.slice(0, 400),
    })
    return check.cleaned
  }
  const str = (name: string, cap: number) => String(formData.get(name) ?? '').trim().slice(0, cap)
  const count = (name: string) => Math.min(Number(formData.get(name) ?? 0) || 0, 40)

  // Both rosters, so a forged assignee id from the browser never lands.
  const [{ data: clientRoster }, { data: practiceRoster }] = await Promise.all([
    supabaseAdmin.from('client_members').select('id').eq('client_id', proposal.client_id),
    supabaseAdmin.from('practice_members').select('id').eq('practice_id', proposal.practice_id),
  ])
  const clientIds = new Set((clientRoster ?? []).map((m) => m.id))
  const practiceIds = new Set((practiceRoster ?? []).map((m) => m.id))

  const decisions: ReviewDecision[] = []
  for (let i = 0; i < count('dec_count'); i++) {
    const text = sweep(str(`dec_text_${i}`, 500))
    if (!text) continue
    const rawDate = str(`dec_date_${i}`, 10)
    decisions.push({
      text,
      log: formData.get(`dec_log_${i}`) === 'on',
      decided_on: DATE_RE.test(rawDate) ? rawDate : new Date().toISOString().slice(0, 10),
      who: str(`dec_who_${i}`, 120),
    })
  }

  const items: ReviewItem[] = []
  const readItem = (key: string) => {
    const title = sweep(str(`item_title_${key}`, 300))
    if (!title) return
    const rawDisp = str(`item_disp_${key}`, 20)
    const disposition: ItemDisposition =
      rawDisp === 'internal' || rawDisp === 'drop' ? rawDisp : 'homework'
    const [side, memberId] = str(`item_assign_${key}`, 60).split(':')
    const assignedClient =
      disposition === 'homework' && side === 'client' && clientIds.has(memberId) ? memberId : null
    const assignedPractice =
      disposition === 'internal' && side === 'practice' && practiceIds.has(memberId)
        ? memberId
        : null
    const rawDue = str(`item_due_${key}`, 10)
    const rawTiming = str(`item_timing_${key}`, 20)
    items.push({
      title,
      disposition,
      assigned_client_member_id: assignedClient,
      assigned_practice_member_id: assignedPractice,
      due_on: DATE_RE.test(rawDue) ? rawDue : null,
      timing: ['before_session', 'after_session', 'standing'].includes(rawTiming)
        ? rawTiming
        : 'standing',
      // The loop needs a coachee to run it (3C's rule, kept here).
      review_requested:
        formData.get(`item_review_${key}`) === 'on' &&
        disposition === 'homework' &&
        assignedClient != null,
    })
  }
  for (let i = 0; i < count('item_count'); i++) readItem(String(i))
  readItem('new') // the row for what the model missed

  const edited: EditedPayload = {
    summary_md: sweep(str('summary', 8000)),
    decisions,
    action_items: items,
  }

  const stamp = {
    edited_payload: edited as unknown as Record<string, unknown>,
    edited_at: new Date().toISOString(),
    edited_by: viewer.user!.id,
  }

  if (mode === 'draft') {
    const { error } = await supabaseAdmin.from('ai_proposals').update(stamp).eq('id', proposal.id)
    if (error) {
      console.error('[review] draft save failed:', error.message)
      redirect(back(sessionId, 'review_error'))
    }
    revalidatePath(`/sessions/${sessionId}/notes`)
    redirect(back(sessionId, 'draft_saved'))
  }

  // Publish, selectively. The edited copy is stamped first so the
  // record always shows exactly what was reviewed.
  const pubNote = formData.get('pub_note') === 'on'
  const pubDecisions = formData.get('pub_decisions') === 'on'
  const pubItems = formData.get('pub_items') === 'on'

  const { error: stampError } = await supabaseAdmin
    .from('ai_proposals')
    .update(stamp)
    .eq('id', proposal.id)
  if (stampError) {
    console.error('[review] edited stamp failed:', stampError.message)
    redirect(back(sessionId, 'review_error'))
  }

  if (pubNote) {
    const { error: noteError } = await supabaseAdmin
      .from('session_notes')
      .update({
        summary_md: edited.summary_md,
        decisions_md: decisionsBlock(edited.decisions),
        visibility: 'shared',
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', proposal.session_id)
      .eq('practice_id', practiceId)
    if (noteError) {
      console.error('[review] note publish failed:', noteError.message)
      redirect(back(sessionId, 'accept_failed'))
    }
  }

  const logged = pubDecisions ? edited.decisions.filter((d) => d.log) : []
  if (logged.length > 0) {
    const { error: decError } = await supabaseAdmin.from('decisions').insert(
      logged.map((d) => ({
        engagement_id: proposal.engagement_id,
        practice_id: proposal.practice_id,
        client_id: proposal.client_id,
        session_id: proposal.session_id,
        title: d.text.slice(0, 300),
        decided_on: d.decided_on,
        decided_by_label: d.who || null,
        source: 'accepted_proposal',
        proposal_id: proposal.id,
        created_by: viewer.user!.id,
      }))
    )
    if (decError) {
      console.error('[review] decisions insert failed:', decError.message)
      redirect(back(sessionId, 'accept_failed'))
    }
  }

  const kept = pubItems ? edited.action_items.filter((it) => it.disposition !== 'drop') : []
  let publishedHomework: PublishedHomework[] = []
  if (kept.length > 0) {
    const { data: insertedItems, error: itemsError } = await supabaseAdmin.from('action_items').insert(
      kept.map((it) => ({
        engagement_id: proposal.engagement_id,
        practice_id: proposal.practice_id,
        client_id: proposal.client_id,
        session_id: proposal.session_id,
        title: it.title.slice(0, 200),
        assigned_client_member_id: it.assigned_client_member_id,
        assigned_practice_member_id: it.assigned_practice_member_id,
        audience: it.disposition === 'internal' ? 'practice' : 'client',
        review_requested: it.review_requested,
        due_on: it.due_on,
        timing: it.timing,
        status: 'open',
        source: 'accepted_proposal',
        proposal_id: proposal.id,
      }))
    ).select('id, title, assigned_client_member_id, due_on')
    if (itemsError) {
      console.error('[review] items insert failed:', itemsError.message)
      redirect(back(sessionId, 'accept_failed'))
    }
    publishedHomework = (insertedItems ?? [])
      .filter((r) => r.assigned_client_member_id)
      .map((r) => ({
        itemId: r.id,
        clientMemberId: r.assigned_client_member_id as string,
        title: r.title,
        dueOn: r.due_on,
      }))
  }

  await supabaseAdmin
    .from('ai_proposals')
    .update({ status: 'accepted', decided_at: new Date().toISOString(), decided_by: viewer.user!.id })
    .eq('id', proposal.id)

  // The publish-time touch: one email per client member covering the
  // note and their homework together, stamped so the cron never repeats.
  if (pubNote || publishedHomework.length > 0) {
    let dateLabel: string | null = null
    if (pubNote) {
      const { data: s } = await supabaseAdmin
        .from('sessions')
        .select('starts_at, tz')
        .eq('id', proposal.session_id)
        .maybeSingle()
      if (s?.starts_at) {
        try {
          dateLabel = new Date(s.starts_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            timeZone: s.tz ?? 'UTC',
          })
        } catch {
          dateLabel = null
        }
      }
    }
    await sendPublishNotices({
      practiceId: proposal.practice_id,
      clientId: proposal.client_id,
      engagementId: proposal.engagement_id,
      note: pubNote ? { sessionId: proposal.session_id, dateLabel } : undefined,
      homework: publishedHomework,
    })
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    engagementId: proposal.engagement_id,
    practiceId: proposal.practice_id,
    action: 'ai.proposal.publish',
    target: proposal.id,
    detail: {
      note: pubNote,
      decisions: logged.length,
      items: kept.length,
      internal: kept.filter((it) => it.disposition === 'internal').length,
      dropped: edited.action_items.length - (pubItems ? kept.length : 0),
    },
  })

  revalidatePath(`/sessions/${sessionId}/notes`)
  revalidatePath(`/engagements/${proposal.engagement_id}`)
  revalidatePath('/homework')
  revalidatePath('/decisions')
  revalidatePath('/home')
  revalidatePath('/today')
  redirect(back(sessionId, 'published'))
}

// ── The run of show (V2 3B): practice-authored structure ─────────────
// The 0021 column grant strips these columns from the authenticated
// role, so the write rides the service role strictly after the scoped
// check; a client session cannot touch them by construction.

const RunOfShowShape = z.object({
  sessionId: z.string().uuid(),
  purpose: z.string().trim().max(200).optional(),
  agenda: z.string().trim().max(8000).optional(),
  movesWorkstreamId: z.string().uuid().optional(),
  movesToStage: z.string().trim().max(40).optional(),
})

export async function saveRunOfShow(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const clean = (name: string) => {
    const v = String(formData.get(name) ?? '').trim()
    return v || undefined
  }
  const parsed = RunOfShowShape.safeParse({
    sessionId: formData.get('sessionId'),
    purpose: clean('purpose'),
    agenda: clean('agenda'),
    movesWorkstreamId: clean('movesWorkstreamId'),
    movesToStage: clean('movesToStage'),
  })
  if (!parsed.success) redirect('/clients')
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data: session } = await supabase
    .from('sessions')
    .select('id, engagement_id, practice_id')
    .eq('id', d.sessionId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!session) redirect('/clients')

  let movesWorkstream: string | null = null
  if (d.movesWorkstreamId) {
    const { data: ws } = await supabase
      .from('workstreams')
      .select('id')
      .eq('id', d.movesWorkstreamId)
      .eq('engagement_id', session.engagement_id)
      .maybeSingle()
    if (!ws) redirect(back(d.sessionId, 'ros_error'))
    movesWorkstream = d.movesWorkstreamId
  }

  const sweepText = (text: string): string => {
    const check = validateVoice(text)
    if (check.ok) return text
    void logVoiceViolation({
      practiceId: session.practice_id,
      source: 'run_of_show',
      violations: check.violations,
      rawExcerpt: text.slice(0, 400),
      cleanedExcerpt: check.cleaned.slice(0, 400),
    })
    return check.cleaned
  }

  const { error } = await supabaseAdmin
    .from('sessions')
    .update({
      purpose: d.purpose ? sweepText(d.purpose) : null,
      agenda_md: d.agenda ? sweepText(d.agenda) : null,
      moves_workstream_id: movesWorkstream,
      moves_to_stage: movesWorkstream ? (d.movesToStage ?? null) : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id)
    .eq('practice_id', session.practice_id)
  if (error) {
    console.error('[run-of-show] save failed:', error.message)
    redirect(back(d.sessionId, 'ros_error'))
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    engagementId: session.engagement_id,
    practiceId: session.practice_id,
    action: 'session.run_of_show',
    target: session.id,
  })
  revalidatePath(`/sessions/${d.sessionId}/notes`)
  revalidatePath(`/sessions/${d.sessionId}`)
  revalidatePath('/sessions')
  revalidatePath('/home')
  redirect(back(d.sessionId, 'ros_saved'))
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
import { callClaudeChecked } from '@/lib/anthropicClient'
import { AiBudgetExceededError } from '@/lib/spend'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { buildCaseStudyRequest, hasCaseStudyContent, parseCaseStudy } from '@/lib/caseStudy'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'
import { logAuditAction } from '@/lib/audit'
import { clientTeamRecipients, notify } from '@/lib/notify'

/**
 * Case study actions (V2 5C). The fifth propose-then-accept job: the
 * model writes ONLY into ai_proposals (inert, via the service role
 * after the practice check, the extraction pattern), one human accept
 * is the only path into case_studies, and the client approval rides
 * 5D before anything is public. The model never writes the quote.
 */

async function guardPractice() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  return viewer
}

async function scopedEngagement(engagementId: string, practiceId: string) {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id, title, clients(name)')
    .eq('id', engagementId)
    .eq('practice_id', practiceId)
    .maybeSingle()
  return { supabase, engagement: data }
}

/**
 * Re-consent law (review finding, 2026-07-11): the approval covers the
 * TEXT the client read, not the row. Any content change withdraws a
 * pending ask (the charter's withdraw precedent, service role after
 * the scoped check) and drops status back to draft, so the client
 * stops seeing the row and a fresh ask is required before anything
 * is publishable. An already-approved row stays as history: it
 * covers the old text, and the surfaces say so.
 */
async function withdrawPendingAsk(caseStudyId: string): Promise<void> {
  await supabaseAdmin
    .from('approvals')
    .update({ status: 'withdrawn' })
    .eq('subject_type', 'case_study')
    .eq('subject_id', caseStudyId)
    .eq('status', 'pending')
}

function sweep(practiceId: string, text: string, source: string): string {
  const check = validateVoice(text)
  if (check.ok) return text
  void logVoiceViolation({
    practiceId,
    source,
    violations: check.violations,
    rawExcerpt: text.slice(0, 400),
    cleanedExcerpt: check.cleaned.slice(0, 400),
  })
  return check.cleaned
}

export async function draftCaseStudy(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const id = z.string().uuid().safeParse(formData.get('engagementId'))
  if (!id.success) redirect('/engagements')

  const { supabase, engagement } = await scopedEngagement(id.data, viewer.practice!.practiceId)
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/case-study`

  const limited = await checkRateLimits([
    { config: LIMITS.AI_CASE_STUDY_PER_HOUR, key: viewer.user!.id },
  ])
  if (!limited.ok) redirect(`${back}?state=slow`)

  // The record, read under the practice session.
  const [charter, outcomes, decisions, deliverables, closeout] = await Promise.all([
    supabase
      .from('engagement_charters')
      .select('body_md')
      .eq('engagement_id', engagement.id)
      .eq('status', 'published')
      .maybeSingle(),
    supabase
      .from('outcomes')
      .select('title, baseline_md, target_md, standing_md, reached_on')
      .eq('engagement_id', engagement.id)
      .order('sort'),
    supabase
      .from('decisions')
      .select('title, decided_on')
      .eq('engagement_id', engagement.id)
      .order('decided_on'),
    supabase
      .from('deliverables')
      .select('title, about_md, delivered_on')
      .eq('engagement_id', engagement.id)
      .order('delivered_on'),
    supabase
      .from('closeouts')
      .select('breaks_md, ownership_md, maintenance_md, training_md, risks_md, next_md')
      .eq('engagement_id', engagement.id)
      .eq('status', 'published')
      .maybeSingle(),
  ])

  const facts = {
    charter: charter.data?.body_md ?? null,
    outcomes: (outcomes.data ?? []).map(
      (o) =>
        `${o.title}${o.reached_on ? ` (reached ${o.reached_on})` : ''}${o.baseline_md ? `; baseline: ${o.baseline_md}` : ''}${o.standing_md ? `; standing: ${o.standing_md}` : ''}`
    ),
    decisions: (decisions.data ?? []).map((d) => `${d.decided_on}: ${d.title}`),
    deliverables: (deliverables.data ?? []).map(
      (d) => `${d.title}${d.about_md ? `: ${d.about_md}` : ''}`
    ),
    closeoutSections: closeout.data
      ? Object.values(closeout.data).filter((v): v is string => Boolean(v))
      : [],
  }
  if (!hasCaseStudyContent(facts)) redirect(`${back}?state=thin_record`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientName = ((engagement.clients as any)?.name as string) ?? 'the client'
  const request = buildCaseStudyRequest(facts, {
    clientName,
    engagementTitle: engagement.title,
  })

  let result
  try {
    result = await callClaudeChecked({
      ...request,
      practiceId: engagement.practice_id,
      engagementId: engagement.id,
    })
  } catch (err) {
    if (err instanceof AiBudgetExceededError) redirect(`${back}?state=budget`)
    console.error('[case-study] model call failed:', err instanceof Error ? err.message : 'unknown')
    redirect(`${back}?state=draft_failed`)
  }

  const draft = parseCaseStudy(result.data)
  if (!draft) redirect(`${back}?state=draft_failed`)

  // The voice gate at the boundary, then the ONE write: inert.
  draft.title = sweep(engagement.practice_id, draft.title, 'case_study')
  draft.body_md = sweep(engagement.practice_id, draft.body_md, 'case_study')
  const { error } = await supabaseAdmin.from('ai_proposals').insert({
    kind: 'case_study',
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    payload: { title: draft.title, body_md: draft.body_md },
    model_used: result.modelUsed,
  })
  if (error) {
    console.error('[case-study] proposal insert failed:', error.message)
    redirect(`${back}?state=draft_failed`)
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'case_study.drafted',
    target: engagement.id,
    engagementId: engagement.id,
    practiceId: engagement.practice_id,
  })
  revalidatePath(back)
  redirect(`${back}?state=drafted`)
}

const ProposalShape = z.object({
  engagementId: z.string().uuid(),
  proposalId: z.string().uuid(),
})

export async function decideCaseStudyProposal(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = ProposalShape.extend({ decision: z.enum(['accept', 'dismiss']) }).safeParse({
    engagementId: formData.get('engagementId'),
    proposalId: formData.get('proposalId'),
    decision: formData.get('decision'),
  })
  if (!parsed.success) redirect('/engagements')

  const { engagement } = await scopedEngagement(parsed.data.engagementId, viewer.practice!.practiceId)
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/case-study`

  const { data: proposal } = await supabaseAdmin
    .from('ai_proposals')
    .select('id, kind, status, payload')
    .eq('id', parsed.data.proposalId)
    .eq('engagement_id', engagement.id)
    .eq('kind', 'case_study')
    .maybeSingle()
  if (!proposal || proposal.status !== 'proposed') redirect(`${back}?state=proposal_gone`)

  if (parsed.data.decision === 'dismiss') {
    await supabaseAdmin
      .from('ai_proposals')
      .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: viewer.user!.id })
      .eq('id', proposal.id)
    redirect(`${back}?state=dismissed`)
  }

  const payload = proposal.payload as { title?: string; body_md?: string }
  if (!payload?.title) redirect(`${back}?state=proposal_gone`)

  // The one human accept: the draft graduates to the editable row,
  // riding the session client under keystone_can. New content means
  // any prior consent no longer covers it: withdraw a pending ask and
  // land as a draft needing a fresh approval.
  const supabase = await createServerSupabase()
  const { data: existingRow } = await supabase
    .from('case_studies')
    .select('id')
    .eq('engagement_id', engagement.id)
    .maybeSingle()
  if (existingRow) await withdrawPendingAsk(existingRow.id)
  const { error } = await supabase.from('case_studies').upsert(
    {
      engagement_id: engagement.id,
      practice_id: engagement.practice_id,
      client_id: engagement.client_id,
      title: payload.title,
      body_md: payload.body_md ?? '',
      status: 'draft',
      proposal_id: proposal.id,
      created_by: viewer.user!.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'engagement_id' }
  )
  if (error) {
    console.error('[case-study] accept failed:', error.message)
    redirect(`${back}?state=error`)
  }
  await supabaseAdmin
    .from('ai_proposals')
    .update({ status: 'accepted', decided_at: new Date().toISOString(), decided_by: viewer.user!.id })
    .eq('id', proposal.id)
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'case_study.accepted',
    target: engagement.id,
    engagementId: engagement.id,
    practiceId: engagement.practice_id,
  })
  revalidatePath(back)
  redirect(`${back}?state=accepted`)
}

const SaveShape = z.object({
  engagementId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000),
  quote: z.string().max(2000),
})

export async function saveCaseStudy(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = SaveShape.safeParse({
    engagementId: formData.get('engagementId'),
    title: formData.get('title'),
    body: String(formData.get('body') ?? ''),
    quote: String(formData.get('quote') ?? ''),
  })
  if (!parsed.success) redirect('/engagements')

  const { supabase, engagement } = await scopedEngagement(
    parsed.data.engagementId,
    viewer.practice!.practiceId
  )
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/case-study`

  // The quote is captured by hand from the client's own words, never
  // model-written; it is swept like everything else. An edit changes
  // the text consent covered: withdraw a pending ask and drop to
  // draft, so approval always matches what the client actually read.
  const { data: existingRow } = await supabase
    .from('case_studies')
    .select('id')
    .eq('engagement_id', engagement.id)
    .maybeSingle()
  if (existingRow) await withdrawPendingAsk(existingRow.id)
  const { error } = await supabase.from('case_studies').upsert(
    {
      engagement_id: engagement.id,
      practice_id: engagement.practice_id,
      client_id: engagement.client_id,
      title: sweep(engagement.practice_id, parsed.data.title, 'case_study'),
      body_md: sweep(engagement.practice_id, parsed.data.body, 'case_study'),
      quote_md: parsed.data.quote.trim() || null,
      status: 'draft',
      created_by: viewer.user!.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'engagement_id' }
  )
  if (error) {
    console.error('[case-study] save failed:', error.message)
    redirect(`${back}?state=error`)
  }
  revalidatePath(back)
  redirect(`${back}?state=saved`)
}

export async function requestCaseStudyApproval(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const id = z.string().uuid().safeParse(formData.get('engagementId'))
  if (!id.success) redirect('/engagements')

  const { supabase, engagement } = await scopedEngagement(id.data, viewer.practice!.practiceId)
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/case-study`

  const { data: row } = await supabase
    .from('case_studies')
    .select('id, status')
    .eq('engagement_id', engagement.id)
    .maybeSingle()
  if (!row) redirect(`${back}?state=nothing_saved`)

  const { data: latest } = await supabase
    .from('approvals')
    .select('id, status')
    .eq('subject_type', 'case_study')
    .eq('subject_id', row.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  // A live ask stands; an approval of the UNCHANGED text stands. An
  // edited study (status back at draft) may ask again: the old
  // approval covers the old text only.
  if (latest?.status === 'pending') redirect(`${back}?state=already_asked`)
  if (latest?.status === 'approved' && row.status === 'client_review') {
    redirect(`${back}?state=already_asked`)
  }

  const { error: statusError } = await supabase
    .from('case_studies')
    .update({ status: 'client_review', updated_at: new Date().toISOString() })
    .eq('id', row.id)
  if (statusError) redirect(`${back}?state=error`)

  const { error } = await supabase.from('approvals').insert({
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    engagement_id: engagement.id,
    subject_type: 'case_study',
    subject_id: row.id,
    subject_label: 'the case study, before anything becomes public',
    requested_by: viewer.user!.id,
  })
  if (error) redirect(`${back}?state=error`)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'case_study.approval_requested',
    target: engagement.id,
    engagementId: engagement.id,
    practiceId: engagement.practice_id,
  })
  await notify(
    {
      practiceId: engagement.practice_id,
      clientId: engagement.client_id,
      engagementId: engagement.id,
      kind: 'approval_waiting',
      title: 'Your approval is asked: the case study',
      href: '/case-study',
    },
    await clientTeamRecipients(engagement.client_id)
  )
  revalidatePath(back)
  redirect(`${back}?state=asked`)
}

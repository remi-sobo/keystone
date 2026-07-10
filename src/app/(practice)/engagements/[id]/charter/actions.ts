'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'
import { logAuditAction } from '@/lib/audit'

/**
 * Charter actions (V2 2A, specs/keystone-v2-charter.md). Draft saves
 * ride the SESSION client so the drafts-only RLS update policy stays
 * the wall; the publish transition (supersede the previous version,
 * withdraw its pending sign-off, publish the draft, request the new
 * sign-off) rides the service role strictly after the scoped check,
 * because published rows are immutable to every session by design.
 */

const IdShape = z.string().uuid()

async function guardPractice() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  return viewer
}

async function scopedEngagement(engagementId: string, practiceId: string) {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id, title')
    .eq('id', engagementId)
    .eq('practice_id', practiceId)
    .maybeSingle()
  return data
}

function sweep(practiceId: string, body: string): string {
  const check = validateVoice(body)
  if (check.ok) return body
  void logVoiceViolation({
    practiceId,
    source: 'charter_editor',
    violations: check.violations,
    rawExcerpt: body.slice(0, 400),
    cleanedExcerpt: check.cleaned.slice(0, 400),
  })
  return check.cleaned
}

export async function saveCharterDraft(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const engagementId = IdShape.safeParse(formData.get('engagementId'))
  const body = z.string().min(1).max(60000).safeParse(formData.get('body'))
  if (!engagementId.success || !body.success) redirect('/engagements')

  const engagement = await scopedEngagement(engagementId.data, viewer.practice!.practiceId)
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/charter`

  const swept = sweep(engagement.practice_id, body.data)
  const supabase = await createServerSupabase()
  const { data: existing } = await supabase
    .from('engagement_charters')
    .select('id, version')
    .eq('engagement_id', engagement.id)
    .eq('status', 'draft')
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('engagement_charters')
      .update({ body_md: swept, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) redirect(`${back}?state=error`)
  } else {
    const { data: latest } = await supabase
      .from('engagement_charters')
      .select('version')
      .eq('engagement_id', engagement.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await supabase.from('engagement_charters').insert({
      engagement_id: engagement.id,
      practice_id: engagement.practice_id,
      client_id: engagement.client_id,
      version: (latest?.version ?? 0) + 1,
      body_md: swept,
      status: 'draft',
      created_by: viewer.user!.id,
    })
    if (error) redirect(`${back}?state=error`)
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'charter.draft_saved',
    target: engagement.id,
  })
  revalidatePath(back)
  redirect(`${back}?state=saved`)
}

export async function publishCharter(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const engagementId = IdShape.safeParse(formData.get('engagementId'))
  if (!engagementId.success) redirect('/engagements')

  const engagement = await scopedEngagement(engagementId.data, viewer.practice!.practiceId)
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/charter`

  const supabase = await createServerSupabase()
  const [{ data: draft }, { data: current }] = await Promise.all([
    supabase
      .from('engagement_charters')
      .select('id, version, body_md')
      .eq('engagement_id', engagement.id)
      .eq('status', 'draft')
      .maybeSingle(),
    supabase
      .from('engagement_charters')
      .select('id, version')
      .eq('engagement_id', engagement.id)
      .eq('status', 'published')
      .maybeSingle(),
  ])
  if (!draft || !draft.body_md.trim()) redirect(`${back}?state=no_draft`)

  // The transition, service role after the checks above. Sequenced so a
  // failure partway leaves an honest state: a withdrawn request or a
  // superseded version without a successor is visible and repairable,
  // never a leak.
  if (current) {
    await supabaseAdmin
      .from('approvals')
      .update({ status: 'withdrawn' })
      .eq('subject_type', 'charter')
      .eq('subject_id', current.id)
      .eq('status', 'pending')
    const { error: supersedeError } = await supabaseAdmin
      .from('engagement_charters')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('id', current.id)
    if (supersedeError) redirect(`${back}?state=error`)
  }

  const { error: publishError } = await supabaseAdmin
    .from('engagement_charters')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      published_by: viewer.user!.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.id)
  if (publishError) {
    console.error('[charter] publish failed:', publishError.message)
    redirect(`${back}?state=error`)
  }

  // The sign-off request goes out with the new version (5D). Sign-off
  // binds to the version that was read, so the old request is already
  // withdrawn above.
  const { error: approvalError } = await supabaseAdmin.from('approvals').insert({
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    engagement_id: engagement.id,
    subject_type: 'charter',
    subject_id: draft.id,
    subject_label: `the engagement charter, version ${draft.version}`,
    requested_by: viewer.user!.id,
  })
  if (approvalError) console.error('[charter] sign-off request failed:', approvalError.message)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'charter.published',
    target: engagement.id,
    detail: { version: draft.version, superseded: current?.version ?? null },
  })
  revalidatePath(back)
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/charter')
  revalidatePath('/home')
  redirect(`${back}?state=published`)
}

export async function requestCharterSignoff(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const engagementId = IdShape.safeParse(formData.get('engagementId'))
  if (!engagementId.success) redirect('/engagements')

  const engagement = await scopedEngagement(engagementId.data, viewer.practice!.practiceId)
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/charter`

  const supabase = await createServerSupabase()
  const { data: current } = await supabase
    .from('engagement_charters')
    .select('id, version')
    .eq('engagement_id', engagement.id)
    .eq('status', 'published')
    .maybeSingle()
  if (!current) redirect(`${back}?state=no_published`)

  const { data: existing } = await supabase
    .from('approvals')
    .select('id')
    .eq('subject_type', 'charter')
    .eq('subject_id', current.id)
    .in('status', ['pending', 'approved'])
    .limit(1)
    .maybeSingle()
  if (existing) redirect(`${back}?state=already_asked`)

  // The request rides the session client: the approvals insert policy
  // (engagement.write) is the wall.
  const { error } = await supabase.from('approvals').insert({
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    engagement_id: engagement.id,
    subject_type: 'charter',
    subject_id: current.id,
    subject_label: `the engagement charter, version ${current.version}`,
    requested_by: viewer.user!.id,
  })
  if (error) redirect(`${back}?state=error`)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'charter.signoff_requested',
    target: engagement.id,
    detail: { version: current.version },
  })
  revalidatePath(back)
  redirect(`${back}?state=asked`)
}

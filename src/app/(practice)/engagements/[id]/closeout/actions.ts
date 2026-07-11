'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'
import { logAuditAction } from '@/lib/audit'
import { clientTeamRecipients, notify } from '@/lib/notify'

/**
 * Closeout actions (V2 5A, specs/keystone-v2-closeout.md). Everything
 * rides the SESSION client: the closeouts policies (engagement.write
 * to write, published-only for client reads) are the wall. Draft
 * saves are invisible to the client by policy; publish is the
 * deliberate moment; the sign-off rides the 5D approvals primitive
 * unchanged.
 */

const SECTIONS = [
  'risks',
  'ownership',
  'maintenance',
  'training',
  'breaks',
  'next',
] as const

const SaveShape = z.object({
  engagementId: z.string().uuid(),
  risks: z.string().max(8000),
  ownership: z.string().max(8000),
  maintenance: z.string().max(8000),
  training: z.string().max(8000),
  breaks: z.string().max(8000),
  next: z.string().max(8000),
})

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
  return { supabase, engagement: data }
}

function sweep(practiceId: string, body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return null
  const check = validateVoice(trimmed)
  if (check.ok) return trimmed
  void logVoiceViolation({
    practiceId,
    source: 'closeout_editor',
    violations: check.violations,
    rawExcerpt: trimmed.slice(0, 400),
    cleanedExcerpt: check.cleaned.slice(0, 400),
  })
  return check.cleaned
}

export async function saveCloseout(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = SaveShape.safeParse({
    engagementId: formData.get('engagementId'),
    ...Object.fromEntries(SECTIONS.map((s) => [s, String(formData.get(s) ?? '')])),
  })
  if (!parsed.success) redirect('/engagements')

  const { supabase, engagement } = await scopedEngagement(
    parsed.data.engagementId,
    viewer.practice!.practiceId
  )
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/closeout`

  const sections = {
    risks_md: sweep(engagement.practice_id, parsed.data.risks),
    ownership_md: sweep(engagement.practice_id, parsed.data.ownership),
    maintenance_md: sweep(engagement.practice_id, parsed.data.maintenance),
    training_md: sweep(engagement.practice_id, parsed.data.training),
    breaks_md: sweep(engagement.practice_id, parsed.data.breaks),
    next_md: sweep(engagement.practice_id, parsed.data.next),
  }
  const { error } = await supabase.from('closeouts').upsert(
    {
      engagement_id: engagement.id,
      practice_id: engagement.practice_id,
      client_id: engagement.client_id,
      ...sections,
      created_by: viewer.user!.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'engagement_id' }
  )
  if (error) {
    console.error('[closeout] save failed:', error.message)
    redirect(`${back}?state=error`)
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'closeout.saved',
    target: engagement.id,
    engagementId: engagement.id,
    practiceId: engagement.practice_id,
  })
  revalidatePath(back)
  redirect(`${back}?state=saved`)
}

export async function publishCloseout(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const id = z.string().uuid().safeParse(formData.get('engagementId'))
  if (!id.success) redirect('/engagements')

  const { supabase, engagement } = await scopedEngagement(id.data, viewer.practice!.practiceId)
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/closeout`

  const { data: row } = await supabase
    .from('closeouts')
    .select('id, status')
    .eq('engagement_id', engagement.id)
    .maybeSingle()
  if (!row) redirect(`${back}?state=nothing_saved`)
  if (row.status === 'published') redirect(`${back}?state=already_published`)

  const { error } = await supabase
    .from('closeouts')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', row.id)
  if (error) {
    console.error('[closeout] publish failed:', error.message)
    redirect(`${back}?state=error`)
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'closeout.published',
    target: engagement.id,
    engagementId: engagement.id,
    practiceId: engagement.practice_id,
  })
  await notify(
    {
      practiceId: engagement.practice_id,
      clientId: engagement.client_id,
      engagementId: engagement.id,
      kind: 'closeout_published',
      title: 'The closeout room is open: what stands, and how to keep it standing',
      href: '/closeout',
    },
    await clientTeamRecipients(engagement.client_id)
  )
  revalidatePath(back)
  revalidatePath('/closeout')
  redirect(`${back}?state=published`)
}

export async function requestCloseoutSignoff(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const id = z.string().uuid().safeParse(formData.get('engagementId'))
  if (!id.success) redirect('/engagements')

  const { supabase, engagement } = await scopedEngagement(id.data, viewer.practice!.practiceId)
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}/closeout`

  const { data: row } = await supabase
    .from('closeouts')
    .select('id, status')
    .eq('engagement_id', engagement.id)
    .eq('status', 'published')
    .maybeSingle()
  if (!row) redirect(`${back}?state=publish_first`)

  const { data: existing } = await supabase
    .from('approvals')
    .select('id')
    .eq('subject_type', 'closeout')
    .eq('subject_id', row.id)
    .in('status', ['pending', 'approved'])
    .limit(1)
    .maybeSingle()
  if (existing) redirect(`${back}?state=already_asked`)

  const { error } = await supabase.from('approvals').insert({
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    engagement_id: engagement.id,
    subject_type: 'closeout',
    subject_id: row.id,
    subject_label: 'the closeout: it stands without us',
    requested_by: viewer.user!.id,
  })
  if (error) redirect(`${back}?state=error`)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'closeout.signoff_requested',
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
      title: 'Your sign-off is asked: the closeout',
      href: '/closeout',
    },
    await clientTeamRecipients(engagement.client_id)
  )
  revalidatePath(back)
  redirect(`${back}?state=asked`)
}

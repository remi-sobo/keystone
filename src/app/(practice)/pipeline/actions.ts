'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { logAuditAction } from '@/lib/audit'

/**
 * Pipeline actions (V2 4G). Product-tier, behind the practice flag
 * SOBO leaves off (CONFIRM V2-5). Every action FAILS CLOSED on the
 * flag, re-read server-side: page copy is not enforcement. Writes ride
 * keystone_can on the session client; no money ever passes through
 * here because the table has nowhere to put it.
 */

const STAGES = ['lead', 'discovery', 'proposal', 'verbal_yes', 'paused', 'closed'] as const

async function guardPipeline() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  const supabase = await createServerSupabase()
  const { data: practice } = await supabase
    .from('practices')
    .select('pipeline_enabled')
    .eq('id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!practice?.pipeline_enabled) redirect('/today')
  return { viewer, supabase }
}

const AddShape = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  note: z.string().trim().max(4000).optional(),
})

export async function addDeal(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardPipeline()
  const parsed = AddShape.safeParse({
    name: formData.get('name'),
    contactName: String(formData.get('contactName') ?? '').trim() || undefined,
    contactEmail: String(formData.get('contactEmail') ?? '').trim() || undefined,
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/pipeline?state=deal_invalid')
  const { error } = await supabase.from('deals').insert({
    practice_id: viewer.practice!.practiceId,
    name: parsed.data.name,
    contact_name: parsed.data.contactName ?? null,
    contact_email: parsed.data.contactEmail || null,
    note_md: parsed.data.note ?? null,
    created_by: viewer.user!.id,
  })
  if (error) {
    console.error('[pipeline] add failed:', error.message)
    redirect('/pipeline?state=deal_error')
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'pipeline.deal_added',
    practiceId: viewer.practice!.practiceId,
  })
  redirect('/pipeline?state=deal_added')
}

const MoveShape = z.object({
  dealId: z.string().uuid(),
  stage: z.enum(STAGES),
})

export async function moveDeal(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardPipeline()
  const parsed = MoveShape.safeParse({
    dealId: formData.get('dealId'),
    stage: formData.get('stage'),
  })
  if (!parsed.success) redirect('/pipeline?state=deal_invalid')
  const { error } = await supabase
    .from('deals')
    .update({ stage: parsed.data.stage, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.dealId)
    .eq('practice_id', viewer.practice!.practiceId)
    .neq('stage', 'converted')
  if (error) {
    console.error('[pipeline] move failed:', error.message)
    redirect('/pipeline?state=deal_error')
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'pipeline.deal_moved',
    target: parsed.data.dealId,
    detail: { to: parsed.data.stage },
    practiceId: viewer.practice!.practiceId,
  })
  redirect('/pipeline?state=deal_moved')
}

/**
 * A won deal becomes an engagement DRAFT (gate 4G-3): the builder is
 * the one door into the system of record. The deal keeps the receipt.
 */
export async function convertDeal(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardPipeline()
  const id = z.string().uuid().safeParse(formData.get('dealId'))
  if (!id.success) redirect('/pipeline?state=deal_invalid')

  const { data: deal } = await supabase
    .from('deals')
    .select('id, name, stage')
    .eq('id', id.data)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!deal || deal.stage !== 'verbal_yes') redirect('/pipeline?state=deal_not_ready')

  const { data: draft, error: draftError } = await supabase
    .from('engagement_drafts')
    .insert({
      practice_id: viewer.practice!.practiceId,
      title: deal.name,
      created_by: viewer.user!.id,
    })
    .select('id')
    .single()
  if (draftError || !draft) {
    console.error('[pipeline] draft create failed:', draftError?.message)
    redirect('/pipeline?state=deal_error')
  }
  const { error: stampError } = await supabase
    .from('deals')
    .update({
      stage: 'converted',
      engagement_draft_id: draft.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deal.id)
  if (stampError) console.error('[pipeline] convert stamp failed:', stampError.message)
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'pipeline.deal_converted',
    target: deal.id,
    practiceId: viewer.practice!.practiceId,
  })
  redirect(`/engagements/drafts/${draft.id}`)
}

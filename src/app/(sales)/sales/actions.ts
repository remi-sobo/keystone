'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { verdictFromError } from '@/lib/sales'

/**
 * Sales actions (specs/keystone-sales.md, Ring 1). PURE RLS: the scope
 * comes from the membership row, the write goes through the session
 * client, and the collision guard lives in the database, so this file
 * has no wall of its own to get wrong.
 *
 * Registration is the ONLY path to a prospect existing (failure mode 4
 * in the spec), so there is no edit-org-name action and no create-deal
 * action here. Recording a signed amount and a payment received is the
 * practice's act, on the practice surface.
 */

async function guardSales() {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (!viewer.sales) redirect('/')
  const supabase = await createServerSupabase()
  return { viewer, supabase }
}

const RegisterShape = z.object({
  orgName: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  source: z.string().trim().max(200).optional(),
  note: z.string().trim().max(4000).optional(),
})

export async function registerProspect(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardSales()
  const parsed = RegisterShape.safeParse({
    orgName: formData.get('orgName'),
    contactName: String(formData.get('contactName') ?? '').trim() || undefined,
    contactEmail: String(formData.get('contactEmail') ?? '').trim() || undefined,
    source: String(formData.get('source') ?? '').trim() || undefined,
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/sales?state=invalid')

  const { error } = await supabase.from('sales_prospects').insert({
    practice_id: viewer.sales!.practiceId,
    org_name: parsed.data.orgName,
    contact_name: parsed.data.contactName ?? null,
    contact_email: parsed.data.contactEmail || null,
    source: parsed.data.source ?? null,
    note: parsed.data.note ?? null,
    // Self-authorship, mirrored by the insert policy: a registration
    // filed in someone else's name is refused by RLS, not by trust.
    registered_by: viewer.user!.id,
  })

  if (error) {
    // The database raised a named collision. Say the same thing the
    // live check says, so the form reads consistently whichever layer
    // caught it.
    const verdict = verdictFromError(error.message)
    if (verdict) redirect(`/sales?state=${verdict}`)
    console.error('[sales] registration failed:', error.message)
    redirect('/sales?state=error')
  }

  redirect('/sales?state=registered')
}

const ReleaseShape = z.object({ prospectId: z.string().uuid() })

/**
 * Release a registration he no longer wants to hold. The row stays (a
 * registration is a timestamp record in a disagreement, never an
 * erasure); only the claim lifts, which frees the org for someone else.
 */
export async function releaseProspect(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardSales()
  const parsed = ReleaseShape.safeParse({ prospectId: formData.get('prospectId') })
  if (!parsed.success) redirect('/sales?state=invalid')

  const { error } = await supabase
    .from('sales_prospects')
    .update({ status: 'released', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.prospectId)
    .eq('registered_by', viewer.user!.id)
    .eq('status', 'registered')
  if (error) {
    console.error('[sales] release failed:', error.message)
    redirect('/sales?state=error')
  }
  redirect('/sales?state=released')
}

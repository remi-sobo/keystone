'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'

/**
 * The pin (specs/epayl-fundraising-hub.md, the IA revision): Kendra
 * can pin her own move into any of HOME's three slots, and the pin
 * holds until she unpins it. Only a real task pins; the rule-chosen
 * moves fill whatever slots are free.
 */

export async function pinTask(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const taskId = z.string().uuid().safeParse(formData.get('task_id'))
  const slot = z.coerce.number().int().min(1).max(3).safeParse(formData.get('slot'))
  if (!taskId.success || !slot.success) redirect(`/${orgSlug}`)
  const supabase = await createServerSupabase()
  // One pin per slot: whoever held it steps aside first.
  await supabase
    .from('hub_tasks')
    .update({ pinned_slot: null })
    .eq('org_id', hub.orgId)
    .eq('pinned_slot', slot.data)
  await supabase
    .from('hub_tasks')
    .update({ pinned_slot: slot.data })
    .eq('org_id', hub.orgId)
    .eq('id', taskId.data)
    .is('done_at', null)
  revalidatePath(`/${orgSlug}`)
  redirect(`/${orgSlug}`)
}

export async function unpinTask(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const taskId = z.string().uuid().safeParse(formData.get('task_id'))
  if (!taskId.success) redirect(`/${orgSlug}`)
  const supabase = await createServerSupabase()
  await supabase
    .from('hub_tasks')
    .update({ pinned_slot: null })
    .eq('org_id', hub.orgId)
    .eq('id', taskId.data)
  revalidatePath(`/${orgSlug}`)
  redirect(`/${orgSlug}`)
}

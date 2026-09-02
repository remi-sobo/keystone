'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { checkRateLimits } from '@/lib/rateLimit'

/**
 * WORK's server actions (specs/epayl-fundraising-hub.md, phase four).
 * Pure RLS like everything beneath the hub surface. A task's estimate
 * is optional by decision: requiring a duration on every task means
 * she stops entering tasks.
 */

const WRITE_PER_MIN = { kind: 'hub:write:min', windowMs: 60 * 1000, max: 30 }

const TaskShape = z.object({
  title: z.string().trim().min(1).max(300),
  why: z.string().trim().max(1000).optional(),
  owner: z.string().trim().max(120).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  strategy_id: z.string().uuid().optional().or(z.literal('')),
})

export async function addTask(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const back = `/${orgSlug}/work`
  const limited = await checkRateLimits([{ config: WRITE_PER_MIN, key: hub.orgId }])
  if (!limited.ok) redirect(`${back}?state=slow`)
  const parsed = TaskShape.safeParse({
    title: formData.get('title'),
    why: formData.get('why') ?? undefined,
    owner: formData.get('owner') ?? undefined,
    due_date: formData.get('due_date') ?? undefined,
    strategy_id: formData.get('strategy_id') ?? undefined,
  })
  if (!parsed.success) redirect(`${back}?state=invalid`)
  const supabase = await createServerSupabase()
  const { error } = await supabase.from('hub_tasks').insert({
    org_id: hub.orgId,
    practice_id: hub.practiceId,
    title: parsed.data.title,
    why: parsed.data.why || null,
    owner: parsed.data.owner || null,
    due_date: parsed.data.due_date || null,
    strategy_id: parsed.data.strategy_id || null,
    source: 'manual',
  })
  if (error) {
    console.error('[hub work] task insert failed:', error.message)
    redirect(`${back}?state=error`)
  }
  revalidatePath(back)
  redirect(back)
}

export async function doneTask(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const taskId = z.string().uuid().safeParse(formData.get('task_id'))
  if (!taskId.success) redirect(`/${orgSlug}/work`)
  const supabase = await createServerSupabase()
  await supabase
    .from('hub_tasks')
    .update({ done_at: new Date().toISOString() })
    .eq('org_id', hub.orgId)
    .eq('id', taskId.data)
    .is('done_at', null)
  revalidatePath(`/${orgSlug}/work`)
  redirect(`/${orgSlug}/work`)
}

export async function reopenTask(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const taskId = z.string().uuid().safeParse(formData.get('task_id'))
  if (!taskId.success) redirect(`/${orgSlug}/work`)
  const supabase = await createServerSupabase()
  await supabase
    .from('hub_tasks')
    .update({ done_at: null })
    .eq('org_id', hub.orgId)
    .eq('id', taskId.data)
  revalidatePath(`/${orgSlug}/work`)
  redirect(`/${orgSlug}/work`)
}

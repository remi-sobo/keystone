'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

/**
 * Homework check-off (client surface, PURE RLS). The one client write
 * besides booking: the action_items_checkoff policy admits only rows
 * assigned to the caller's own membership, so a hand-crafted POST at a
 * teammate's item updates zero rows.
 */

const Shape = z.object({
  id: z.string().uuid(),
  to: z.enum(['done', 'open']),
})

export async function setHomeworkStatus(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const parsed = Shape.safeParse({ id: formData.get('id'), to: formData.get('to') })
  if (!parsed.success) redirect('/homework')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('action_items')
    .update({
      status: parsed.data.to,
      done_at: parsed.data.to === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.id)
    .eq('client_id', viewer.client.clientId)
  if (error) console.error('[homework] check-off failed:', error.code)

  revalidatePath('/homework')
  revalidatePath('/home')
}

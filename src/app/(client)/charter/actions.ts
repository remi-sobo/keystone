'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

/**
 * The client's sign-off (V2 5D). PURE RLS, like everything on this
 * surface: the update rides the session client, the pending-only
 * policy and the column grant are the wall, and the decider's identity
 * is stamped by the database trigger from the verified JWT. No service
 * role, ever, on this surface.
 */

const DecideShape = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(['approved', 'not_yet']),
  note: z.string().max(2000).optional(),
})

export async function decideApproval(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const parsed = DecideShape.safeParse({
    approvalId: formData.get('approvalId'),
    decision: formData.get('decision'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/charter?state=invalid')

  const supabase = await createServerSupabase()
  const { error, count } = await supabase
    .from('approvals')
    .update(
      { status: parsed.data.decision, note_md: parsed.data.note ?? null },
      { count: 'exact' }
    )
    .eq('id', parsed.data.approvalId)
    .eq('client_id', viewer.client.clientId)
    .eq('status', 'pending')
  if (error || !count) {
    console.error('[charter] decide failed:', error?.message ?? 'no pending row')
    redirect('/charter?state=error')
  }

  revalidatePath('/charter')
  revalidatePath('/home')
  redirect(`/charter?state=${parsed.data.decision === 'approved' ? 'approved' : 'noted'}`)
}

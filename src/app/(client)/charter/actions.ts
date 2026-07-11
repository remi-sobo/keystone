'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { notify, practiceTeamRecipients } from '@/lib/notify'

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
  // The surface to return to; approvals decide on several pages now.
  back: z.enum(['/charter', '/deliverables', '/closeout', '/case-study']).default('/charter'),
})

export async function decideApproval(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const parsed = DecideShape.safeParse({
    approvalId: formData.get('approvalId'),
    decision: formData.get('decision'),
    note: String(formData.get('note') ?? '').trim() || undefined,
    back: formData.get('back') ?? undefined,
  })
  if (!parsed.success) redirect('/charter?state=invalid')
  const back = parsed.data.back

  // Not-yet without words is a shrug; the note is required (3D keeps
  // the charter's looser manners since a signature needs no reason;
  // the closeout follows the deliverable rule: refusing an ending
  // deserves a reason).
  if (back !== '/charter' && parsed.data.decision === 'not_yet' && !parsed.data.note) {
    redirect(`${back}?state=note_needed`)
  }

  const supabase = await createServerSupabase()
  const { data: approval } = await supabase
    .from('approvals')
    .select('id, subject_label, practice_id, client_id, engagement_id')
    .eq('id', parsed.data.approvalId)
    .eq('client_id', viewer.client.clientId)
    .eq('status', 'pending')
    .maybeSingle()
  if (!approval) redirect(`${back}?state=error`)

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
    console.error('[approvals] decide failed:', error?.message ?? 'no pending row')
    redirect(`${back}?state=error`)
  }

  // 4F: the decision comes back to the practice in the daily batch.
  await notify(
    {
      practiceId: approval.practice_id,
      clientId: approval.client_id,
      engagementId: approval.engagement_id,
      kind: 'approval_decided',
      title: `${parsed.data.decision === 'approved' ? 'Accepted' : 'Not yet'}: ${approval.subject_label}`,
      href: `/engagements/${approval.engagement_id}`,
    },
    await practiceTeamRecipients(approval.practice_id)
  )

  revalidatePath('/charter')
  revalidatePath('/deliverables')
  revalidatePath('/home')
  redirect(`${back}?state=${parsed.data.decision === 'approved' ? 'approved' : 'noted'}`)
}

// ── Change orders (V2 5E) ────────────────────────────────────────────
// The pressure valve for the boundary: the ask in writing, pure RLS
// (the insert policy admits only a self-authored, open, unanswered ask
// on the client's own engagement). No numbers here, by design.

const ChangeOrderShape = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).optional(),
})

export async function requestChangeOrder(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const parsed = ChangeOrderShape.safeParse({
    title: formData.get('title'),
    description: String(formData.get('description') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/charter?state=co_invalid')

  const supabase = await createServerSupabase()
  const [{ data: engagement }, { data: me }] = await Promise.all([
    supabase
      .from('engagements')
      .select('id, practice_id, client_id')
      .eq('client_id', viewer.client.clientId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('id')
      .eq('user_id', viewer.user.id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
  ])
  if (!engagement || !me) redirect('/charter?state=co_error')

  const { error } = await supabase.from('change_orders').insert({
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    title: parsed.data.title,
    description_md: parsed.data.description ?? null,
    requested_by_client_member_id: me.id,
  })
  if (error) {
    console.error('[change-orders] request failed:', error.code)
    redirect('/charter?state=co_error')
  }
  await notify(
    {
      practiceId: engagement.practice_id,
      clientId: engagement.client_id,
      engagementId: engagement.id,
      kind: 'change_order_requested',
      title: `Change order asked: ${parsed.data.title}`,
      href: `/engagements/${engagement.id}#change-orders`,
    },
    await practiceTeamRecipients(engagement.practice_id)
  )
  revalidatePath('/charter')
  redirect('/charter?state=co_asked')
}

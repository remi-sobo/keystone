'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { notify, practiceTeamRecipients } from '@/lib/notify'

/**
 * The client side of homework (PURE RLS, V2 3C). Two writes exist:
 *
 *   1. The check-off: the action_items_checkoff policy admits only rows
 *      assigned to the caller's own membership AND review_requested =
 *      false, so a review item can never be self-completed and a
 *      hand-crafted POST at a teammate's item updates zero rows.
 *   2. The trail: comments, submissions, and block marks land in
 *      homework_activity under its insert policy (own item, self-
 *      authored, coachee kinds only). The trail is append-only; there
 *      is no edit or delete path for anyone.
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

const ActivityShape = z.object({
  id: z.string().uuid(),
  kind: z.enum(['comment', 'submission', 'blocked', 'unblocked']),
  body: z.string().max(4000).optional(),
  link: z.string().max(600).optional(),
})

export async function addHomeworkActivity(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const clean = (name: string) => {
    const v = String(formData.get(name) ?? '').trim()
    return v || undefined
  }
  const parsed = ActivityShape.safeParse({
    id: formData.get('id'),
    kind: formData.get('kind'),
    body: clean('body'),
    link: clean('link'),
  })
  if (!parsed.success) redirect('/homework')
  const { id, kind, body, link } = parsed.data

  // A comment or a block mark needs words; a submission needs words or
  // a link; clearing a block stands on its own.
  if (kind !== 'unblocked' && !body && !(kind === 'submission' && link)) {
    redirect(`/homework/${id}?state=empty`)
  }
  if (link && !/^https?:\/\//i.test(link)) redirect(`/homework/${id}?state=badlink`)

  const supabase = await createServerSupabase()
  const [{ data: item }, { data: me }] = await Promise.all([
    supabase
      .from('action_items')
      .select('id, title, engagement_id, practice_id, client_id, assigned_client_member_id, review_requested')
      .eq('id', id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('id')
      .eq('user_id', viewer.user.id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
  ])
  if (!item || !me || item.assigned_client_member_id !== me.id) redirect('/homework')
  if (kind === 'submission' && !item.review_requested) redirect(`/homework/${id}`)

  const { error } = await supabase.from('homework_activity').insert({
    action_item_id: item.id,
    engagement_id: item.engagement_id,
    practice_id: item.practice_id,
    client_id: item.client_id,
    author_client_member_id: me.id,
    kind,
    body_md: body ?? null,
    link_url: link ?? null,
  })
  if (error) {
    console.error('[homework] trail write failed:', error.code)
    redirect(`/homework/${id}?state=error`)
  }

  // 4F: a submission is the one loop event the practice waits on.
  if (kind === 'submission') {
    await notify(
      {
        practiceId: item.practice_id,
        clientId: item.client_id,
        engagementId: item.engagement_id,
        kind: 'homework_submitted',
        title: `Homework submitted: ${item.title}`,
        href: `/engagements/${item.engagement_id}/homework/${item.id}`,
      },
      await practiceTeamRecipients(item.practice_id)
    )
  }

  revalidatePath(`/homework/${id}`)
  revalidatePath('/homework')
  revalidatePath('/home')
  redirect(`/homework/${id}?state=saved`)
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { randomUUID } from 'crypto'
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

// 3C-4: evidence file limits. Ten megabytes, document and image
// shapes; the storage policy is the wall, these are the manners.
const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024
const EVIDENCE_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
])

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

  // A comment or a block mark needs words; a submission needs words, a
  // link, or a file (3C-4); clearing a block stands on its own.
  const upload = formData.get('file')
  const hasFile = upload instanceof File && upload.size > 0
  if (kind !== 'unblocked' && !body && !(kind === 'submission' && (link || hasFile))) {
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

  // 3C-4: an evidence file rides the trail row. The upload goes
  // through the SESSION client, so the storage insert policy (own
  // open item, exact scope path) is the wall; no service role here.
  let filePath: string | null = null
  let fileName: string | null = null
  let fileSize: number | null = null
  let mimeType: string | null = null
  const file = formData.get('file')
  if (file instanceof File && file.size > 0) {
    if (file.size > EVIDENCE_MAX_BYTES) redirect(`/homework/${id}?state=file_too_big`)
    if (!EVIDENCE_MIME.has(file.type)) redirect(`/homework/${id}?state=file_type`)
    fileName = file.name.replace(/[^\w.\- ]/g, '_').slice(0, 140) || 'evidence'
    filePath = `${item.practice_id}/${item.client_id}/${item.engagement_id}/${item.id}/${randomUUID()}/${fileName}`
    fileSize = file.size
    mimeType = file.type
    const { error: uploadError } = await supabase.storage
      .from('homework-evidence')
      .upload(filePath, file, { contentType: file.type })
    if (uploadError) {
      console.error('[homework] evidence upload failed:', uploadError.message)
      redirect(`/homework/${id}?state=file_failed`)
    }
  }

  const { error } = await supabase.from('homework_activity').insert({
    action_item_id: item.id,
    engagement_id: item.engagement_id,
    practice_id: item.practice_id,
    client_id: item.client_id,
    author_client_member_id: me.id,
    kind,
    body_md: body ?? null,
    link_url: link ?? null,
    file_path: filePath,
    file_name: fileName,
    file_size: fileSize,
    mime_type: mimeType,
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

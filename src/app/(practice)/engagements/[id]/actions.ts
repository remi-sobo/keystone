'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { appBaseUrl, sendEmail } from '@/lib/email'
import { logAuditAction } from '@/lib/audit'

/**
 * Engagement-detail actions: the readiness panel (Ring 3) and
 * deliverables (Ring 4). Row writes ride the SESSION client so the RLS
 * write policies stay the wall; the service role appears only for the
 * two things a session cannot do, minting the signed upload URL and
 * removing the storage object, both strictly after the membership and
 * scope checks.
 */

async function guardPractice() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  return viewer
}

// ── Readiness (Ring 3) ────────────────────────────────────────────────

const ReadinessShape = z.object({
  engagementId: z.string().uuid(),
  pillar: z.enum(['philosophy', 'system', 'execution']),
  note: z.string().max(8000),
})

export async function saveReadiness(formData: FormData): Promise<void> {
  const viewer = await guardPractice()

  const parsed = ReadinessShape.safeParse({
    engagementId: formData.get('engagementId'),
    pillar: formData.get('pillar'),
    note: formData.get('note'),
  })
  if (!parsed.success) redirect('/engagements')

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', parsed.data.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  const { error } = await supabase.from('readiness_markers').upsert(
    {
      engagement_id: engagement.id,
      practice_id: engagement.practice_id,
      client_id: engagement.client_id,
      pillar: parsed.data.pillar,
      note_md: parsed.data.note,
      updated_at: new Date().toISOString(),
      updated_by: viewer.user!.id,
    },
    { onConflict: 'engagement_id,pillar' }
  )
  if (error) console.error('[readiness] save failed:', error.message)
  revalidatePath(`/engagements/${engagement.id}`)
}

// ── Deliverables (Ring 4) ─────────────────────────────────────────────

/**
 * Mint a signed upload URL for a deliverable file, direct-to-storage.
 * The path carries the resolved scope ids as folders so the storage
 * read policies enforce the same walls as the table. The filename is
 * flattened to a safe basename; the object id segment guarantees
 * uniqueness.
 */
export async function prepareDeliverableUpload(
  engagementId: string,
  filename: string
): Promise<{ path: string; token: string } | { error: string }> {
  const viewer = await guardPractice()
  const idCheck = z.string().uuid().safeParse(engagementId)
  if (!idCheck.success) return { error: 'invalid' }

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', idCheck.data)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) return { error: 'not_found' }

  const safeName =
    filename
      .split(/[\\/]/)
      .pop()!
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(0, 120) || 'file'
  const objectPath = `${engagement.practice_id}/${engagement.client_id}/${engagement.id}/${randomUUID()}/${safeName}`

  const { data, error } = await supabaseAdmin.storage
    .from('deliverables')
    .createSignedUploadUrl(objectPath)
  if (error || !data) {
    console.error('[deliverables] signed upload mint failed:', error?.message)
    return { error: 'upload_unavailable' }
  }
  return { path: data.path, token: data.token }
}

const DeliverableShape = z
  .object({
    engagementId: z.string().uuid(),
    title: z.string().min(1).max(200),
    kind: z.enum(['file', 'link']),
    url: z.string().url().max(2000).optional(),
    storagePath: z.string().max(500).optional(),
    note: z.string().max(2000).optional(),
    workstreamId: z.string().uuid().optional(),
    deliveredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((d) => (d.kind === 'file' ? !!d.storagePath : !!d.url), {
    message: 'a file needs its path, a link its url',
  })

export async function createDeliverable(
  input: z.input<typeof DeliverableShape>
): Promise<{ ok: true } | { error: string }> {
  const viewer = await guardPractice()
  const parsed = DeliverableShape.safeParse(input)
  if (!parsed.success) return { error: 'invalid' }
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', d.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) return { error: 'not_found' }

  // A storage path must sit inside THIS engagement's folder; anything
  // else is a spoofed pointer at someone else's object.
  if (
    d.storagePath &&
    !d.storagePath.startsWith(`${engagement.practice_id}/${engagement.client_id}/${engagement.id}/`)
  ) {
    return { error: 'invalid' }
  }

  let workstreamId: string | null = null
  if (d.workstreamId) {
    const { data: ws } = await supabase
      .from('workstreams')
      .select('id')
      .eq('id', d.workstreamId)
      .eq('engagement_id', engagement.id)
      .maybeSingle()
    workstreamId = ws?.id ?? null
  }

  const { error } = await supabase.from('deliverables').insert({
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    workstream_id: workstreamId,
    title: d.title,
    kind: d.kind,
    storage_path: d.kind === 'file' ? d.storagePath : null,
    url: d.kind === 'link' ? d.url : null,
    note: d.note || null,
    delivered_on: d.deliveredOn ?? new Date().toISOString().slice(0, 10),
    created_by: viewer.user!.id,
  })
  if (error) {
    console.error('[deliverables] insert failed:', error.message)
    return { error: 'save_failed' }
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'deliverable.create',
    target: engagement.id,
    detail: { kind: d.kind },
  })
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/deliverables')
  revalidatePath('/home')
  return { ok: true }
}

const RemoveShape = z.object({
  deliverableId: z.string().uuid(),
  engagementId: z.string().uuid(),
})

export async function removeDeliverable(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = RemoveShape.safeParse({
    deliverableId: formData.get('deliverableId'),
    engagementId: formData.get('engagementId'),
  })
  if (!parsed.success) redirect('/engagements')

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('deliverables')
    .select('id, storage_path, practice_id')
    .eq('id', parsed.data.deliverableId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!row) redirect(`/engagements/${parsed.data.engagementId}`)

  const { error } = await supabase.from('deliverables').delete().eq('id', row.id)
  if (error) {
    console.error('[deliverables] delete failed:', error.message)
  } else if (row.storage_path) {
    // The object goes with the row; the service role acts only after
    // the scoped row read above proved membership.
    const { error: storageError } = await supabaseAdmin.storage
      .from('deliverables')
      .remove([row.storage_path])
    if (storageError) {
      console.error('[deliverables] object removal failed:', storageError.message)
    }
    await logAuditAction({
      actorEmail: viewer.user!.email ?? '',
      action: 'deliverable.remove',
      target: row.id,
    })
  }
  revalidatePath(`/engagements/${parsed.data.engagementId}`)
  revalidatePath('/deliverables')
}

// ── Messages (Ring 5): the practice reply ─────────────────────────────

const ReplyShape = z.object({
  engagementId: z.string().uuid(),
  body: z.string().min(1).max(8000),
})

export async function replyMessage(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = ReplyShape.safeParse({
    engagementId: formData.get('engagementId'),
    body: formData.get('body'),
  })
  if (!parsed.success) redirect('/engagements')
  const { engagementId, body } = parsed.data

  const limited = await checkRateLimits([
    { config: LIMITS.MESSAGES_PER_MIN, key: viewer.user!.id },
    { config: LIMITS.MESSAGES_PER_HOUR, key: viewer.user!.id },
  ])
  if (!limited.ok) redirect(`/engagements/${engagementId}?state=slow#messages`)

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, practice_id, client_id')
    .eq('id', engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  let { data: thread } = await supabase
    .from('message_threads')
    .select('id')
    .eq('engagement_id', engagement.id)
    .maybeSingle()
  if (!thread) {
    const { data: created, error: threadError } = await supabase
      .from('message_threads')
      .insert({
        engagement_id: engagement.id,
        practice_id: engagement.practice_id,
        client_id: engagement.client_id,
      })
      .select('id')
      .maybeSingle()
    if (threadError && threadError.code !== '23505') {
      console.error('[messages] thread open failed:', threadError.message)
      redirect(`/engagements/${engagementId}?state=msg_error#messages`)
    }
    thread =
      created ??
      (
        await supabase
          .from('message_threads')
          .select('id')
          .eq('engagement_id', engagement.id)
          .maybeSingle()
      ).data
  }
  if (!thread) redirect(`/engagements/${engagementId}?state=msg_error#messages`)

  const { error } = await supabase.from('messages').insert({
    thread_id: thread.id,
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    author_user_id: viewer.user!.id,
    author_side: 'practice',
    body,
  })
  if (error) {
    console.error('[messages] reply failed:', error.message)
    redirect(`/engagements/${engagementId}?state=msg_error#messages`)
  }
  await supabase
    .from('message_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', thread.id)

  // Replying answers: the client's words in this thread are now read.
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', thread.id)
    .eq('author_side', 'client')
    .is('read_at', null)

  // Email the client members who have spoken in this thread; if the
  // practice speaks first, every member of the client hears it.
  const [{ data: authors }, { data: roster }] = await Promise.all([
    supabase.from('messages').select('author_user_id').eq('thread_id', thread.id).eq('author_side', 'client'),
    supabase.from('client_members').select('email, user_id').eq('client_id', engagement.client_id),
  ])
  const spoke = new Set((authors ?? []).map((a) => a.author_user_id))
  const participants = (roster ?? []).filter((m) => m.user_id && spoke.has(m.user_id))
  const targets = (participants.length > 0 ? participants : roster ?? []).map((m) => m.email)

  const link = `${appBaseUrl()}/messages`
  const excerpt = body.slice(0, 200)
  let allSent = targets.length > 0
  for (const to of targets) {
    const result = await sendEmail({
      to,
      subject: `Reply from your consultant on ${engagement.title}`,
      html: [
        `<p>Your consultant replied:</p>`,
        `<blockquote>${excerpt.replace(/</g, '&lt;')}</blockquote>`,
        `<p><a href="${link}">Read and reply in Keystone</a></p>`,
      ].join('\n'),
      replyTo: viewer.user!.email ?? undefined,
    })
    if (!result.ok) {
      allSent = false
      console.error('[messages] notify failed:', result.status, result.detail)
    }
  }

  revalidatePath(`/engagements/${engagementId}`)
  revalidatePath('/today')
  redirect(`/engagements/${engagementId}?state=${allSent ? 'msg_sent' : 'msg_sent_no_email'}#messages`)
}

// ── Engagement documents (the client agreement store) ────────────────

/**
 * Mint a signed upload URL for a formal document PDF. Same contract as
 * deliverables: direct-to-storage after the membership check, the row
 * recorded only once the object landed. PDF only, by extension here
 * and by declared type at the form.
 */
export async function prepareDocumentUpload(
  engagementId: string,
  filename: string
): Promise<{ path: string; token: string } | { error: string }> {
  const viewer = await guardPractice()
  const idCheck = z.string().uuid().safeParse(engagementId)
  if (!idCheck.success) return { error: 'invalid' }
  if (!/\.pdf$/i.test(filename)) return { error: 'pdf_only' }

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', idCheck.data)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) return { error: 'not_found' }

  const safeName =
    filename
      .split(/[\\/]/)
      .pop()!
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(0, 120) || 'document.pdf'
  const objectPath = `${engagement.practice_id}/${engagement.client_id}/${engagement.id}/${randomUUID()}/${safeName}`

  const { data, error } = await supabaseAdmin.storage
    .from('engagement-documents')
    .createSignedUploadUrl(objectPath)
  if (error || !data) {
    console.error('[documents] signed upload mint failed:', error?.message)
    return { error: 'upload_unavailable' }
  }
  return { path: data.path, token: data.token }
}

const DocumentShape = z.object({
  engagementId: z.string().uuid(),
  title: z.string().min(1).max(200),
  storagePath: z.string().max(500),
  fileName: z.string().max(255),
  fileSize: z.number().int().min(0).max(20 * 1024 * 1024),
  status: z.enum(['uploaded', 'signed']),
  visibleToClient: z.boolean(),
})

export async function createEngagementDocument(
  input: z.input<typeof DocumentShape>
): Promise<{ ok: true } | { error: string }> {
  const viewer = await guardPractice()
  const parsed = DocumentShape.safeParse(input)
  if (!parsed.success) return { error: 'invalid' }
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', d.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) return { error: 'not_found' }

  // The path must sit inside THIS engagement's folder; anything else is
  // a spoofed pointer at someone else's object.
  const prefix = `${engagement.practice_id}/${engagement.client_id}/${engagement.id}/`
  if (!d.storagePath.startsWith(prefix)) return { error: 'invalid' }

  const { error } = await supabase.from('engagement_documents').insert({
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    doc_type: 'agreement',
    title: d.title,
    status: d.status,
    storage_path: d.storagePath,
    file_name: d.fileName.slice(0, 255),
    file_size: d.fileSize,
    mime_type: 'application/pdf',
    visible_to_client: d.visibleToClient,
    uploaded_by: viewer.user!.id,
  })
  if (error) {
    console.error('[documents] insert failed:', error.message)
    // Reconcile the orphan: the object landed but the row did not.
    const { error: cleanupError } = await supabaseAdmin.storage
      .from('engagement-documents')
      .remove([d.storagePath])
    if (cleanupError) {
      console.error('[documents] orphan cleanup failed:', cleanupError.message)
    }
    return { error: 'save_failed' }
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'documents.uploaded',
    target: engagement.id,
    detail: { status: d.status, visible_to_client: d.visibleToClient },
  })
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/home')
  return { ok: true }
}

const DocVisibilityShape = z.object({
  documentId: z.string().uuid(),
  engagementId: z.string().uuid(),
  to: z.enum(['shared', 'hidden']),
})

export async function setDocumentVisibility(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = DocVisibilityShape.safeParse({
    documentId: formData.get('documentId'),
    engagementId: formData.get('engagementId'),
    to: formData.get('to'),
  })
  if (!parsed.success) redirect('/engagements')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('engagement_documents')
    .update({
      visible_to_client: parsed.data.to === 'shared',
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.documentId)
    .eq('practice_id', viewer.practice!.practiceId)
  if (error) console.error('[documents] visibility update failed:', error.message)
  else {
    await logAuditAction({
      actorEmail: viewer.user!.email ?? '',
      action: 'documents.visibility_changed',
      target: parsed.data.documentId,
      detail: { to: parsed.data.to },
    })
  }
  revalidatePath(`/engagements/${parsed.data.engagementId}`)
  revalidatePath('/home')
}

const DocRemoveShape = z.object({
  documentId: z.string().uuid(),
  engagementId: z.string().uuid(),
})

export async function removeEngagementDocument(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = DocRemoveShape.safeParse({
    documentId: formData.get('documentId'),
    engagementId: formData.get('engagementId'),
  })
  if (!parsed.success) redirect('/engagements')

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('engagement_documents')
    .select('id, storage_path')
    .eq('id', parsed.data.documentId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!row) redirect(`/engagements/${parsed.data.engagementId}`)

  const { error } = await supabase.from('engagement_documents').delete().eq('id', row.id)
  if (error) {
    console.error('[documents] delete failed:', error.message)
  } else {
    if (row.storage_path) {
      // The object goes with the row; the service role acts only after
      // the scoped row read above proved membership.
      const { error: storageError } = await supabaseAdmin.storage
        .from('engagement-documents')
        .remove([row.storage_path])
      if (storageError) {
        console.error('[documents] object removal failed:', storageError.message)
      }
    }
    await logAuditAction({
      actorEmail: viewer.user!.email ?? '',
      action: 'documents.removed',
      target: row.id,
    })
  }
  revalidatePath(`/engagements/${parsed.data.engagementId}`)
  revalidatePath('/home')
}

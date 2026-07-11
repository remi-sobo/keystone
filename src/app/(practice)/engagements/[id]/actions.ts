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
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'
import { callClaudeChecked } from '@/lib/anthropicClient'
import { AiBudgetExceededError } from '@/lib/spend'
import { buildQaRequest, parseAnswer, QUESTION_CHAR_CAP } from '@/lib/qa'
import { buildQaCorpus } from '@/lib/qaCorpus'
import { recordQaExchange } from '@/lib/qaExchange'
import type { AskResult } from '@/components/AskRecordForm'
import type { FindResult } from '@/components/FindRecordForm'
import { searchRecord } from '@/lib/recordSearch'
import { clientTeamRecipients, notify } from '@/lib/notify'
import { parseAnchorParam, resolveAnchor } from '@/lib/messageAnchors'
import { assembleSlots } from '@/lib/slotAssembly'
import { isOfferedSlot } from '@/lib/scheduling'

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
    sessionId: z.string().uuid().optional(),
    about: z.string().max(4000).optional(),
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

  let sessionId: string | null = null
  if (d.sessionId) {
    const { data: sess } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', d.sessionId)
      .eq('engagement_id', engagement.id)
      .maybeSingle()
    sessionId = sess?.id ?? null
  }

  const { error } = await supabase.from('deliverables').insert({
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    workstream_id: workstreamId,
    session_id: sessionId,
    about_md: d.about?.trim() ? d.about.trim() : null,
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
  await notify(
    {
      practiceId: engagement.practice_id,
      clientId: engagement.client_id,
      engagementId: engagement.id,
      kind: 'deliverable_shipped',
      title: `New deliverable: ${d.title}`,
      href: '/deliverables',
    },
    await clientTeamRecipients(engagement.client_id)
  )
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

  // 3E: resolve the anchor inside this engagement; the label is ours.
  const anchorParam = parseAnchorParam(String(formData.get('anchor') ?? '') || null)
  const anchor = anchorParam
    ? await resolveAnchor(supabase, engagement.id, anchorParam.type, anchorParam.id)
    : null
  if (anchorParam && !anchor) redirect(`/engagements/${engagementId}?state=msg_error#messages`)

  const { error } = await supabase.from('messages').insert({
    thread_id: thread.id,
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    author_user_id: viewer.user!.id,
    author_side: 'practice',
    body,
    anchor_type: anchor?.type ?? null,
    anchor_id: anchor?.id ?? null,
    anchor_label: anchor?.label ?? null,
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

  // 4F: the in-app row beside the email they already get.
  await notify(
    {
      practiceId: engagement.practice_id,
      clientId: engagement.client_id,
      engagementId: engagement.id,
      kind: 'message_reply',
      title: 'A reply from your consultant',
      href: '/messages',
    },
    await clientTeamRecipients(engagement.client_id)
  )

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

// ── Decision log (V2 2B) ──────────────────────────────────────────────

const DecisionShape = z.object({
  engagementId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  decidedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  who: z.string().trim().max(120).optional(),
  context: z.string().trim().max(2000).optional(),
  workstreamId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  revisitOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supersedes: z.string().uuid().optional(),
})

/**
 * Log a decision. Insert-only by design: the table carries no update
 * or delete policy, so what this writes is what history keeps. The
 * insert rides the session client under the engagement.write policy.
 */
export async function addDecision(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const clean = (name: string) => {
    const v = String(formData.get(name) ?? '').trim()
    return v || undefined
  }
  const parsed = DecisionShape.safeParse({
    engagementId: formData.get('engagementId'),
    title: formData.get('title'),
    decidedOn: formData.get('decidedOn'),
    who: clean('who'),
    context: clean('context'),
    workstreamId: clean('workstreamId'),
    sessionId: clean('sessionId'),
    revisitOn: clean('revisitOn'),
    supersedes: clean('supersedes'),
  })
  if (!parsed.success) redirect('/engagements')
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', d.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  // Client-facing prose rides the voice gate like every shipped string.
  const sweep = (text: string): string => {
    const check = validateVoice(text)
    if (check.ok) return text
    void logVoiceViolation({
      practiceId: engagement.practice_id,
      source: 'decision_log',
      violations: check.violations,
      rawExcerpt: text.slice(0, 400),
      cleanedExcerpt: check.cleaned.slice(0, 400),
    })
    return check.cleaned
  }

  const { error } = await supabase.from('decisions').insert({
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    workstream_id: d.workstreamId ?? null,
    session_id: d.sessionId ?? null,
    decided_on: d.decidedOn,
    title: sweep(d.title),
    context_md: d.context ? sweep(d.context) : null,
    decided_by_label: d.who ?? null,
    revisit_on: d.revisitOn ?? null,
    supersedes: d.supersedes ?? null,
    source: 'manual',
    created_by: viewer.user!.id,
  })
  if (error) {
    console.error('[decisions] insert failed:', error.message)
    redirect(`/engagements/${engagement.id}?state=decision_error#decisions`)
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'decisions.logged',
    target: engagement.id,
    detail: { workstream: d.workstreamId ?? null, supersedes: d.supersedes ?? null },
  })
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/decisions')
  revalidatePath('/home')
  redirect(`/engagements/${engagement.id}?state=decision_logged#decisions`)
}

// ── Workstream note (V2 2F): the "why we're here" field ───────────────

const NoteShape = z.object({
  engagementId: z.string().uuid(),
  workstreamId: z.string().uuid(),
  note: z.string().trim().max(600),
})

/**
 * Save a workstream's why-we're-here note. Session client under the
 * engagement.write policy; client-visible on save by design, so the
 * prose rides the voice gate.
 */
export async function saveWorkstreamNote(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = NoteShape.safeParse({
    engagementId: formData.get('engagementId'),
    workstreamId: formData.get('workstreamId'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) redirect('/engagements')

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id')
    .eq('id', parsed.data.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  let note: string | null = parsed.data.note || null
  if (note) {
    const check = validateVoice(note)
    if (!check.ok) {
      void logVoiceViolation({
        practiceId: engagement.practice_id,
        source: 'workstream_note',
        violations: check.violations,
        rawExcerpt: note.slice(0, 400),
        cleanedExcerpt: check.cleaned.slice(0, 400),
      })
      note = check.cleaned
    }
  }

  const { error } = await supabase
    .from('workstreams')
    .update({
      note_md: note,
      note_updated_at: note ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.workstreamId)
    .eq('engagement_id', engagement.id)
  if (error) {
    console.error('[workstreams] note save failed:', error.message)
    redirect(`/engagements/${engagement.id}?state=note_error`)
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'workstreams.note_saved',
    target: parsed.data.workstreamId,
    detail: { cleared: note === null },
  })
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/home')
  redirect(`/engagements/${engagement.id}?state=note_saved`)
}

// ── Outcomes and evidence (V2 2C) ─────────────────────────────────────

const OutcomeShape = z.object({
  engagementId: z.string().uuid(),
  outcomeId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(300),
  baseline: z.string().trim().max(1000).optional(),
  target: z.string().trim().max(1000).optional(),
  standing: z.string().trim().max(2000).optional(),
  reachedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  workstreamId: z.string().uuid().optional(),
})

function sweepOutcomeProse(practiceId: string, text: string): string {
  const check = validateVoice(text)
  if (check.ok) return text
  void logVoiceViolation({
    practiceId,
    source: 'outcomes',
    violations: check.violations,
    rawExcerpt: text.slice(0, 400),
    cleanedExcerpt: check.cleaned.slice(0, 400),
  })
  return check.cleaned
}

/** Create or update an outcome. The standing note stamps its date. */
export async function saveOutcome(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const clean = (name: string) => {
    const v = String(formData.get(name) ?? '').trim()
    return v || undefined
  }
  const parsed = OutcomeShape.safeParse({
    engagementId: formData.get('engagementId'),
    outcomeId: clean('outcomeId'),
    title: formData.get('title'),
    baseline: clean('baseline'),
    target: clean('target'),
    standing: clean('standing'),
    reachedOn: clean('reachedOn'),
    workstreamId: clean('workstreamId'),
  })
  if (!parsed.success) redirect('/engagements')
  const o = parsed.data

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', o.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}?state=outcome_saved#outcomes`

  const sweep = (t?: string) => (t ? sweepOutcomeProse(engagement.practice_id, t) : null)
  const fields = {
    title: sweepOutcomeProse(engagement.practice_id, o.title),
    baseline_md: sweep(o.baseline),
    target_md: sweep(o.target),
    standing_md: sweep(o.standing),
    reached_on: o.reachedOn ?? null,
    workstream_id: o.workstreamId ?? null,
  }

  if (o.outcomeId) {
    const { data: existing } = await supabase
      .from('outcomes')
      .select('id, standing_md')
      .eq('id', o.outcomeId)
      .eq('engagement_id', engagement.id)
      .maybeSingle()
    if (!existing) redirect('/engagements')
    const { error } = await supabase
      .from('outcomes')
      .update({
        ...fields,
        standing_updated_at:
          (fields.standing_md ?? null) !== (existing.standing_md ?? null)
            ? fields.standing_md
              ? new Date().toISOString()
              : null
            : undefined,
      })
      .eq('id', existing.id)
    if (error) redirect(`/engagements/${engagement.id}?state=outcome_error#outcomes`)
  } else {
    const { data: last } = await supabase
      .from('outcomes')
      .select('sort')
      .eq('engagement_id', engagement.id)
      .order('sort', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { error } = await supabase.from('outcomes').insert({
      engagement_id: engagement.id,
      practice_id: engagement.practice_id,
      client_id: engagement.client_id,
      ...fields,
      standing_updated_at: fields.standing_md ? new Date().toISOString() : null,
      sort: (last?.sort ?? -1) + 1,
      created_by: viewer.user!.id,
    })
    if (error) redirect(`/engagements/${engagement.id}?state=outcome_error#outcomes`)
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: o.outcomeId ? 'outcomes.updated' : 'outcomes.created',
    target: engagement.id,
  })
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/outcomes')
  redirect(back)
}

const EvidenceShape = z.object({
  engagementId: z.string().uuid(),
  outcomeId: z.string().uuid(),
  // "kind:uuid" from the single grouped picker.
  ref: z.string().regex(/^(deliverable|session|action_item|decision):[0-9a-f-]{36}$/),
  note: z.string().trim().max(300).optional(),
})

const EVIDENCE_TABLES = {
  deliverable: 'deliverables',
  session: 'sessions',
  action_item: 'action_items',
  decision: 'decisions',
} as const

export async function attachEvidence(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = EvidenceShape.safeParse({
    engagementId: formData.get('engagementId'),
    outcomeId: formData.get('outcomeId'),
    ref: formData.get('ref'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/engagements')
  const [kind, refId] = parsed.data.ref.split(':') as [keyof typeof EVIDENCE_TABLES, string]

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', parsed.data.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')
  const back = `/engagements/${engagement.id}?state=evidence_saved#outcomes`

  // Never trust a pointer: the outcome and the artifact must both live
  // in THIS engagement.
  const [{ data: outcome }, { data: artifact }] = await Promise.all([
    supabase
      .from('outcomes')
      .select('id')
      .eq('id', parsed.data.outcomeId)
      .eq('engagement_id', engagement.id)
      .maybeSingle(),
    supabase
      .from(EVIDENCE_TABLES[kind])
      .select('id')
      .eq('id', refId)
      .eq('engagement_id', engagement.id)
      .maybeSingle(),
  ])
  if (!outcome || !artifact) redirect(`/engagements/${engagement.id}?state=outcome_error#outcomes`)

  const { error } = await supabase.from('outcome_evidence').insert({
    outcome_id: outcome.id,
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    kind,
    ref_id: refId,
    note: parsed.data.note ?? null,
    added_by: viewer.user!.id,
  })
  if (error) redirect(`/engagements/${engagement.id}?state=outcome_error#outcomes`)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'outcomes.evidence_attached',
    target: outcome.id,
    detail: { kind },
  })
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/outcomes')
  redirect(back)
}

export async function removeEvidence(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const id = z.string().uuid().safeParse(formData.get('evidenceId'))
  const engagementId = z.string().uuid().safeParse(formData.get('engagementId'))
  if (!id.success || !engagementId.success) redirect('/engagements')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('outcome_evidence')
    .delete()
    .eq('id', id.data)
    .eq('practice_id', viewer.practice!.practiceId)
  if (error) console.error('[outcomes] evidence removal failed:', error.message)
  else {
    await logAuditAction({
      actorEmail: viewer.user!.email ?? '',
      action: 'outcomes.evidence_removed',
      target: id.data,
    })
  }
  revalidatePath(`/engagements/${engagementId.data}`)
  revalidatePath('/outcomes')
  redirect(`/engagements/${engagementId.data}?state=evidence_removed#outcomes`)
}

// ── Engagement Q&A (V2 2E), practice side ─────────────────────────────

/**
 * The practice's Q&A over the fuller record. Same engine as the
 * client's /ask; the corpus is built on THIS session, so
 * practice-visibility notes ride in and nothing changes hands twice.
 */
export async function askEngagementQuestion(
  engagementId: string,
  question: string
): Promise<AskResult> {
  const viewer = await guardPractice()
  const idCheck = z.string().uuid().safeParse(engagementId)
  const q = question.trim()
  if (!idCheck.success || !q || q.length > QUESTION_CHAR_CAP)
    return { ok: false, error: 'invalid' }

  const limited = await checkRateLimits([
    { config: LIMITS.AI_QA_PER_MIN, key: viewer.user!.id },
    { config: LIMITS.AI_QA_PER_HOUR, key: viewer.user!.id },
  ])
  if (!limited.ok) return { ok: false, error: 'slow' }

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, practice_id, client_id, clients(name)')
    .eq('id', idCheck.data)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) return { ok: false, error: 'failed' }

  const corpus = await buildQaCorpus(supabase, engagement.id)
  const request = buildQaRequest(q, corpus, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    clientName: ((engagement.clients as any)?.name as string) ?? 'the client',
    engagementTitle: engagement.title,
  })

  let result
  try {
    result = await callClaudeChecked({
      ...request,
      practiceId: engagement.practice_id,
      engagementId: engagement.id,
    })
  } catch (e) {
    if (e instanceof AiBudgetExceededError) return { ok: false, error: 'budget' }
    console.error('[qa] practice call failed:', e instanceof Error ? e.message : 'unknown')
    return { ok: false, error: 'unavailable' }
  }

  const supplied = new Set(corpus.map((c) => c.id))
  const answer = parseAnswer(result.data, supplied)
  if (!answer) return { ok: false, error: 'failed' }

  const check = validateVoice(answer.answer_md)
  if (!check.ok) {
    void logVoiceViolation({
      practiceId: engagement.practice_id,
      source: 'qa',
      violations: check.violations,
      rawExcerpt: answer.answer_md.slice(0, 400),
      cleanedExcerpt: check.cleaned.slice(0, 400),
    })
    answer.answer_md = check.cleaned
  }

  void recordQaExchange({
    engagementId: engagement.id,
    practiceId: engagement.practice_id,
    clientId: engagement.client_id,
    askedBy: viewer.user!.id,
    askerSide: 'practice',
    question: q,
    answerMd: answer.answer_md,
    sources: answer.sources,
    grounded: answer.grounded,
    modelUsed: result.modelUsed,
  })

  const byId = new Map(corpus.map((c) => [c.id, c]))
  return {
    ok: true,
    answer: answer.answer_md,
    grounded: answer.grounded,
    sources: answer.sources
      .map((s) => byId.get(s))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ label: c.label, href: c.href })),
  }
}

/**
 * Plain keyword search over one engagement's record, practice side
 * (V2 engagement search). Same session-scoped mechanics as /ask.
 */
export async function findInEngagement(
  engagementId: string,
  term: string
): Promise<FindResult> {
  const viewer = await guardPractice()
  const idCheck = z.string().uuid().safeParse(engagementId)
  if (!idCheck.success) return { ok: false, error: 'failed' }

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id')
    .eq('id', idCheck.data)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) return { ok: false, error: 'failed' }

  const hrefs: Record<string, string> = {
    charter: `/engagements/${engagement.id}/charter`,
    decision: `/engagements/${engagement.id}#decisions`,
    note: `/engagements/${engagement.id}`,
    outcome: `/engagements/${engagement.id}#outcomes`,
    homework: `/engagements/${engagement.id}`,
    deliverable: `/engagements/${engagement.id}`,
    workstream: `/engagements/${engagement.id}`,
    message: `/engagements/${engagement.id}#messages`,
  }
  try {
    const hits = await searchRecord(supabase, engagement.id, term)
    return { ok: true, hits: hits.map((h) => ({ ...h, href: hrefs[h.kind] })) }
  } catch (e) {
    console.error('[search] practice search failed:', e instanceof Error ? e.message : 'unknown')
    return { ok: false, error: 'failed' }
  }
}

// ── Homework loop (V2 3C) ─────────────────────────────────────────────
// Row writes ride the SESSION client: action_items under the existing
// write/update policies, homework_activity under its practice mirror
// policy (self-authored, feedback kinds only). The trail is append-only
// for this surface too; acceptance is the one move that also flips the
// item to done.

async function myPracticeMemberId(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  userId: string,
  practiceId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('practice_members')
    .select('id')
    .eq('user_id', userId)
    .eq('practice_id', practiceId)
    .is('revoked_at', null)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

function sweepHomework(practiceId: string, text: string): string {
  const check = validateVoice(text)
  if (check.ok) return text
  void logVoiceViolation({
    practiceId,
    source: 'homework',
    violations: check.violations,
    rawExcerpt: text.slice(0, 400),
    cleanedExcerpt: check.cleaned.slice(0, 400),
  })
  return check.cleaned
}

const HomeworkShape = z.object({
  engagementId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().max(4000).optional(),
  assignee: z
    .string()
    .regex(/^(client|practice):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    .optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  workstreamId: z.string().uuid().optional(),
  audience: z.enum(['client', 'practice']),
  review: z.literal('on').optional(),
})

export async function addHomework(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const clean = (name: string) => {
    const v = String(formData.get(name) ?? '').trim()
    return v || undefined
  }
  const parsed = HomeworkShape.safeParse({
    engagementId: formData.get('engagementId'),
    title: clean('title'),
    body: clean('body'),
    assignee: clean('assignee'),
    dueOn: clean('dueOn'),
    workstreamId: clean('workstreamId'),
    audience: formData.get('audience') ?? 'client',
    review: clean('review'),
  })
  if (!parsed.success) redirect('/engagements')
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', d.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')
  const back = (state: string) => redirect(`/engagements/${engagement.id}?state=${state}#homework`)

  // The assignee sits on the side the audience says (spec section 3).
  const [side, memberId] = d.assignee ? (d.assignee.split(':') as [string, string]) : [null, null]
  if (side && side !== d.audience) back('hw_error')
  let assignedClient: string | null = null
  let assignedPractice: string | null = null
  if (side === 'client' && memberId) {
    const { data: cm } = await supabase
      .from('client_members')
      .select('id')
      .eq('id', memberId)
      .eq('client_id', engagement.client_id)
      .is('revoked_at', null)
      .maybeSingle()
    if (!cm) back('hw_error')
    assignedClient = memberId
  }
  if (side === 'practice' && memberId) {
    const { data: pm } = await supabase
      .from('practice_members')
      .select('id')
      .eq('id', memberId)
      .eq('practice_id', engagement.practice_id)
      .is('revoked_at', null)
      .maybeSingle()
    if (!pm) back('hw_error')
    assignedPractice = memberId
  }
  if (d.workstreamId) {
    const { data: wsRow } = await supabase
      .from('workstreams')
      .select('id')
      .eq('id', d.workstreamId)
      .eq('engagement_id', engagement.id)
      .maybeSingle()
    if (!wsRow) back('hw_error')
  }

  const { error } = await supabase.from('action_items').insert({
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    workstream_id: d.workstreamId ?? null,
    title: sweepHomework(engagement.practice_id, d.title),
    body_md: d.body ? sweepHomework(engagement.practice_id, d.body) : null,
    assigned_client_member_id: assignedClient,
    assigned_practice_member_id: assignedPractice,
    due_on: d.dueOn ?? null,
    audience: d.audience,
    // The loop needs a coachee to run it; review stays off otherwise.
    review_requested: d.review === 'on' && d.audience === 'client' && assignedClient != null,
    source: 'manual',
  })
  if (error) {
    console.error('[homework] add failed:', error.message)
    back('hw_error')
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'homework.added',
    target: engagement.id,
    detail: { audience: d.audience, review: d.review === 'on' },
  })
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/homework')
  revalidatePath('/home')
  revalidatePath('/today')
  back('hw_added')
}

const HomeworkMoveShape = z.object({
  itemId: z.string().uuid(),
  engagementId: z.string().uuid(),
  note: z.string().trim().max(4000).optional(),
})

async function loadPracticeItem(itemId: string, engagementId: string, practiceId: string) {
  const supabase = await createServerSupabase()
  const { data: item } = await supabase
    .from('action_items')
    .select(
      'id, title, engagement_id, practice_id, client_id, status, review_requested, audience, assigned_client_member_id'
    )
    .eq('id', itemId)
    .eq('engagement_id', engagementId)
    .eq('practice_id', practiceId)
    .maybeSingle()
  return { supabase, item }
}

/**
 * V2 4B: internal tasks are check-offs, not coaching loops. No trail
 * rows, no notifications; the wall (0017) keeps every client session
 * from ever reading the row. Refuses anything not practice-audience.
 */
export async function completeInternalTask(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = HomeworkMoveShape.safeParse({
    itemId: formData.get('itemId'),
    engagementId: formData.get('engagementId'),
  })
  if (!parsed.success) redirect('/engagements')
  const { itemId, engagementId } = parsed.data

  const { supabase, item } = await loadPracticeItem(itemId, engagementId, viewer.practice!.practiceId)
  if (!item || item.audience !== 'practice' || item.status !== 'open') {
    redirect(`/engagements/${engagementId}?state=hw_error#homework`)
  }
  const { error } = await supabase
    .from('action_items')
    .update({ status: 'done', done_at: new Date().toISOString() })
    .eq('id', item.id)
  if (error) {
    console.error('[homework] internal complete failed:', error.message)
    redirect(`/engagements/${engagementId}?state=hw_error#homework`)
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'homework.internal_done',
    target: item.id,
  })
  redirect(`/engagements/${engagementId}?state=internal_done#homework`)
}

export async function reopenInternalTask(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = HomeworkMoveShape.safeParse({
    itemId: formData.get('itemId'),
    engagementId: formData.get('engagementId'),
  })
  if (!parsed.success) redirect('/engagements')
  const { itemId, engagementId } = parsed.data

  const { supabase, item } = await loadPracticeItem(itemId, engagementId, viewer.practice!.practiceId)
  if (!item || item.audience !== 'practice' || item.status !== 'done') {
    redirect(`/engagements/${engagementId}?state=hw_error#homework`)
  }
  const { error } = await supabase
    .from('action_items')
    .update({ status: 'open', done_at: null })
    .eq('id', item.id)
  if (error) {
    console.error('[homework] internal reopen failed:', error.message)
    redirect(`/engagements/${engagementId}?state=hw_error#homework`)
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'homework.internal_reopened',
    target: item.id,
  })
  redirect(`/engagements/${engagementId}?state=internal_reopened#homework`)
}

export async function acceptHomework(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = HomeworkMoveShape.safeParse({
    itemId: formData.get('itemId'),
    engagementId: formData.get('engagementId'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/engagements')
  const { itemId, engagementId, note } = parsed.data

  const { supabase, item } = await loadPracticeItem(itemId, engagementId, viewer.practice!.practiceId)
  if (!item || !item.review_requested || item.status !== 'open') {
    redirect(`/engagements/${engagementId}?state=hw_error#homework`)
  }
  const me = await myPracticeMemberId(supabase, viewer.user!.id, item.practice_id)
  if (!me) redirect('/engagements')

  const { error: trailError } = await supabase.from('homework_activity').insert({
    action_item_id: item.id,
    engagement_id: item.engagement_id,
    practice_id: item.practice_id,
    client_id: item.client_id,
    author_practice_member_id: me,
    kind: 'acceptance',
    body_md: note ? sweepHomework(item.practice_id, note) : null,
  })
  if (trailError) {
    console.error('[homework] acceptance failed:', trailError.message)
    redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_error`)
  }
  const { error: flipError } = await supabase
    .from('action_items')
    .update({ status: 'done', done_at: new Date().toISOString() })
    .eq('id', item.id)
  if (flipError) console.error('[homework] accept flip failed:', flipError.message)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'homework.accepted',
    target: item.id,
  })
  if (item.assigned_client_member_id) {
    await notify(
      {
        practiceId: item.practice_id,
        clientId: item.client_id,
        engagementId: item.engagement_id,
        kind: 'homework_feedback',
        title: `Homework accepted: ${item.title}`,
        href: `/homework/${item.id}`,
      },
      [{ clientMemberId: item.assigned_client_member_id }]
    )
  }
  revalidatePath(`/engagements/${engagementId}`)
  revalidatePath(`/engagements/${engagementId}/homework/${itemId}`)
  revalidatePath('/homework')
  revalidatePath('/home')
  revalidatePath('/today')
  redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_accepted`)
}

export async function sendBackHomework(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = HomeworkMoveShape.safeParse({
    itemId: formData.get('itemId'),
    engagementId: formData.get('engagementId'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/engagements')
  const { itemId, engagementId, note } = parsed.data
  // A send-back without words is a shrug; the note is required.
  if (!note) redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_note_needed`)

  const { supabase, item } = await loadPracticeItem(itemId, engagementId, viewer.practice!.practiceId)
  if (!item || !item.review_requested || item.status !== 'open') {
    redirect(`/engagements/${engagementId}?state=hw_error#homework`)
  }
  const me = await myPracticeMemberId(supabase, viewer.user!.id, item.practice_id)
  if (!me) redirect('/engagements')

  const { error } = await supabase.from('homework_activity').insert({
    action_item_id: item.id,
    engagement_id: item.engagement_id,
    practice_id: item.practice_id,
    client_id: item.client_id,
    author_practice_member_id: me,
    kind: 'send_back',
    body_md: sweepHomework(item.practice_id, note),
  })
  if (error) {
    console.error('[homework] send-back failed:', error.message)
    redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_error`)
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'homework.sent_back',
    target: item.id,
  })
  if (item.assigned_client_member_id) {
    await notify(
      {
        practiceId: item.practice_id,
        clientId: item.client_id,
        engagementId: item.engagement_id,
        kind: 'homework_feedback',
        title: `Homework sent back with a note: ${item.title}`,
        href: `/homework/${item.id}`,
      },
      [{ clientMemberId: item.assigned_client_member_id }]
    )
  }
  revalidatePath(`/engagements/${engagementId}`)
  revalidatePath(`/engagements/${engagementId}/homework/${itemId}`)
  revalidatePath('/homework')
  revalidatePath('/home')
  revalidatePath('/today')
  redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_sent_back`)
}

export async function practiceHomeworkComment(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = HomeworkMoveShape.safeParse({
    itemId: formData.get('itemId'),
    engagementId: formData.get('engagementId'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/engagements')
  const { itemId, engagementId, note } = parsed.data
  if (!note) redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_note_needed`)

  const { supabase, item } = await loadPracticeItem(itemId, engagementId, viewer.practice!.practiceId)
  if (!item) redirect(`/engagements/${engagementId}?state=hw_error#homework`)
  const me = await myPracticeMemberId(supabase, viewer.user!.id, item.practice_id)
  if (!me) redirect('/engagements')

  const { error } = await supabase.from('homework_activity').insert({
    action_item_id: item.id,
    engagement_id: item.engagement_id,
    practice_id: item.practice_id,
    client_id: item.client_id,
    author_practice_member_id: me,
    kind: 'comment',
    body_md: sweepHomework(item.practice_id, note),
  })
  if (error) {
    console.error('[homework] comment failed:', error.message)
    redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_error`)
  }
  revalidatePath(`/engagements/${engagementId}/homework/${itemId}`)
  revalidatePath('/homework')
  redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_saved`)
}

const HomeworkEditShape = z.object({
  itemId: z.string().uuid(),
  engagementId: z.string().uuid(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  review: z.literal('on').optional(),
})

export async function editHomework(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const clean = (name: string) => {
    const v = String(formData.get(name) ?? '').trim()
    return v || undefined
  }
  const parsed = HomeworkEditShape.safeParse({
    itemId: formData.get('itemId'),
    engagementId: formData.get('engagementId'),
    dueOn: clean('dueOn'),
    review: clean('review'),
  })
  if (!parsed.success) redirect('/engagements')
  const { itemId, engagementId, dueOn, review } = parsed.data

  const { supabase, item } = await loadPracticeItem(itemId, engagementId, viewer.practice!.practiceId)
  if (!item) redirect(`/engagements/${engagementId}?state=hw_error#homework`)
  const wantReview = review === 'on'

  // The review toggle stays editable until the first submission lands
  // (gate 3C-1); after that the loop is the record.
  if (wantReview !== item.review_requested) {
    const { count } = await supabase
      .from('homework_activity')
      .select('id', { count: 'exact', head: true })
      .eq('action_item_id', item.id)
      .eq('kind', 'submission')
    if ((count ?? 0) > 0) {
      redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_locked`)
    }
  }

  const { error } = await supabase
    .from('action_items')
    .update({
      due_on: dueOn ?? null,
      review_requested: item.assigned_client_member_id ? wantReview : false,
    })
    .eq('id', item.id)
  if (error) {
    console.error('[homework] edit failed:', error.message)
    redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_error`)
  }
  revalidatePath(`/engagements/${engagementId}`)
  revalidatePath(`/engagements/${engagementId}/homework/${itemId}`)
  revalidatePath('/homework')
  revalidatePath('/home')
  redirect(`/engagements/${engagementId}/homework/${itemId}?state=hw_saved`)
}

// ── Group scheduling: the date poll (V2 3H) ───────────────────────────
// Candidates come from the practice's own offered slots (the Ring 2
// engine, reused); confirming re-validates against a fresh computation
// and books through the existing session path, so the exclusion
// constraint stays the last word. Poll rows ride the session client
// under engagement.write.

const PollCreateShape = z.object({
  engagementId: z.string().uuid(),
  purpose: z.string().trim().max(200).optional(),
  starts: z.array(z.string().datetime({ offset: true })).min(1).max(8),
})

export async function createSessionPoll(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = PollCreateShape.safeParse({
    engagementId: formData.get('engagementId'),
    purpose: String(formData.get('purpose') ?? '').trim() || undefined,
    starts: formData.getAll('starts').map(String),
  })
  if (!parsed.success) redirect('/engagements')
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', d.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')
  const back = (state: string) =>
    redirect(`/engagements/${engagement.id}?state=${state}#scheduling`)

  // Every candidate must be an offered slot RIGHT NOW; a hand-crafted
  // POST cannot put a time on the poll the calendar cannot honor.
  const offered = await assembleSlots(supabase, { practiceId: engagement.practice_id }, new Date())
  const candidates = d.starts.map((s) => isOfferedSlot(offered, new Date(s)))
  if (candidates.some((c) => c === null)) back('poll_slot_gone')

  const { data: poll, error } = await supabase
    .from('session_polls')
    .insert({
      engagement_id: engagement.id,
      practice_id: engagement.practice_id,
      client_id: engagement.client_id,
      purpose: d.purpose ? sweepHomework(engagement.practice_id, d.purpose) : null,
      created_by: viewer.user!.id,
    })
    .select('id')
    .single()
  if (error || !poll) {
    // 23505: the one-open-poll index; there is already a live poll.
    console.error('[polls] create failed:', error?.code)
    back(error?.code === '23505' ? 'poll_exists' : 'poll_error')
  }

  const rows = (candidates as NonNullable<(typeof candidates)[number]>[]).map((slot, i) => ({
    poll_id: poll!.id,
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    starts_at: slot.startsAt.toISOString(),
    ends_at: slot.endsAt.toISOString(),
    tz: slot.tz,
    sort: i,
  }))
  const { error: optError } = await supabase.from('session_poll_options').insert(rows)
  if (optError) {
    console.error('[polls] options failed:', optError.message)
    // Leave nothing half-open: close the empty poll honestly.
    await supabase
      .from('session_polls')
      .update({ status: 'closed', closed_at: new Date().toISOString() })
      .eq('id', poll!.id)
    back('poll_error')
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'poll.opened',
    target: engagement.id,
    detail: { options: rows.length },
  })
  await notify(
    {
      practiceId: engagement.practice_id,
      clientId: engagement.client_id,
      engagementId: engagement.id,
      kind: 'poll_opened',
      title: 'Pick the next session date: mark the times that work',
      href: '/sessions',
    },
    await clientTeamRecipients(engagement.client_id)
  )
  revalidatePath(`/engagements/${engagement.id}`)
  revalidatePath('/sessions')
  revalidatePath('/home')
  back('poll_opened')
}

const PollMoveShape = z.object({
  pollId: z.string().uuid(),
  engagementId: z.string().uuid(),
  optionId: z.string().uuid().optional(),
})

export async function confirmPollOption(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = PollMoveShape.safeParse({
    pollId: formData.get('pollId'),
    engagementId: formData.get('engagementId'),
    optionId: formData.get('optionId'),
  })
  if (!parsed.success || !parsed.data.optionId) redirect('/engagements')
  const { pollId, engagementId, optionId } = parsed.data

  const supabase = await createServerSupabase()
  const { data: poll } = await supabase
    .from('session_polls')
    .select('id, engagement_id, practice_id, client_id, status')
    .eq('id', pollId)
    .eq('engagement_id', engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  const { data: option } = await supabase
    .from('session_poll_options')
    .select('id, starts_at, ends_at, tz')
    .eq('id', optionId)
    .eq('poll_id', pollId)
    .maybeSingle()
  const back = (state: string) => redirect(`/engagements/${engagementId}?state=${state}#scheduling`)
  if (!poll || poll.status !== 'open' || !option) back('poll_error')

  // The candidate must still be offered at CONFIRM time; a stale one
  // refuses honestly and stays on the poll.
  const offered = await assembleSlots(supabase, { practiceId: poll!.practice_id }, new Date())
  const slot = isOfferedSlot(offered, new Date(option!.starts_at))
  if (!slot) back('poll_slot_gone')

  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      engagement_id: poll!.engagement_id,
      practice_id: poll!.practice_id,
      client_id: poll!.client_id,
      starts_at: slot!.startsAt.toISOString(),
      ends_at: slot!.endsAt.toISOString(),
      tz: slot!.tz,
      kind: 'working',
      status: 'booked',
      created_by: viewer.user!.id,
    })
    .select('id')
    .single()
  if (error || !session) {
    const gone = error?.code === '23P01'
    console.error('[polls] confirm booking failed:', error?.code)
    back(gone ? 'poll_slot_gone' : 'poll_error')
  }

  const { error: closeError } = await supabase
    .from('session_polls')
    .update({ status: 'booked', session_id: session!.id, closed_at: new Date().toISOString() })
    .eq('id', poll!.id)
  if (closeError) console.error('[polls] close after booking failed:', closeError.message)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'poll.booked',
    target: poll!.id,
    detail: { session: session!.id },
  })
  await notify(
    {
      practiceId: poll!.practice_id,
      clientId: poll!.client_id,
      engagementId: poll!.engagement_id,
      kind: 'poll_booked',
      title: 'The next session is booked',
      href: '/sessions',
    },
    await clientTeamRecipients(poll!.client_id)
  )
  revalidatePath(`/engagements/${engagementId}`)
  revalidatePath('/sessions')
  revalidatePath('/home')
  revalidatePath('/today')
  back('poll_booked')
}

export async function closeSessionPoll(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = PollMoveShape.safeParse({
    pollId: formData.get('pollId'),
    engagementId: formData.get('engagementId'),
  })
  if (!parsed.success) redirect('/engagements')
  const { pollId, engagementId } = parsed.data

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('session_polls')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', pollId)
    .eq('engagement_id', engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .eq('status', 'open')
  if (error) console.error('[polls] close failed:', error.message)

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'poll.closed',
    target: pollId,
  })
  revalidatePath(`/engagements/${engagementId}`)
  revalidatePath('/sessions')
  revalidatePath('/home')
  redirect(`/engagements/${engagementId}?state=poll_closed#scheduling`)
}

// ── Deliverable lifecycle (V2 3D) ─────────────────────────────────────
// About and the session link edit in place; replacing a FILE keeps the
// outgoing object as an append-only version row before the pointer
// moves; acceptance rides the 5D approvals machinery unchanged.

const AboutShape = z.object({
  deliverableId: z.string().uuid(),
  engagementId: z.string().uuid(),
  about: z.string().trim().max(4000).optional(),
  sessionId: z.string().uuid().optional(),
})

export async function updateDeliverableAbout(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const clean = (name: string) => {
    const v = String(formData.get(name) ?? '').trim()
    return v || undefined
  }
  const parsed = AboutShape.safeParse({
    deliverableId: formData.get('deliverableId'),
    engagementId: formData.get('engagementId'),
    about: clean('about'),
    sessionId: clean('sessionId'),
  })
  if (!parsed.success) redirect('/engagements')
  const d = parsed.data

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('deliverables')
    .select('id, engagement_id, practice_id')
    .eq('id', d.deliverableId)
    .eq('engagement_id', d.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!row) redirect('/engagements')

  let sessionId: string | null = null
  if (d.sessionId) {
    const { data: sess } = await supabase
      .from('sessions')
      .select('id')
      .eq('id', d.sessionId)
      .eq('engagement_id', row.engagement_id)
      .maybeSingle()
    sessionId = sess?.id ?? null
  }

  const { error } = await supabase
    .from('deliverables')
    .update({
      about_md: d.about ? sweepHomework(row.practice_id, d.about) : null,
      session_id: sessionId,
    })
    .eq('id', row.id)
  if (error) {
    console.error('[deliverables] about update failed:', error.message)
    redirect(`/engagements/${d.engagementId}?state=dlv_error`)
  }
  revalidatePath(`/engagements/${d.engagementId}`)
  revalidatePath('/deliverables')
  redirect(`/engagements/${d.engagementId}?state=dlv_saved`)
}

export async function replaceDeliverableFile(
  deliverableId: string,
  engagementId: string,
  storagePath: string
): Promise<{ ok: true } | { error: string }> {
  const viewer = await guardPractice()
  if (
    !z.string().uuid().safeParse(deliverableId).success ||
    !z.string().uuid().safeParse(engagementId).success ||
    typeof storagePath !== 'string' ||
    storagePath.length > 500
  ) {
    return { error: 'invalid' }
  }

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('deliverables')
    .select('id, kind, storage_path, engagement_id, practice_id, client_id')
    .eq('id', deliverableId)
    .eq('engagement_id', engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!row || row.kind !== 'file' || !row.storage_path) return { error: 'not_found' }
  if (!storagePath.startsWith(`${row.practice_id}/${row.client_id}/${row.engagement_id}/`)) {
    return { error: 'invalid' }
  }

  // The outgoing object becomes history BEFORE the pointer moves;
  // nothing is deleted, ever.
  const { count } = await supabase
    .from('deliverable_versions')
    .select('id', { count: 'exact', head: true })
    .eq('deliverable_id', row.id)
  const { error: versionError } = await supabase.from('deliverable_versions').insert({
    deliverable_id: row.id,
    engagement_id: row.engagement_id,
    practice_id: row.practice_id,
    client_id: row.client_id,
    version: (count ?? 0) + 1,
    storage_path: row.storage_path,
    replaced_by: viewer.user!.id,
  })
  if (versionError) {
    console.error('[deliverables] version record failed:', versionError.message)
    return { error: 'save_failed' }
  }

  const { error } = await supabase
    .from('deliverables')
    .update({ storage_path: storagePath })
    .eq('id', row.id)
  if (error) {
    console.error('[deliverables] replace failed:', error.message)
    return { error: 'save_failed' }
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'deliverable.replaced',
    target: row.id,
    detail: { version: (count ?? 0) + 1 },
  })
  revalidatePath(`/engagements/${engagementId}`)
  revalidatePath('/deliverables')
  return { ok: true }
}

const AcceptanceShape = z.object({
  deliverableId: z.string().uuid(),
  engagementId: z.string().uuid(),
})

export async function requestDeliverableAcceptance(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = AcceptanceShape.safeParse({
    deliverableId: formData.get('deliverableId'),
    engagementId: formData.get('engagementId'),
  })
  if (!parsed.success) redirect('/engagements')
  const { deliverableId, engagementId } = parsed.data

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('deliverables')
    .select('id, title, engagement_id, practice_id, client_id')
    .eq('id', deliverableId)
    .eq('engagement_id', engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!row) redirect('/engagements')

  // The charter discipline: one live ask at a time, ever green once.
  const { data: existing } = await supabase
    .from('approvals')
    .select('id')
    .eq('subject_type', 'deliverable')
    .eq('subject_id', row.id)
    .in('status', ['pending', 'approved'])
    .limit(1)
    .maybeSingle()
  if (existing) redirect(`/engagements/${engagementId}?state=dlv_already_asked`)

  const { error } = await supabase.from('approvals').insert({
    practice_id: row.practice_id,
    client_id: row.client_id,
    engagement_id: row.engagement_id,
    subject_type: 'deliverable',
    subject_id: row.id,
    subject_label: `the deliverable: ${row.title}`,
    requested_by: viewer.user!.id,
  })
  if (error) {
    console.error('[deliverables] acceptance request failed:', error.message)
    redirect(`/engagements/${engagementId}?state=dlv_error`)
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'deliverable.acceptance_requested',
    target: row.id,
  })
  await notify(
    {
      practiceId: row.practice_id,
      clientId: row.client_id,
      engagementId: row.engagement_id,
      kind: 'approval_waiting',
      title: `Your acceptance is asked: ${row.title}`,
      href: '/deliverables',
    },
    await clientTeamRecipients(row.client_id)
  )
  revalidatePath(`/engagements/${engagementId}`)
  revalidatePath('/deliverables')
  revalidatePath('/home')
  redirect(`/engagements/${engagementId}?state=dlv_asked`)
}

// ── Digest cadence (V2 3G) ────────────────────────────────────────────

const CadenceShape = z.object({
  engagementId: z.string().uuid(),
  cadence: z.enum(['weekly', 'biweekly', 'off']),
})

export async function setDigestCadence(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = CadenceShape.safeParse({
    engagementId: formData.get('engagementId'),
    cadence: formData.get('cadence'),
  })
  if (!parsed.success) redirect('/engagements')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('engagements')
    .update({ digest_cadence: parsed.data.cadence })
    .eq('id', parsed.data.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
  if (error) {
    console.error('[digest] cadence save failed:', error.message)
    redirect(`/engagements/${parsed.data.engagementId}?state=cadence_error#digests`)
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'digest.cadence',
    target: parsed.data.engagementId,
    detail: { cadence: parsed.data.cadence },
  })
  revalidatePath(`/engagements/${parsed.data.engagementId}`)
  redirect(`/engagements/${parsed.data.engagementId}?state=cadence_saved#digests`)
}

// ── Readiness evidence (V2 4D) ────────────────────────────────────────
// Judgments get receipts. The table sits behind the lens wall
// (practice-only read); the writes ride engagement.write through the
// session client, and every ref is validated against the engagement's
// OWN artifacts before a link exists.

const ReadinessEvidenceShape = z.object({
  engagementId: z.string().uuid(),
  pillar: z.enum(['philosophy', 'system', 'execution']),
  ref: z
    .string()
    .regex(/^(session|action_item|decision|deliverable):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  note: z.string().trim().max(300).optional(),
})

const READINESS_REF_TABLES = {
  session: 'sessions',
  action_item: 'action_items',
  decision: 'decisions',
  deliverable: 'deliverables',
} as const

export async function addReadinessEvidence(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = ReadinessEvidenceShape.safeParse({
    engagementId: formData.get('engagementId'),
    pillar: formData.get('pillar'),
    ref: formData.get('ref'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/engagements')
  const d = parsed.data
  const [kind, refId] = d.ref.split(':') as [keyof typeof READINESS_REF_TABLES, string]

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, practice_id, client_id')
    .eq('id', d.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  const { data: artifact } = await supabase
    .from(READINESS_REF_TABLES[kind])
    .select('id')
    .eq('id', refId)
    .eq('engagement_id', engagement.id)
    .maybeSingle()
  if (!artifact) redirect(`/engagements/${engagement.id}?state=readiness_error#readiness`)

  const { error } = await supabase.from('readiness_evidence').insert({
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    pillar: d.pillar,
    kind,
    ref_id: refId,
    note: d.note ?? null,
    added_by: viewer.user!.id,
  })
  if (error) {
    console.error('[readiness] evidence link failed:', error.message)
    redirect(`/engagements/${engagement.id}?state=readiness_error#readiness`)
  }
  revalidatePath(`/engagements/${engagement.id}`)
  redirect(`/engagements/${engagement.id}?state=readiness_linked#readiness`)
}

const ReadinessRemoveShape = z.object({
  evidenceId: z.string().uuid(),
  engagementId: z.string().uuid(),
})

export async function removeReadinessEvidence(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = ReadinessRemoveShape.safeParse({
    evidenceId: formData.get('evidenceId'),
    engagementId: formData.get('engagementId'),
  })
  if (!parsed.success) redirect('/engagements')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('readiness_evidence')
    .delete()
    .eq('id', parsed.data.evidenceId)
    .eq('engagement_id', parsed.data.engagementId)
    .eq('practice_id', viewer.practice!.practiceId)
  if (error) console.error('[readiness] evidence remove failed:', error.message)
  revalidatePath(`/engagements/${parsed.data.engagementId}`)
  redirect(`/engagements/${parsed.data.engagementId}?state=readiness_removed#readiness`)
}

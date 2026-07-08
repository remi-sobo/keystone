'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
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

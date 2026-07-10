'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
import { logAuditAction } from '@/lib/audit'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'

/**
 * Resource authoring (Ring 4). The catalog is practice IP: writes ride
 * the SESSION client so the consultant-only RLS policies stay the wall,
 * and every body passes the voice gate before it ships to a client
 * surface. Tags are a comma list in the form, an array in the row.
 */

async function guardPractice() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  return viewer
}

const ResourceShape = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(['guide', 'framework', 'template']),
  tags: z.string().max(500),
  body: z.string().max(50000),
})

function parseTags(raw: string): string[] {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12)
}

async function sweepBody(practiceId: string, body: string): Promise<string> {
  const check = validateVoice(body)
  if (check.ok) return body
  void logVoiceViolation({
    practiceId,
    source: 'resource_authoring',
    violations: check.violations,
    rawExcerpt: body.slice(0, 400),
    cleanedExcerpt: check.cleaned.slice(0, 400),
  })
  return check.cleaned
}

export async function createResource(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = ResourceShape.safeParse({
    title: formData.get('title'),
    kind: formData.get('kind'),
    tags: formData.get('tags') ?? '',
    body: formData.get('body') ?? '',
  })
  if (!parsed.success) redirect('/library/authoring?state=invalid')

  const practiceId = viewer.practice!.practiceId
  const supabase = await createServerSupabase()
  const { error } = await supabase.from('resources').insert({
    practice_id: practiceId,
    title: parsed.data.title,
    kind: parsed.data.kind,
    tags: parseTags(parsed.data.tags),
    body_md: await sweepBody(practiceId, parsed.data.body),
    created_by: viewer.user!.id,
  })
  if (error) {
    console.error('[library] create failed:', error.message)
    redirect('/library/authoring?state=save_failed')
  }
  revalidatePath('/library/authoring')
  revalidatePath('/library')
  redirect('/library/authoring?state=created')
}

const UpdateShape = ResourceShape.extend({ resourceId: z.string().uuid() })

export async function updateResource(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = UpdateShape.safeParse({
    resourceId: formData.get('resourceId'),
    title: formData.get('title'),
    kind: formData.get('kind'),
    tags: formData.get('tags') ?? '',
    body: formData.get('body') ?? '',
  })
  if (!parsed.success) redirect('/library/authoring?state=invalid')

  const practiceId = viewer.practice!.practiceId
  const supabase = await createServerSupabase()
  const { error, count } = await supabase
    .from('resources')
    .update(
      {
        title: parsed.data.title,
        kind: parsed.data.kind,
        tags: parseTags(parsed.data.tags),
        body_md: await sweepBody(practiceId, parsed.data.body),
        updated_at: new Date().toISOString(),
      },
      { count: 'exact' }
    )
    .eq('id', parsed.data.resourceId)
    .eq('practice_id', practiceId)
  if (error || count === 0) {
    console.error('[library] update failed:', error?.message ?? 'no matching row')
    redirect('/library/authoring?state=save_failed')
  }
  revalidatePath('/library/authoring')
  revalidatePath('/library')
  redirect(`/library/authoring/${parsed.data.resourceId}?state=saved`)
}

const DeleteShape = z.object({ resourceId: z.string().uuid() })

export async function deleteResource(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const parsed = DeleteShape.safeParse({ resourceId: formData.get('resourceId') })
  if (!parsed.success) redirect('/library/authoring')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('id', parsed.data.resourceId)
    .eq('practice_id', viewer.practice!.practiceId)
  if (error) console.error('[library] delete failed:', error.message)
  revalidatePath('/library/authoring')
  revalidatePath('/library')
  redirect('/library/authoring?state=deleted')
}

// ── Document attachments (a resource can carry a PDF or Word file) ────

const DOC_EXT = /\.(pdf|doc|docx)$/i

/**
 * Mint a signed upload URL for a resource document. Same contract as
 * deliverables and the agreement store: direct-to-storage after the
 * membership check, into the resources bucket whose read policy
 * already serves the practice and every client member of the practice
 * by path.
 */
export async function prepareResourceUpload(
  resourceId: string,
  filename: string
): Promise<{ path: string; token: string } | { error: string }> {
  const viewer = await guardPractice()
  const idCheck = z.string().uuid().safeParse(resourceId)
  if (!idCheck.success) return { error: 'invalid' }
  if (!DOC_EXT.test(filename)) return { error: 'doc_only' }

  const supabase = await createServerSupabase()
  const { data: resource } = await supabase
    .from('resources')
    .select('id, practice_id')
    .eq('id', idCheck.data)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!resource) return { error: 'not_found' }

  const safeName =
    filename
      .split(/[\\/]/)
      .pop()!
      .replace(/[^a-zA-Z0-9._ -]/g, '_')
      .slice(0, 120) || 'document.pdf'
  const objectPath = `${resource.practice_id}/${resource.id}/${randomUUID()}/${safeName}`

  const { data, error } = await supabaseAdmin.storage
    .from('resources')
    .createSignedUploadUrl(objectPath)
  if (error || !data) {
    console.error('[library] signed upload mint failed:', error?.message)
    return { error: 'upload_unavailable' }
  }
  return { path: data.path, token: data.token }
}

export async function attachResourceFile(
  resourceId: string,
  storagePath: string
): Promise<{ ok: true } | { error: string }> {
  const viewer = await guardPractice()
  const idCheck = z.string().uuid().safeParse(resourceId)
  const pathCheck = z.string().max(500).safeParse(storagePath)
  if (!idCheck.success || !pathCheck.success) return { error: 'invalid' }

  const supabase = await createServerSupabase()
  const { data: resource } = await supabase
    .from('resources')
    .select('id, practice_id, storage_path')
    .eq('id', idCheck.data)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!resource) return { error: 'not_found' }
  // The path must sit inside THIS resource's folder.
  if (!pathCheck.data.startsWith(`${resource.practice_id}/${resource.id}/`))
    return { error: 'invalid' }

  const previous = resource.storage_path
  const { error } = await supabase
    .from('resources')
    .update({ storage_path: pathCheck.data, updated_at: new Date().toISOString() })
    .eq('id', resource.id)
  if (error) return { error: 'save_failed' }

  if (previous) {
    // Replace means replace: the old object goes, service role after
    // the scoped read above.
    const { error: cleanupError } = await supabaseAdmin.storage
      .from('resources')
      .remove([previous])
    if (cleanupError) console.error('[library] old object removal failed:', cleanupError.message)
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'resources.document_attached',
    target: resource.id,
  })
  revalidatePath('/library/authoring')
  revalidatePath(`/library/authoring/${resource.id}`)
  revalidatePath('/library')
  return { ok: true }
}

export async function removeResourceFile(formData: FormData): Promise<void> {
  const viewer = await guardPractice()
  const id = z.string().uuid().safeParse(formData.get('resourceId'))
  if (!id.success) redirect('/library/authoring')

  const supabase = await createServerSupabase()
  const { data: resource } = await supabase
    .from('resources')
    .select('id, storage_path')
    .eq('id', id.data)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!resource) redirect('/library/authoring')

  const { error } = await supabase
    .from('resources')
    .update({ storage_path: null, updated_at: new Date().toISOString() })
    .eq('id', resource.id)
  if (!error && resource.storage_path) {
    const { error: cleanupError } = await supabaseAdmin.storage
      .from('resources')
      .remove([resource.storage_path])
    if (cleanupError) console.error('[library] object removal failed:', cleanupError.message)
    await logAuditAction({
      actorEmail: viewer.user!.email ?? '',
      action: 'resources.document_removed',
      target: resource.id,
    })
  }
  revalidatePath(`/library/authoring/${resource.id}`)
  revalidatePath('/library')
  redirect(`/library/authoring/${resource.id}?state=doc_removed`)
}

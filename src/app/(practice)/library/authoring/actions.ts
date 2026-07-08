'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
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

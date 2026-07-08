'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

/**
 * Readiness panel save (Ring 3). Prose markers, consultant-only, saved
 * through the SESSION client so the readiness RLS policies stay the
 * wall. Never a score; the panel renders beside the facts.
 */

const ReadinessShape = z.object({
  engagementId: z.string().uuid(),
  pillar: z.enum(['philosophy', 'system', 'execution']),
  note: z.string().max(8000),
})

export async function saveReadiness(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')

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
    .eq('practice_id', viewer.practice.practiceId)
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
      updated_by: viewer.user.id,
    },
    { onConflict: 'engagement_id,pillar' }
  )
  if (error) console.error('[readiness] save failed:', error.message)
  revalidatePath(`/engagements/${engagement.id}`)
}

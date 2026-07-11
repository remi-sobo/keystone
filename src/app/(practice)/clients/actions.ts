'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { logAuditAction } from '@/lib/audit'

/**
 * Add a client from the clients page. The same row the members page
 * and the builder write, through the SESSION client: clients_write
 * RLS demands practice.manage, so this stays owner-only with the
 * policy as the wall, not an app check. A consultant hitting it gets
 * the honest owner-only state, never a silent success.
 */
export async function addClientFromList(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')

  const name = z.string().trim().min(1).max(120).safeParse(formData.get('name'))
  if (!name.success) redirect('/clients?state=invalid')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('clients')
    .insert({ practice_id: viewer.practice.practiceId, name: name.data })
  if (error) {
    // RLS denial reads as owner-only; anything else is a plain error.
    const ownerOnly = error.code === '42501'
    console.error('[clients] add failed:', error.code)
    redirect(`/clients?state=${ownerOnly ? 'owner_only' : 'error'}`)
  }
  await logAuditAction({
    actorEmail: viewer.user.email ?? '',
    action: 'members.client_added',
    target: name.data,
    detail: { via: 'clients_page' },
    practiceId: viewer.practice.practiceId,
  })
  revalidatePath('/clients')
  redirect('/clients?state=added')
}

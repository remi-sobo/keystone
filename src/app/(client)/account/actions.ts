'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

/**
 * Account actions (client surface, PURE RLS). The one setting is the
 * 4F mute: your notification email, batched (default) or off. The
 * prefs policies admit only your own row, so the upsert needs no check
 * beyond the session itself.
 */

const PrefShape = z.object({ mode: z.enum(['batched', 'off']) })

export async function saveEmailPref(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const parsed = PrefShape.safeParse({ mode: formData.get('mode') })
  if (!parsed.success) redirect('/account')

  const supabase = await createServerSupabase()
  const { data: me } = await supabase
    .from('client_members')
    .select('id, practice_id')
    .eq('user_id', viewer.user.id)
    .eq('client_id', viewer.client.clientId)
    .maybeSingle()
  if (!me) redirect('/account')

  const { error } = await supabase.from('notification_prefs').upsert(
    {
      practice_id: me.practice_id,
      client_member_id: me.id,
      email_mode: parsed.data.mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_member_id' }
  )
  if (error) console.error('[prefs] save failed:', error.code)
  revalidatePath('/account')
  redirect('/account?state=saved')
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { syncPracticeCalendar } from '@/lib/calendarSync'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'

/**
 * Settings actions (practice surface). Window CRUD writes through the
 * SESSION client so RLS stays the wall even here; only the calendar
 * sync (which must read the deny-all token table) goes service-role,
 * and it re-resolves practice membership first.
 */

const WindowShape = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  tz: z.string().min(1).max(64),
})

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export async function addWindow(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.practice) redirect('/login')

  const parsed = WindowShape.safeParse({
    weekday: formData.get('weekday'),
    start: formData.get('start'),
    end: formData.get('end'),
    tz: formData.get('tz'),
  })
  if (!parsed.success || minutes(parsed.data.end) <= minutes(parsed.data.start)) {
    redirect('/settings?window=invalid')
  }

  const supabase = await createServerSupabase()
  const { data: member } = await supabase
    .from('practice_members')
    .select('id')
    .eq('user_id', viewer.user!.id)
    .eq('practice_id', viewer.practice.practiceId)
    .maybeSingle()
  if (!member) redirect('/login')

  const { error } = await supabase.from('availability_windows').insert({
    practice_id: viewer.practice.practiceId,
    practice_member_id: member.id,
    weekday: parsed.data.weekday,
    start_min: minutes(parsed.data.start),
    end_min: minutes(parsed.data.end),
    tz: parsed.data.tz,
  })
  if (error) {
    console.error('[settings] window insert failed:', error.message)
    redirect('/settings?window=error')
  }
  revalidatePath('/settings')
}

export async function removeWindow(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.practice) redirect('/login')
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) redirect('/settings?window=invalid')

  const supabase = await createServerSupabase()
  // RLS scopes the delete; the practice filter is belt and suspenders.
  const { error } = await supabase
    .from('availability_windows')
    .delete()
    .eq('id', id.data)
    .eq('practice_id', viewer.practice.practiceId)
  if (error) console.error('[settings] window delete failed:', error.message)
  revalidatePath('/settings')
}

export async function syncNow(): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.practice || !viewer.user) redirect('/login')

  const limited = await checkRateLimits([
    { config: LIMITS.CALENDAR_SYNC_PER_HOUR, key: viewer.user.id },
  ])
  if (!limited.ok) redirect('/settings?calendar=slow')

  const result = await syncPracticeCalendar({
    userId: viewer.user.id,
    email: viewer.user.email ?? '',
    practiceId: viewer.practice.practiceId,
    role: viewer.practice.role,
  })
  if (result.detail === 'not_connected') redirect('/settings?calendar=not_connected')
  revalidatePath('/settings')
  redirect(
    result.ok
      ? `/settings?calendar=synced&n=${result.inserted + result.patched + result.removed}`
      : '/settings?calendar=sync_partial'
  )
}

// ── 4F: the notification email mute ──────────────────────────────────

const PrefShape = z.object({ mode: z.enum(['batched', 'off']) })

export async function saveEmailPref(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')

  const parsed = PrefShape.safeParse({ mode: formData.get('mode') })
  if (!parsed.success) redirect('/settings')

  const supabase = await createServerSupabase()
  const { data: me } = await supabase
    .from('practice_members')
    .select('id, practice_id')
    .eq('user_id', viewer.user.id)
    .eq('practice_id', viewer.practice.practiceId)
    .is('revoked_at', null)
    .maybeSingle()
  if (!me) redirect('/settings')

  const { error } = await supabase.from('notification_prefs').upsert(
    {
      practice_id: me.practice_id,
      practice_member_id: me.id,
      email_mode: parsed.data.mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'practice_member_id' }
  )
  if (error) console.error('[prefs] save failed:', error.code)
  revalidatePath('/settings')
}

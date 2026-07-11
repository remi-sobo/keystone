'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { syncPracticeCalendar } from '@/lib/calendarSync'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { logAuditAction } from '@/lib/audit'
import { zonedInstant } from '@/lib/scheduling'

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

// ── 4I: scheduling boundaries and blackouts ──────────────────────────
// Both write through the SESSION client: the scheduling_settings and
// scheduling_blackouts policies (engagement.write via the permission
// authority) are the wall. Sixty minutes is always offered; ninety and
// one-twenty are toggles; the default collapses into the offer.

const SchedulingShape = z.object({
  buffer: z.coerce.number().int().min(0).max(120),
  lead: z.coerce.number().int().min(0).max(336),
  horizon: z.coerce.number().int().min(1).max(60),
  defaultDuration: z.coerce.number().int(),
  videoLink: z
    .string()
    .trim()
    .max(400)
    .refine((s) => s === '' || /^https:\/\/\S+$/.test(s), 'https link or empty'),
})

export async function saveScheduling(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.practice) redirect('/login')

  const parsed = SchedulingShape.safeParse({
    buffer: formData.get('buffer'),
    lead: formData.get('lead'),
    horizon: formData.get('horizon'),
    defaultDuration: formData.get('defaultDuration'),
    videoLink: formData.get('videoLink') ?? '',
  })
  if (!parsed.success) redirect('/settings?scheduling=invalid')

  const durations = [60]
  if (formData.get('offer90') === 'on') durations.push(90)
  if (formData.get('offer120') === 'on') durations.push(120)
  const fallback = durations.includes(parsed.data.defaultDuration)
    ? parsed.data.defaultDuration
    : 60

  const supabase = await createServerSupabase()
  const { error } = await supabase.from('scheduling_settings').upsert(
    {
      practice_id: viewer.practice.practiceId,
      buffer_min: parsed.data.buffer,
      lead_hours: parsed.data.lead,
      horizon_days: parsed.data.horizon,
      duration_options: durations,
      default_duration_min: fallback,
      video_link: parsed.data.videoLink || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'practice_id' }
  )
  if (error) {
    console.error('[settings] scheduling save failed:', error.code)
    redirect('/settings?scheduling=error')
  }
  await logAuditAction({
    actorEmail: viewer.user?.email ?? '',
    action: 'scheduling.settings_saved',
    target: viewer.practice.practiceId,
    detail: {
      buffer_min: parsed.data.buffer,
      lead_hours: parsed.data.lead,
      horizon_days: parsed.data.horizon,
      duration_options: durations,
      has_video_link: !!parsed.data.videoLink,
    },
  })
  revalidatePath('/settings')
  redirect('/settings?scheduling=saved')
}

const BlackoutShape = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().max(200),
})

export async function addBlackout(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.practice) redirect('/login')

  const parsed = BlackoutShape.safeParse({
    start: formData.get('start'),
    end: formData.get('end'),
    reason: formData.get('reason') ?? '',
  })
  if (!parsed.success || parsed.data.end < parsed.data.start) {
    redirect('/settings?blackout=invalid')
  }

  const supabase = await createServerSupabase()

  // The range spans full days in the practice's scheduling zone: the
  // first availability window's tz, the engine default otherwise.
  const { data: firstWindow } = await supabase
    .from('availability_windows')
    .select('tz')
    .eq('practice_id', viewer.practice.practiceId)
    .limit(1)
    .maybeSingle()
  const tz = firstWindow?.tz ?? 'America/Los_Angeles'

  const [sy, sm, sd] = parsed.data.start.split('-').map(Number)
  const [ey, em, ed] = parsed.data.end.split('-').map(Number)
  // Inclusive end date: the range runs to midnight AFTER the end date.
  const dayAfterEnd = new Date(Date.UTC(ey, em - 1, ed) + 86400000)
  const startsAt = zonedInstant(sy, sm, sd, 0, tz)
  const endsAt = zonedInstant(
    dayAfterEnd.getUTCFullYear(),
    dayAfterEnd.getUTCMonth() + 1,
    dayAfterEnd.getUTCDate(),
    0,
    tz
  )
  if (endsAt.getTime() - startsAt.getTime() > 366 * 86400000) {
    redirect('/settings?blackout=invalid')
  }

  const { error } = await supabase.from('scheduling_blackouts').insert({
    practice_id: viewer.practice.practiceId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    reason: parsed.data.reason || null,
  })
  if (error) {
    console.error('[settings] blackout insert failed:', error.code)
    redirect('/settings?blackout=error')
  }
  await logAuditAction({
    actorEmail: viewer.user?.email ?? '',
    action: 'scheduling.blackout_added',
    target: viewer.practice.practiceId,
    detail: { days: Math.round((endsAt.getTime() - startsAt.getTime()) / 86400000) },
  })
  revalidatePath('/settings')
  redirect('/settings?blackout=saved')
}

export async function removeBlackout(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.practice) redirect('/login')
  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) redirect('/settings?blackout=invalid')

  const supabase = await createServerSupabase()
  // RLS scopes the delete; the practice filter is belt and suspenders.
  const { error } = await supabase
    .from('scheduling_blackouts')
    .delete()
    .eq('id', id.data)
    .eq('practice_id', viewer.practice.practiceId)
  if (error) console.error('[settings] blackout delete failed:', error.code)
  revalidatePath('/settings')
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

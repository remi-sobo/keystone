import type { SupabaseClient } from '@supabase/supabase-js'
import { computeSlots, type Slot } from '@/lib/scheduling'
import {
  fetchSchedulingSettings,
  resolveDuration,
  type SchedulingSettings,
} from '@/lib/schedulingSettings'

/**
 * Slot assembly for the booking surfaces. PURE RLS: reads go through
 * the session client. Windows are readable practice-wide by design;
 * the busy set comes from keystone_busy_intervals, the minimal-
 * disclosure SECURITY DEFINER function (bare intervals, no identity),
 * because a client member cannot and must not read other clients'
 * session rows. Since 4I the bridge folds in the cached real calendar
 * and blackout ranges, and the practice's scheduling_settings row
 * (readable by both sides) supplies buffer, notice, horizon, and the
 * duration; a requested duration outside the offer collapses to the
 * default. The practice side (the 3H poll) calls this too: the RPC is
 * membership-checked for both sides, so one assembly serves both
 * without a second code path.
 */
export async function assembleSlots(
  supabase: SupabaseClient,
  client: { practiceId: string },
  from: Date,
  opts: {
    durationMinutes?: number | null
    /** Bypass the offer check: an already-agreed duration (a poll's
     *  slot_minutes, a booked session being rescheduled) stays honest
     *  even after the practice narrows the offer. */
    exactDurationMinutes?: number
    settings?: SchedulingSettings
  } = {}
): Promise<Slot[]> {
  const settings = opts.settings ?? (await fetchSchedulingSettings(supabase, client.practiceId))
  const duration = opts.exactDurationMinutes ?? resolveDuration(settings, opts.durationMinutes)

  const [windowsRes, busyRes] = await Promise.all([
    supabase
      .from('availability_windows')
      .select('weekday, start_min, end_min, tz')
      .eq('practice_id', client.practiceId),
    supabase.rpc('keystone_busy_intervals', { p_practice: client.practiceId }),
  ])

  const windows = (windowsRes.data ?? []).map((w) => ({
    weekday: w.weekday as number,
    startMin: w.start_min as number,
    endMin: w.end_min as number,
    tz: w.tz as string,
  }))
  const busy = ((busyRes.data ?? []) as Array<{ starts_at: string; ends_at: string }>).map(
    (b) => ({ startsAt: new Date(b.starts_at), endsAt: new Date(b.ends_at) })
  )

  return computeSlots(
    windows,
    busy,
    from,
    settings.horizonDays,
    duration,
    settings.leadHours * 60,
    60,
    settings.bufferMin
  )
}

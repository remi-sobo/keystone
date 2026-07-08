import type { SupabaseClient } from '@supabase/supabase-js'
import { computeSlots, type Slot } from '@/lib/scheduling'
import type { ClientMembership } from '@/lib/membership'

/**
 * Slot assembly for the client booking surface. PURE RLS: reads go
 * through the session client. Windows are readable practice-wide by
 * design; the busy set comes from keystone_busy_intervals, the
 * minimal-disclosure SECURITY DEFINER function (bare intervals, no
 * identity), because a client member cannot and must not read other
 * clients' session rows.
 */
export async function assembleSlots(
  supabase: SupabaseClient,
  client: ClientMembership,
  from: Date
): Promise<Slot[]> {
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

  return computeSlots(windows, busy, from)
}

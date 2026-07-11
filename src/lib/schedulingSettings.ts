import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * lib/schedulingSettings.ts (V2 4I)
 *
 * The practice's scheduling boundaries: buffer, minimum notice, booking
 * horizon, the duration offer, and the video link. One row per practice
 * in scheduling_settings; an ABSENT row means these defaults, so the
 * booking surfaces work before the practice ever visits Settings. Reads
 * ride the caller's own session (the table is readable by both sides,
 * because the pure-RLS client booking page cannot offer honest slots
 * without the boundaries). resolveDuration is pure and gate-tested.
 */

export interface SchedulingSettings {
  bufferMin: number
  leadHours: number
  horizonDays: number
  durationOptions: number[]
  defaultDurationMin: number
  videoLink: string | null
}

export const SCHEDULING_DEFAULTS: SchedulingSettings = {
  bufferMin: 15,
  leadHours: 24,
  horizonDays: 30,
  durationOptions: [60, 90, 120],
  defaultDurationMin: 60,
  videoLink: null,
}

/**
 * The duration a booking may use: the requested one when it is in the
 * offer, otherwise the default, otherwise the shortest offered. A
 * hand-crafted duration outside the offer never survives this.
 */
export function resolveDuration(
  settings: Pick<SchedulingSettings, 'durationOptions' | 'defaultDurationMin'>,
  requested?: number | null
): number {
  const options = settings.durationOptions.length > 0 ? settings.durationOptions : [60]
  if (requested && options.includes(requested)) return requested
  if (options.includes(settings.defaultDurationMin)) return settings.defaultDurationMin
  return options[0]
}

export async function fetchSchedulingSettings(
  supabase: SupabaseClient,
  practiceId: string
): Promise<SchedulingSettings> {
  const { data } = await supabase
    .from('scheduling_settings')
    .select('buffer_min, lead_hours, horizon_days, duration_options, default_duration_min, video_link')
    .eq('practice_id', practiceId)
    .maybeSingle()
  if (!data) return SCHEDULING_DEFAULTS

  const options = ((data.duration_options as number[] | null) ?? [60])
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => a - b)
  return {
    bufferMin: data.buffer_min as number,
    leadHours: data.lead_hours as number,
    horizonDays: data.horizon_days as number,
    durationOptions: options.length > 0 ? options : [60],
    defaultDurationMin: data.default_duration_min as number,
    videoLink: (data.video_link as string | null) || null,
  }
}

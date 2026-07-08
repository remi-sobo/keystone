/**
 * lib/scheduling.ts
 *
 * The slot engine: PURE (no DB, no model call, no wall clock of its
 * own), per the playbook's pure-engines rule, so booking logic is
 * unit-tested without a database (e2e/scheduling-engine.spec.ts).
 *
 * Availability windows are weekly (weekday, minutes-from-midnight
 * range) in the consultant's IANA zone. The engine walks the requested
 * range day by day IN THAT ZONE, cuts each window into slots, converts
 * each slot to a real instant (DST-correct via the two-pass Intl
 * trick), and drops slots that collide with existing sessions or start
 * before the lead-time cutoff.
 */

export interface AvailabilityWindow {
  weekday: number // 0 = Sunday .. 6 = Saturday, in `tz`
  startMin: number
  endMin: number
  tz: string
}

export interface BusyInterval {
  startsAt: Date
  endsAt: Date
}

export interface Slot {
  startsAt: Date
  endsAt: Date
  tz: string
}

interface WallClock {
  y: number
  m: number // 1-12
  d: number
  minutes: number
  weekday: number // 0-6, Sunday 0
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The wall clock a UTC instant shows in `tz`. */
export function wallClockOf(ts: number, tz: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(new Date(ts))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  // Intl renders midnight as "24" with hour12:false in some engines.
  const hour = Number(get('hour')) % 24
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    minutes: hour * 60 + Number(get('minute')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  }
}

/**
 * The UTC instant at which `tz` shows (y-m-d, minutes). Two-pass
 * correction handles offsets and DST without a timezone library.
 */
export function zonedInstant(y: number, m: number, d: number, minutes: number, tz: string): Date {
  let ts = Date.UTC(y, m - 1, d, 0, minutes)
  for (let i = 0; i < 2; i++) {
    const wall = wallClockOf(ts, tz)
    const dayDiff = (Date.UTC(wall.y, wall.m - 1, wall.d) - Date.UTC(y, m - 1, d)) / 86400000
    const drift = dayDiff * 1440 + wall.minutes - minutes
    if (drift === 0) break
    ts -= drift * 60000
  }
  return new Date(ts)
}

function overlaps(aStart: Date, aEnd: Date, b: BusyInterval): boolean {
  return aStart < b.endsAt && aEnd > b.startsAt
}

/**
 * Compute open slots.
 *
 * @param windows   the consultant's weekly windows
 * @param busy      existing non-canceled sessions (any client of the
 *                  practice: one consultant, one calendar)
 * @param from      range start (usually "now", passed in so the engine
 *                  stays pure)
 * @param days      how many days ahead to offer
 * @param slotMinutes slot length
 * @param leadMinutes minimum notice before a slot may start
 * @param cap       maximum slots returned
 */
export function computeSlots(
  windows: AvailabilityWindow[],
  busy: BusyInterval[],
  from: Date,
  days = 14,
  slotMinutes = 60,
  leadMinutes = 24 * 60,
  cap = 60
): Slot[] {
  const slots: Slot[] = []
  const cutoff = new Date(from.getTime() + leadMinutes * 60000)

  for (let i = 0; i < days && slots.length < cap; i++) {
    // Noon anchor keeps the day identity stable across DST boundaries.
    const anchor = from.getTime() + i * 86400000
    for (const w of windows) {
      const wall = wallClockOf(anchor, w.tz)
      if (wall.weekday !== w.weekday) continue
      for (
        let startMin = w.startMin;
        startMin + slotMinutes <= w.endMin && slots.length < cap;
        startMin += slotMinutes
      ) {
        const startsAt = zonedInstant(wall.y, wall.m, wall.d, startMin, w.tz)
        const endsAt = new Date(startsAt.getTime() + slotMinutes * 60000)
        if (startsAt < cutoff) continue
        if (busy.some((b) => overlaps(startsAt, endsAt, b))) continue
        slots.push({ startsAt, endsAt, tz: w.tz })
      }
    }
  }

  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  return slots
}

/** True when `start` matches one of the offered slots exactly. Booking
 *  actions re-validate against this so a hand-crafted POST cannot book
 *  outside availability. */
export function isOfferedSlot(slots: Slot[], start: Date): Slot | null {
  return slots.find((s) => s.startsAt.getTime() === start.getTime()) ?? null
}

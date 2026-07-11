import { test, expect } from '@playwright/test'
import {
  computeSlots,
  zonedInstant,
  wallClockOf,
  isOfferedSlot,
} from '../src/lib/scheduling'
import { resolveDuration } from '../src/lib/schedulingSettings'

/**
 * Unit tests for the pure slot engine (no DB, no browser). The
 * timezone-correctness cases pin the two rules that matter: wall-clock
 * fidelity in the window's own zone, and DST transitions not shifting
 * offered hours.
 */

const LA = 'America/Los_Angeles'
const NY = 'America/New_York'

test('zonedInstant lands at the right wall-clock hour in its zone', () => {
  // 9:00 in Los Angeles on 2026-07-15 (PDT, UTC-7) is 16:00 UTC.
  const d = zonedInstant(2026, 7, 15, 9 * 60, LA)
  expect(d.toISOString()).toBe('2026-07-15T16:00:00.000Z')
  // The same wall clock in New York (EDT, UTC-4) is 13:00 UTC.
  const ny = zonedInstant(2026, 7, 15, 9 * 60, NY)
  expect(ny.toISOString()).toBe('2026-07-15T13:00:00.000Z')
})

test('zonedInstant is DST-correct on both sides of a transition', () => {
  // Before the November 2026 fall-back (PDT, UTC-7).
  expect(zonedInstant(2026, 10, 15, 9 * 60, LA).toISOString()).toBe('2026-10-15T16:00:00.000Z')
  // After the fall-back (PST, UTC-8): the same wall time is an hour later in UTC.
  expect(zonedInstant(2026, 11, 15, 9 * 60, LA).toISOString()).toBe('2026-11-15T17:00:00.000Z')
})

test('wallClockOf round-trips with zonedInstant', () => {
  const d = zonedInstant(2026, 7, 20, 14 * 60 + 30, LA)
  const wall = wallClockOf(d.getTime(), LA)
  expect(wall.y).toBe(2026)
  expect(wall.m).toBe(7)
  expect(wall.d).toBe(20)
  expect(wall.minutes).toBe(14 * 60 + 30)
  expect(wall.weekday).toBe(1) // 2026-07-20 is a Monday
})

test('computeSlots offers only window hours, respects lead time, and skips busy slots', () => {
  // Window: Mondays 9:00 to 12:00 Los Angeles. From a Sunday noon UTC.
  const windows = [{ weekday: 1, startMin: 9 * 60, endMin: 12 * 60, tz: LA }]
  const from = new Date('2026-07-19T12:00:00Z') // Sunday
  // Monday 2026-07-20 10:00 LA is already booked.
  const busy = [
    {
      startsAt: zonedInstant(2026, 7, 20, 10 * 60, LA),
      endsAt: zonedInstant(2026, 7, 20, 11 * 60, LA),
    },
  ]
  const slots = computeSlots(windows, busy, from, 8, 60, 24 * 60)

  // Monday the 20th is inside the 24h lead window for its 9:00 slot
  // (9:00 LA = 16:00 UTC, more than 24h after Sunday 12:00 UTC), so the
  // 20th offers 9:00 and 11:00 (10:00 is busy); the 27th is beyond the
  // range start plus 8 days? No: 2026-07-27 is day 8, inside the range.
  const rendered = slots.map((s) => `${s.startsAt.toISOString()}`)
  expect(rendered).toContain(zonedInstant(2026, 7, 20, 9 * 60, LA).toISOString())
  expect(rendered).toContain(zonedInstant(2026, 7, 20, 11 * 60, LA).toISOString())
  expect(rendered).not.toContain(zonedInstant(2026, 7, 20, 10 * 60, LA).toISOString())
  // Nothing outside the window's hours.
  for (const s of slots) {
    const wall = wallClockOf(s.startsAt.getTime(), LA)
    expect(wall.weekday).toBe(1)
    expect(wall.minutes).toBeGreaterThanOrEqual(9 * 60)
    expect(wall.minutes).toBeLessThan(12 * 60)
  }
})

test('lead time suppresses too-soon slots', () => {
  const windows = [{ weekday: 1, startMin: 9 * 60, endMin: 10 * 60, tz: LA }]
  // From Monday 2026-07-20 08:00 LA (15:00 UTC): the 9:00 slot that day
  // is only an hour away, inside the 24h lead, so the first offer is the
  // following Monday.
  const from = new Date('2026-07-20T15:00:00Z')
  const slots = computeSlots(windows, [], from, 14, 60, 24 * 60)
  expect(slots.length).toBeGreaterThan(0)
  expect(slots[0].startsAt.toISOString()).toBe(
    zonedInstant(2026, 7, 27, 9 * 60, LA).toISOString()
  )
})

test('the buffer pads busy intervals on both sides (V2 4I)', () => {
  // Window: Mondays 9:00 to 13:00 LA. Busy 10:00 to 11:00 with a 15
  // minute buffer kills 9:00 (ends 10:00, inside the pad) and 11:00
  // (starts inside the pad); 12:00 survives.
  const windows = [{ weekday: 1, startMin: 9 * 60, endMin: 13 * 60, tz: LA }]
  const from = new Date('2026-07-19T12:00:00Z') // Sunday
  const busy = [
    {
      startsAt: zonedInstant(2026, 7, 20, 10 * 60, LA),
      endsAt: zonedInstant(2026, 7, 20, 11 * 60, LA),
    },
  ]
  const unbuffered = computeSlots(windows, busy, from, 2, 60, 0, 60, 0)
  const buffered = computeSlots(windows, busy, from, 2, 60, 0, 60, 15)
  const iso = (slots: typeof buffered) => slots.map((s) => s.startsAt.toISOString())

  expect(iso(unbuffered)).toContain(zonedInstant(2026, 7, 20, 9 * 60, LA).toISOString())
  expect(iso(unbuffered)).toContain(zonedInstant(2026, 7, 20, 11 * 60, LA).toISOString())
  expect(iso(buffered)).not.toContain(zonedInstant(2026, 7, 20, 9 * 60, LA).toISOString())
  expect(iso(buffered)).not.toContain(zonedInstant(2026, 7, 20, 11 * 60, LA).toISOString())
  expect(iso(buffered)).toContain(zonedInstant(2026, 7, 20, 12 * 60, LA).toISOString())
})

test('90 and 120 minute slots stay inside the window (V2 4I)', () => {
  // Window: Mondays 9:00 to 12:00 LA (180 minutes).
  const windows = [{ weekday: 1, startMin: 9 * 60, endMin: 12 * 60, tz: LA }]
  const from = new Date('2026-07-19T12:00:00Z')
  const ninety = computeSlots(windows, [], from, 2, 90, 0)
  expect(ninety.map((s) => s.startsAt.toISOString())).toEqual([
    zonedInstant(2026, 7, 20, 9 * 60, LA).toISOString(),
    zonedInstant(2026, 7, 20, 10 * 60 + 30, LA).toISOString(),
  ])
  for (const s of ninety) {
    expect(s.endsAt.getTime() - s.startsAt.getTime()).toBe(90 * 60000)
  }
  const twoHours = computeSlots(windows, [], from, 2, 120, 0)
  expect(twoHours.map((s) => s.startsAt.toISOString())).toEqual([
    zonedInstant(2026, 7, 20, 9 * 60, LA).toISOString(),
  ])
})

test('resolveDuration collapses anything outside the offer (V2 4I)', () => {
  const settings = { durationOptions: [60, 90, 120], defaultDurationMin: 60 }
  expect(resolveDuration(settings, 90)).toBe(90)
  expect(resolveDuration(settings, 45)).toBe(60) // not offered
  expect(resolveDuration(settings, null)).toBe(60)
  expect(resolveDuration(settings, undefined)).toBe(60)
  // A default that fell out of the offer collapses to the shortest.
  expect(resolveDuration({ durationOptions: [90, 120], defaultDurationMin: 60 }, 45)).toBe(90)
  expect(resolveDuration({ durationOptions: [], defaultDurationMin: 60 }, 90)).toBe(60)
})

test('isOfferedSlot admits exact offers only', () => {
  const windows = [{ weekday: 1, startMin: 9 * 60, endMin: 11 * 60, tz: LA }]
  const from = new Date('2026-07-19T12:00:00Z')
  const slots = computeSlots(windows, [], from, 8)
  const offered = slots[0].startsAt
  expect(isOfferedSlot(slots, offered)).not.toBeNull()
  expect(isOfferedSlot(slots, new Date(offered.getTime() + 15 * 60000))).toBeNull()
})

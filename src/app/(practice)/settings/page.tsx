import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import {
  addBlackout,
  addWindow,
  removeBlackout,
  removeWindow,
  saveEmailPref,
  saveScheduling,
  syncNow,
} from './actions'
import { fetchSchedulingSettings } from '@/lib/schedulingSettings'

/**
 * Practice settings (Ring 2): availability windows and the Google
 * Calendar connection. Windows read and write through the session
 * client under RLS; only the connection-status read touches the
 * deny-all token table, service-role after the layout's membership
 * check (and only metadata: the account email and expiry, never
 * tokens).
 */

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const CAL_NOTES: Record<string, string> = {
  connected: 'Google Calendar connected.',
  synced: 'Calendar synced: sessions pushed, busy times pulled.',
  sync_partial: 'Sync finished with some failures. Try again in a minute.',
  not_connected: 'Connect Google Calendar first.',
  not_configured: 'Google OAuth is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
  no_token_secret: 'Set KEYSTONE_TOKEN_SECRET before connecting Google.',
  state_mismatch: 'That connect attempt could not be verified. Try again.',
  exchange_failed: 'Google did not complete the connection. Try again.',
  save_failed: 'The connection could not be saved. Try again.',
  slow: 'Too many syncs. Wait a bit and try again.',
}

function fmtMin(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, '0')
  const m = String(min % 60).padStart(2, '0')
  return `${h}:${m}`
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    calendar?: string
    window?: string
    scheduling?: string
    blackout?: string
  }>
}) {
  const { calendar, window: windowState, scheduling, blackout } = await searchParams
  const viewer = await getViewer()
  const supabase = await createServerSupabase()

  const { data: myMembership } = viewer.user && viewer.practice
    ? await supabase
        .from('practice_members')
        .select('id')
        .eq('user_id', viewer.user.id)
        .eq('practice_id', viewer.practice.practiceId)
        .is('revoked_at', null)
        .maybeSingle()
    : { data: null }
  const { data: emailPref } = myMembership
    ? await supabase
        .from('notification_prefs')
        .select('email_mode')
        .eq('practice_member_id', myMembership.id)
        .maybeSingle()
    : { data: null }

  const { data: windows } = await supabase
    .from('availability_windows')
    .select('id, weekday, start_min, end_min, tz')
    .order('weekday')
    .order('start_min')

  // 4I: the boundaries and blackouts, read under RLS like the windows.
  const settings = viewer.practice
    ? await fetchSchedulingSettings(supabase, viewer.practice.practiceId)
    : null
  const { data: blackouts } = await supabase
    .from('scheduling_blackouts')
    .select('id, starts_at, ends_at, reason')
    .order('starts_at')

  // Connection status, metadata only.
  let connection: {
    google_email: string | null
    calendar_tz: string | null
    busy_pulled_at: string | null
  } | null = null
  if (viewer.user && viewer.practice) {
    const { data: member } = await supabase
      .from('practice_members')
      .select('id')
      .eq('user_id', viewer.user.id)
      .eq('practice_id', viewer.practice.practiceId)
      .maybeSingle()
    if (member) {
      const { data } = await supabaseAdmin
        .from('google_connections')
        .select('google_email, calendar_tz, busy_pulled_at')
        .eq('practice_member_id', member.id)
        .eq('practice_id', viewer.practice.practiceId)
        .maybeSingle()
      connection = data
    }
  }
  const blackoutTz = windows?.[0]?.tz ?? 'America/Los_Angeles'
  const fmtBlackoutDay = (iso: string, endExclusive = false) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: blackoutTz,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(new Date(iso).getTime() - (endExclusive ? 1 : 0)))

  return (
    <RoomShell eyebrow="Settings" title="Settings" maxWidth="max-w-4xl">
      {viewer.practice?.role === 'owner' ? (
        <p className="mb-8 text-sm text-ink-dim">
          Looking for people?{' '}
          <Link href="/settings/members" className="underline hover:text-ink">
            Members and access
          </Link>
        </p>
      ) : null}
      <section>
        <h2 className="font-display text-2xl font-medium text-ink">Availability</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Clients pick session slots from these weekly windows.
        </p>
        {windowState ? (
          <p role="status" className="mt-3 text-sm text-ink">
            {windowState === 'invalid'
              ? 'That window does not parse. Check the times.'
              : 'That window could not be saved.'}
          </p>
        ) : null}

        <ul className="mt-4 flex flex-col gap-2">
          {(windows ?? []).map((w) => (
            <li
              key={w.id}
              className="flex items-center justify-between rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
            >
              <span className="text-sm text-ink">
                {WEEKDAYS[w.weekday]} {fmtMin(w.start_min)} to {fmtMin(w.end_min)}{' '}
                <span className="text-ink-dim">({w.tz})</span>
              </span>
              <form action={removeWindow}>
                <input type="hidden" name="id" value={w.id} />
                <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                  Remove
                </button>
              </form>
            </li>
          ))}
          {(windows ?? []).length === 0 ? (
            <li className="text-sm text-ink-dim">No windows yet. Add the first one below.</li>
          ) : null}
        </ul>

        <form action={addWindow} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[140px] flex-1 flex-col gap-1">
            <span className="eyebrow">Day</span>
            <select
              name="weekday"
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[110px] flex-1 flex-col gap-1">
            <span className="eyebrow">From</span>
            <input
              name="start"
              type="time"
              required
              defaultValue="09:00"
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </label>
          <label className="flex min-w-[110px] flex-1 flex-col gap-1">
            <span className="eyebrow">To</span>
            <input
              name="end"
              type="time"
              required
              defaultValue="12:00"
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </label>
          <label className="flex min-w-[180px] flex-1 flex-col gap-1">
            <span className="eyebrow">Time zone</span>
            <input
              name="tz"
              required
              defaultValue="America/Los_Angeles"
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Add window
          </button>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Scheduling boundaries</h2>
        <p className="mt-1 text-sm text-ink-dim">
          How close, how far out, and how long a session may be.
        </p>
        {scheduling ? (
          <p role="status" className="mt-3 text-sm text-ink">
            {scheduling === 'saved'
              ? 'Boundaries saved.'
              : scheduling === 'invalid'
                ? 'Those boundaries do not parse. Check the numbers and the link.'
                : 'The boundaries could not be saved.'}
          </p>
        ) : null}
        <KeystoneCard className="mt-4">
          <form action={saveScheduling} className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-3">
              <label className="flex min-w-[130px] flex-1 flex-col gap-1">
                <span className="eyebrow">Buffer (minutes)</span>
                <input
                  name="buffer"
                  type="number"
                  min={0}
                  max={120}
                  step={5}
                  defaultValue={settings?.bufferMin ?? 15}
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
                />
              </label>
              <label className="flex min-w-[130px] flex-1 flex-col gap-1">
                <span className="eyebrow">Notice (hours)</span>
                <input
                  name="lead"
                  type="number"
                  min={0}
                  max={336}
                  defaultValue={settings?.leadHours ?? 24}
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
                />
              </label>
              <label className="flex min-w-[130px] flex-1 flex-col gap-1">
                <span className="eyebrow">Horizon (days)</span>
                <input
                  name="horizon"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={settings?.horizonDays ?? 30}
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <fieldset className="flex min-w-[220px] flex-1 flex-col gap-1">
                <legend className="eyebrow">Session lengths offered</legend>
                <div className="mt-1 flex items-center gap-4 text-sm text-ink">
                  <span>60 minutes, always</span>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name="offer90"
                      defaultChecked={settings?.durationOptions.includes(90) ?? true}
                    />
                    90
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      name="offer120"
                      defaultChecked={settings?.durationOptions.includes(120) ?? true}
                    />
                    120
                  </label>
                </div>
              </fieldset>
              <label className="flex min-w-[130px] flex-col gap-1">
                <span className="eyebrow">Default</span>
                <select
                  name="defaultDuration"
                  defaultValue={settings?.defaultDurationMin ?? 60}
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
                >
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                  <option value={120}>120 minutes</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Video link</span>
              <input
                name="videoLink"
                type="url"
                placeholder="https://zoom.us/j/..."
                defaultValue={settings?.videoLink ?? ''}
                className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
              />
              <span className="text-xs text-ink-dim">
                Your personal meeting room link. It rides every invite.
              </span>
            </label>
            <div>
              <button
                type="submit"
                className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
              >
                Save boundaries
              </button>
            </div>
          </form>
        </KeystoneCard>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Blackouts</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Days nobody can book. Clients see the time as unavailable, never the reason.
        </p>
        {blackout ? (
          <p role="status" className="mt-3 text-sm text-ink">
            {blackout === 'saved'
              ? 'Blackout added.'
              : blackout === 'invalid'
                ? 'That range does not parse. The end date cannot be before the start.'
                : 'The blackout could not be saved.'}
          </p>
        ) : null}
        <ul className="mt-4 flex flex-col gap-2">
          {(blackouts ?? []).map((b) => (
            <li
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
            >
              <span className="text-sm text-ink">
                {fmtBlackoutDay(b.starts_at)} to {fmtBlackoutDay(b.ends_at, true)}
                {b.reason ? <span className="text-ink-dim"> ({b.reason})</span> : null}
              </span>
              <form action={removeBlackout}>
                <input type="hidden" name="id" value={b.id} />
                <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                  Remove
                </button>
              </form>
            </li>
          ))}
          {(blackouts ?? []).length === 0 ? (
            <li className="text-sm text-ink-dim">No blackouts. Add one below when you need it.</li>
          ) : null}
        </ul>
        <form action={addBlackout} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[140px] flex-1 flex-col gap-1">
            <span className="eyebrow">First day</span>
            <input
              name="start"
              type="date"
              required
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </label>
          <label className="flex min-w-[140px] flex-1 flex-col gap-1">
            <span className="eyebrow">Last day</span>
            <input
              name="end"
              type="date"
              required
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </label>
          <label className="flex min-w-[180px] flex-[2] flex-col gap-1">
            <span className="eyebrow">Reason (yours alone)</span>
            <input
              name="reason"
              maxLength={200}
              placeholder="Vacation"
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Add blackout
          </button>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Google Calendar</h2>
        {calendar && CAL_NOTES[calendar] ? (
          <p role="status" className="mt-3 text-sm text-ink">
            {CAL_NOTES[calendar]}
          </p>
        ) : null}
        <KeystoneCard className="mt-4">
          {connection ? (
            <>
              <p className="text-sm text-ink">
                Connected as{' '}
                <span className="font-medium">
                  {connection.google_email ?? 'your Google account'}
                </span>
                {connection.calendar_tz ? (
                  <span className="text-ink-dim"> ({connection.calendar_tz})</span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-ink-dim">
                {connection.busy_pulled_at
                  ? `Busy times last pulled ${new Intl.DateTimeFormat('en-US', {
                      timeZone: connection.calendar_tz ?? 'America/Los_Angeles',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    }).format(new Date(connection.busy_pulled_at))}. Offered slots respect them.`
                  : 'Busy times have not been pulled yet. Sync to make offered slots respect your real calendar.'}
              </p>
              <form action={syncNow} className="mt-3">
                <button
                  type="submit"
                  className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
                >
                  Sync now
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-dim">
                Booked sessions land on your calendar at the correct hour in both time zones.
              </p>
              <a
                href="/api/calendar/connect"
                className="mt-3 inline-block rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
              >
                Connect Google Calendar
              </a>
            </>
          )}
        </KeystoneCard>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Your account</h2>
        <KeystoneCard className="mt-4">
          <p className="text-sm text-ink">
            Signed in as <span className="font-medium">{viewer.user?.email}</span>
            {viewer.practice ? (
              <span className="text-ink-dim"> ({viewer.practice.role} at {viewer.practice.practiceName})</span>
            ) : null}
          </p>
          <form action={saveEmailPref} className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-dim">Notification email:</span>
            <select
              name="mode"
              defaultValue={emailPref?.email_mode ?? 'batched'}
              className="rounded-lg border border-ink/15 bg-paper-raised px-3 py-2 text-sm text-ink"
            >
              <option value="batched">One daily summary</option>
              <option value="off">Off; I live on /today</option>
            </select>
            <button
              type="submit"
              className="rounded-lg border border-forest px-3 py-1.5 text-sm text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
            >
              Save
            </button>
          </form>
          <form action="/auth/signout" method="post" className="mt-4">
            <button
              type="submit"
              className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/40 active:scale-[0.98]"
            >
              Sign out
            </button>
          </form>
        </KeystoneCard>
      </section>
    </RoomShell>
  )
}

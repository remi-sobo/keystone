import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { decryptToken, encryptToken } from '@/lib/crypto'
import {
  deleteEvent,
  fetchFreeBusy,
  insertEvent,
  patchEvent,
  refreshAccessToken,
  type CalendarEventInput,
} from '@/lib/google'
import { logAuditAction } from '@/lib/audit'
import type { PracticeCtx } from '@/lib/auth'

/**
 * lib/calendarSync.ts
 *
 * Both directions of the practice's Google Calendar, SERVER-ONLY,
 * service-role-after-check: every caller is either a practice-surface
 * action holding a resolved PracticeCtx or the secret-gated refresh
 * cron, and every query scopes by practice_id.
 *
 * PUSH (Ring 2): booked sessions without a gcal_event_id are inserted,
 * booked ones with an id are patched, canceled ones with an id are
 * removed. Floating wall-clock local times plus an explicit timeZone
 * (the Arc rule). Nothing here writes session times; Google mirrors
 * Keystone, never the reverse.
 *
 * PULL (V2 4I): the primary calendar's free/busy for the next 60 days
 * lands in calendar_busy (deny-all; read only through the
 * keystone_busy_intervals bridge), replace-all per member, stamping
 * busy_pulled_at on the connection. A failed pull keeps the previous
 * cache: bounded staleness beats a silently emptied calendar. Sessions
 * Keystone itself pushed come back as busy and overlap their own source
 * rows exactly; the collision test does not care, so no dedupe is owed.
 */

interface SessionRow {
  id: string
  starts_at: string
  ends_at: string
  tz: string
  kind: string
  status: string
  gcal_event_id: string | null
  clients: { name: string } | null
}

export interface SyncResult {
  ok: boolean
  detail?: string
  inserted: number
  patched: number
  removed: number
  failed: number
  /** Busy intervals cached by the pull; null when the pull failed. */
  pulled: number | null
}

const PULL_WINDOW_DAYS = 60
const PULL_ROW_CAP = 500

function summaryFor(row: SessionRow): string {
  const client = row.clients?.name ?? 'Client'
  if (row.kind === 'donor_call') return `${client}: donor call`
  if (row.kind === 'review') return `${client}: review session`
  return `${client}: working session`
}

function eventInput(row: SessionRow): CalendarEventInput {
  return {
    summary: summaryFor(row),
    description: 'Scheduled in Keystone.',
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    tz: row.tz,
  }
}

/** A fresh access token for a member's connection, refreshing and
 *  re-encrypting as needed. Returns null when not connected. */
async function tokenForMember(
  memberId: string,
  practiceId: string
): Promise<{ token: string; connectionId: string } | null> {
  const { data: conn } = await supabaseAdmin
    .from('google_connections')
    .select('id, access_token_enc, refresh_token_enc, token_expiry')
    .eq('practice_member_id', memberId)
    .eq('practice_id', practiceId)
    .maybeSingle()
  if (!conn?.refresh_token_enc) return null

  const fresh =
    conn.access_token_enc &&
    conn.token_expiry &&
    new Date(conn.token_expiry).getTime() - Date.now() > 2 * 60 * 1000
  if (fresh) return { token: decryptToken(conn.access_token_enc as string), connectionId: conn.id }

  const refreshed = await refreshAccessToken(decryptToken(conn.refresh_token_enc as string))
  if (!refreshed?.access_token) return null
  await supabaseAdmin
    .from('google_connections')
    .update({
      access_token_enc: encryptToken(refreshed.access_token),
      token_expiry: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', conn.id)
  return { token: refreshed.access_token, connectionId: conn.id }
}

/** Replace the member's cached free/busy with Google's current answer.
 *  Returns the interval count, or null on failure (cache kept). */
async function pullBusyForMember(
  memberId: string,
  practiceId: string,
  token: string
): Promise<number | null> {
  const now = new Date()
  const busy = await fetchFreeBusy(
    token,
    now,
    new Date(now.getTime() + PULL_WINDOW_DAYS * 86400000)
  )
  if (busy === null) return null

  const rows = busy.slice(0, PULL_ROW_CAP).map((b) => ({
    practice_id: practiceId,
    practice_member_id: memberId,
    starts_at: b.start,
    ends_at: b.end,
  }))

  // Replace-all per member. The moment between delete and insert is a
  // read of slightly-too-open availability at worst; the exclusion
  // constraint still forbids double-booking anything Keystone holds.
  const { error: delError } = await supabaseAdmin
    .from('calendar_busy')
    .delete()
    .eq('practice_member_id', memberId)
  if (delError) {
    console.error('[calendar] busy cache clear failed:', delError.code)
    return null
  }
  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('calendar_busy').insert(rows)
    if (error) {
      console.error('[calendar] busy cache insert failed:', error.code)
      return null
    }
  }
  await supabaseAdmin
    .from('google_connections')
    .update({ busy_pulled_at: new Date().toISOString() })
    .eq('practice_member_id', memberId)
  return rows.length
}

/** Push and pull for one member's connection. The core both the
 *  Settings action (via syncPracticeCalendar) and the refresh cron
 *  share; callers have already proven their authority. */
export async function syncMember(args: {
  memberId: string
  practiceId: string
  actorEmail: string
}): Promise<SyncResult> {
  const auth = await tokenForMember(args.memberId, args.practiceId)
  if (!auth) {
    return {
      ok: false,
      detail: 'not_connected',
      inserted: 0,
      patched: 0,
      removed: 0,
      failed: 0,
      pulled: null,
    }
  }

  const { data: rows } = await supabaseAdmin
    .from('sessions')
    .select('id, starts_at, ends_at, tz, kind, status, gcal_event_id, clients(name)')
    .eq('practice_id', args.practiceId)
    .in('status', ['booked', 'canceled'])
    .gte('ends_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  let inserted = 0
  let patched = 0
  let removed = 0
  let failed = 0

  for (const row of (rows ?? []) as unknown as SessionRow[]) {
    if (row.status === 'booked' && !row.gcal_event_id) {
      const r = await insertEvent(auth.token, eventInput(row))
      if (r.ok && r.eventId) {
        await supabaseAdmin.from('sessions').update({ gcal_event_id: r.eventId }).eq('id', row.id)
        inserted++
      } else failed++
    } else if (row.status === 'booked' && row.gcal_event_id) {
      const r = await patchEvent(auth.token, row.gcal_event_id, eventInput(row))
      if (r.ok) patched++
      else failed++
    } else if (row.status === 'canceled' && row.gcal_event_id) {
      const r = await deleteEvent(auth.token, row.gcal_event_id)
      if (r.ok) {
        await supabaseAdmin.from('sessions').update({ gcal_event_id: null }).eq('id', row.id)
        removed++
      } else failed++
    }
  }

  const pulled = await pullBusyForMember(args.memberId, args.practiceId, auth.token)

  // Metadata only: counts, never event or client content.
  await logAuditAction({
    actorEmail: args.actorEmail,
    action: 'calendar.sync',
    target: args.practiceId,
    detail: { inserted, patched, removed, failed, pulled },
  })

  return { ok: failed === 0 && pulled !== null, inserted, patched, removed, failed, pulled }
}

export async function syncPracticeCalendar(ctx: PracticeCtx): Promise<SyncResult> {
  const { data: member } = await supabaseAdmin
    .from('practice_members')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!member) {
    return {
      ok: false,
      detail: 'not_connected',
      inserted: 0,
      patched: 0,
      removed: 0,
      failed: 0,
      pulled: null,
    }
  }
  return syncMember({ memberId: member.id, practiceId: ctx.practiceId, actorEmail: ctx.email })
}

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { decryptToken, encryptToken } from '@/lib/crypto'
import {
  deleteEvent,
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
 * Push the practice's sessions to the consultant's Google Calendar.
 * SERVER-ONLY, practice surface, service-role-after-check: every caller
 * passes a resolved PracticeCtx and every query scopes by its
 * practice_id. Adapted from the Arc push route: floating wall-clock
 * local times plus an explicit timeZone, so the event lands at the
 * right hour in both zones.
 *
 * Sync is idempotent and runs on demand (the Settings button and after
 * connect): booked sessions without a gcal_event_id are inserted,
 * booked ones with an id are patched, canceled ones with an id are
 * removed. Nothing here writes session times; Google mirrors Keystone,
 * never the reverse in v1.
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
}

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

/** A fresh access token for the member's connection, refreshing and
 *  re-encrypting as needed. Returns null when not connected. */
async function accessTokenFor(
  ctx: PracticeCtx
): Promise<{ token: string; connectionId: string } | null> {
  const { data: member } = await supabaseAdmin
    .from('practice_members')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!member) return null

  const { data: conn } = await supabaseAdmin
    .from('google_connections')
    .select('id, access_token_enc, refresh_token_enc, token_expiry')
    .eq('practice_member_id', member.id)
    .eq('practice_id', ctx.practiceId)
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

export async function syncPracticeCalendar(ctx: PracticeCtx): Promise<SyncResult> {
  const auth = await accessTokenFor(ctx)
  if (!auth) {
    return { ok: false, detail: 'not_connected', inserted: 0, patched: 0, removed: 0, failed: 0 }
  }

  const { data: rows } = await supabaseAdmin
    .from('sessions')
    .select('id, starts_at, ends_at, tz, kind, status, gcal_event_id, clients(name)')
    .eq('practice_id', ctx.practiceId)
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

  // Metadata only: counts, never event or client content.
  await logAuditAction({
    actorEmail: ctx.email,
    action: 'calendar.sync',
    target: ctx.practiceId,
    detail: { inserted, patched, removed, failed },
  })

  return { ok: failed === 0, inserted, patched, removed, failed }
}

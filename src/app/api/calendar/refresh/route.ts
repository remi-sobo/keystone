import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { syncMember } from '@/lib/calendarSync'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * The calendar refresh cron (V2 4I). Vercel invokes this hourly
 * (vercel.json) with Authorization: Bearer CRON_SECRET; fail-closed
 * like the digest and notify crons. For every connected practice
 * member it runs the shared sync core: push any booked session still
 * missing its Google event (the backstop for a lost push trigger),
 * reconcile canceled ones, and pull the next 60 days of free/busy into
 * the calendar_busy cache. This is what bounds availability staleness
 * to an hour when nobody touches the Settings sync button.
 */
export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET
  if (!secret) {
    console.error('[calendar-refresh] CRON_SECRET is not set; refusing to run.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { data: conns } = await supabaseAdmin
    .from('google_connections')
    .select('practice_id, practice_member_id')
    .not('refresh_token_enc', 'is', null)

  let synced = 0
  let failed = 0
  for (const conn of conns ?? []) {
    const result = await syncMember({
      memberId: conn.practice_member_id,
      practiceId: conn.practice_id,
      actorEmail: 'calendar-refresh-cron',
    })
    if (result.ok) synced++
    else failed++
  }

  return NextResponse.json({ connections: (conns ?? []).length, synced, failed })
}

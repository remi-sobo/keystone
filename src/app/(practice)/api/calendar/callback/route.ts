import { NextResponse, type NextRequest } from 'next/server'
import { isErrorResponse, requirePracticeMember } from '@/lib/auth'
import {
  exchangeCode,
  fetchCalendarTimeZone,
  fetchGoogleEmail,
  verifyOAuthState,
} from '@/lib/google'
import { encryptToken } from '@/lib/crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAuditAction } from '@/lib/audit'
import { syncMember } from '@/lib/calendarSync'

/**
 * The Google OAuth callback (practice surface, service-role-after-
 * check). The signed state must verify AND name the same user the
 * session resolves to; tokens are AES-256-GCM encrypted before they
 * touch the deny-all google_connections table. Only metadata is
 * audited.
 */
export async function GET(req: NextRequest) {
  const ctx = await requirePracticeMember()
  if (isErrorResponse(ctx)) return ctx

  const url = new URL(req.url)
  const origin = url.origin
  const code = url.searchParams.get('code')
  const stateUid = verifyOAuthState(url.searchParams.get('state'))

  if (!code || !stateUid || stateUid !== ctx.userId) {
    return NextResponse.redirect(new URL('/settings?calendar=state_mismatch', origin))
  }

  const tokens = await exchangeCode(origin, code)
  if (!tokens?.access_token) {
    return NextResponse.redirect(new URL('/settings?calendar=exchange_failed', origin))
  }

  const { data: member } = await supabaseAdmin
    .from('practice_members')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!member) {
    return NextResponse.redirect(new URL('/settings?calendar=exchange_failed', origin))
  }

  const [email, tz] = await Promise.all([
    fetchGoogleEmail(tokens.access_token),
    fetchCalendarTimeZone(tokens.access_token),
  ])

  const row = {
    practice_id: ctx.practiceId,
    practice_member_id: member.id,
    google_email: email,
    access_token_enc: encryptToken(tokens.access_token),
    refresh_token_enc: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    token_expiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    calendar_tz: tz,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabaseAdmin
    .from('google_connections')
    .upsert(row, { onConflict: 'practice_member_id' })
  if (error) {
    console.error('[calendar] connection upsert failed:', error.message)
    return NextResponse.redirect(new URL('/settings?calendar=save_failed', origin))
  }

  await logAuditAction({
    actorEmail: ctx.email,
    action: 'calendar.connect',
    target: ctx.practiceId,
    detail: { has_refresh_token: !!tokens.refresh_token },
  })

  // A fresh connection is immediately real: push what Keystone holds
  // and pull the first free/busy window (V2 4I). Failure here degrades
  // to the hourly cron; the connection itself is already saved.
  await syncMember({ memberId: member.id, practiceId: ctx.practiceId, actorEmail: ctx.email })

  return NextResponse.redirect(new URL('/settings?calendar=connected', origin))
}

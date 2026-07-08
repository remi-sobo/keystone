import { NextResponse, type NextRequest } from 'next/server'
import { isErrorResponse, requirePracticeMember } from '@/lib/auth'
import { authUrl, signOAuthState } from '@/lib/google'
import { isTokenCryptoConfigured } from '@/lib/crypto'
import { env } from '@/lib/env'

/**
 * Start the Google Calendar connect flow (practice surface). The state
 * is HMAC-signed and bound to the resolved user, so the callback can
 * reject a forged or replayed flow.
 */
export async function GET(req: NextRequest) {
  const ctx = await requirePracticeMember()
  if (isErrorResponse(ctx)) return ctx

  const origin = new URL(req.url).origin
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL('/settings?calendar=not_configured', origin))
  }
  if (!isTokenCryptoConfigured()) {
    return NextResponse.redirect(new URL('/settings?calendar=no_token_secret', origin))
  }

  const state = signOAuthState(ctx.userId)
  return NextResponse.redirect(authUrl(origin, state))
}

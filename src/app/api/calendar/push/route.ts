import { NextResponse, type NextRequest } from 'next/server'
import { verifySessionPush } from '@/lib/pushToken'
import { pushSessionById } from '@/lib/calendarSync'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * The single-session calendar push (V2 4I). The pure-RLS client
 * surface cannot touch Google, so after a booking move its server
 * action POSTs here with an HMAC over the session id (lib/pushToken.ts,
 * keyed by KEYSTONE_TOKEN_SECRET, 10 minute TTL). The route pushes
 * nothing the DB does not already hold: it loads the session by id and
 * inserts, patches, or removes its one Google event. Rate limited per
 * session; a lost call degrades to the hourly refresh cron.
 */
export async function POST(req: NextRequest) {
  let body: { sessionId?: string; token?: string }
  try {
    body = (await req.json()) as { sessionId?: string; token?: string }
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  }

  const sessionId = verifySessionPush(body.token, body.sessionId ?? null)
  if (!sessionId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const limited = await checkRateLimits([
    { config: LIMITS.CALENDAR_PUSH_PER_MIN, key: sessionId },
  ])
  if (!limited.ok) {
    return NextResponse.json({ error: 'slow' }, { status: 429 })
  }

  const result = await pushSessionById(sessionId)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

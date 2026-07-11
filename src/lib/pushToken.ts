import crypto from 'crypto'

/**
 * lib/pushToken.ts (V2 4I)
 *
 * The client surface is pure RLS and can never touch Google, but a
 * booking should reach the calendar in seconds, not on the next cron.
 * The bridge is one internal POST to /api/calendar/push carrying the
 * session id and an HMAC over it, keyed by KEYSTONE_TOKEN_SECRET (and
 * deliberately NEVER the service-role key: this file is imported by
 * client-surface actions and stays inside the no-service-role guard).
 * The worst a replayed token can do is re-push a session the DB
 * already holds; the route is rate limited anyway. Unset secret means
 * no push: the hourly refresh cron catches up, honestly.
 */

const PUSH_TTL_MS = 10 * 60 * 1000

function secret(): string | null {
  const s = process.env.KEYSTONE_TOKEN_SECRET
  return s && s.length >= 16 ? s : null
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payload: string, key: string): string {
  return b64url(crypto.createHmac('sha256', key).update(payload).digest())
}

/** A short-lived token authorizing one push of one session. */
export function signSessionPush(sessionId: string, now: number = Date.now()): string | null {
  const key = secret()
  if (!key) return null
  const payload = b64url(JSON.stringify({ sid: sessionId, iat: now }))
  return `${payload}.${sign(payload, key)}`
}

/** The session id, only when the signature holds, the token is fresh,
 *  and it names the same session the request does. */
export function verifySessionPush(
  token: string | null | undefined,
  sessionId: string | null | undefined,
  now: number = Date.now()
): string | null {
  const key = secret()
  if (!key || !token || !sessionId) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const payload = token.slice(0, dot)
  const expected = Buffer.from(sign(payload, key))
  const got = Buffer.from(token.slice(dot + 1))
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null
  try {
    const pad = payload.length % 4 === 0 ? 0 : 4 - (payload.length % 4)
    const obj = JSON.parse(
      Buffer.from(
        payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad),
        'base64'
      ).toString('utf8')
    )
    if (!obj || obj.sid !== sessionId || typeof obj.iat !== 'number') return null
    if (now - obj.iat > PUSH_TTL_MS || obj.iat - now > PUSH_TTL_MS) return null
    return obj.sid as string
  } catch {
    return null
  }
}

/**
 * Fire the internal push for one session. Best effort by contract: a
 * failure logs and returns; the booking is already real in Keystone
 * and the hourly cron is the backstop.
 */
export async function requestCalendarPush(origin: string, sessionId: string): Promise<void> {
  const token = signSessionPush(sessionId)
  if (!token) return
  try {
    await fetch(`${origin}/api/calendar/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, token }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    console.error('[calendar] push request did not complete; the cron will catch up.')
  }
}

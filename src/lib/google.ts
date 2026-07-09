import crypto from 'crypto'
import { env } from '@/lib/env'

/**
 * lib/google.ts
 *
 * Google Calendar for Ring 2: OAuth with an HMAC-signed state (the Arc
 * pattern, lib/arc/google.ts) and a direct-fetch calendar client (the
 * playbook's integration doctrine: direct fetch, no SDK, degrade with
 * honest errors). Two rules carried from Arc, both verified there:
 *
 *   - Timezone-correct push: events send floating wall-clock RFC3339
 *     local times plus an explicit timeZone, never server-local UTC.
 *   - The state token is unforgeable: HMAC-SHA256 over {uid, iat,
 *     nonce}, verified with timingSafeEqual inside a 15-minute window.
 *
 * SERVER-ONLY (used by practice-surface calendar routes).
 */

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export function redirectUri(origin: string): string {
  return `${origin}/api/calendar/callback`
}

// Read the OAuth pair trimmed at the point of use: a trailing newline or
// space in a dashboard paste is invisible in the Vercel UI and Google
// answers it with 401 invalid_client, which reads as a wrong secret.
function googleCreds(): { id: string; secret: string } {
  return {
    id: (env.GOOGLE_CLIENT_ID ?? '').trim(),
    secret: (env.GOOGLE_CLIENT_SECRET ?? '').trim(),
  }
}

// ── OAuth state signing (CSRF defense) ────────────────────────────────

const STATE_TTL_MS = 15 * 60 * 1000

function stateSecret(): string {
  const secret = process.env.KEYSTONE_TOKEN_SECRET || env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret || secret.length < 16) {
    throw new Error('[google] no signing secret available for OAuth state')
  }
  return secret
}

function b64url(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4)
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad), 'base64')
}

function hmac(payload: string): string {
  return b64url(crypto.createHmac('sha256', stateSecret()).update(payload).digest())
}

/** Produce a signed OAuth state token bound to the user id. */
export function signOAuthState(userId: string, now: number = Date.now()): string {
  const payload = b64url(
    JSON.stringify({ uid: userId, iat: now, nonce: crypto.randomBytes(8).toString('hex') })
  )
  return `${payload}.${hmac(payload)}`
}

/** Verify a state token. Returns the user id only when the signature is
 *  valid and the token is inside the freshness window. */
export function verifyOAuthState(
  state: string | null | undefined,
  now: number = Date.now()
): string | null {
  if (!state) return null
  const dot = state.indexOf('.')
  if (dot <= 0 || dot === state.length - 1) return null
  const payload = state.slice(0, dot)
  const sig = state.slice(dot + 1)

  let expected: string
  try {
    expected = hmac(payload)
  } catch {
    return null
  }
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null

  try {
    const obj = JSON.parse(b64urlDecode(payload).toString('utf8'))
    if (!obj || typeof obj.uid !== 'string' || typeof obj.iat !== 'number') return null
    if (now - obj.iat > STATE_TTL_MS || obj.iat - now > STATE_TTL_MS) return null
    return obj.uid
  } catch {
    return null
  }
}

/** The consent screen URL for the connect redirect. */
export function authUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    client_id: googleCreds().id,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

// ── Token endpoints (direct fetch) ────────────────────────────────────

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
}

export async function exchangeCode(origin: string, code: string): Promise<GoogleTokens | null> {
  const { id, secret } = googleCreds()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    // Google's error body names the actual objection (invalid_client,
    // redirect_uri_mismatch, invalid_grant). The client id is public;
    // the secret is fingerprinted by length only, never printed.
    const body = await res.text().catch(() => '')
    console.error(
      '[google] code exchange failed:',
      res.status,
      body.slice(0, 300),
      `client_id=${id}`,
      `secret_len=${secret.length}`,
      `redirect_uri=${redirectUri(origin)}`
    )
    return null
  }
  return (await res.json()) as GoogleTokens
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens | null> {
  const { id, secret } = googleCreds()
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: id,
      client_secret: secret,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error('[google] token refresh failed:', res.status, body.slice(0, 300))
    return null
  }
  return (await res.json()) as GoogleTokens
}

/** The email on the connected account (for the settings display). */
export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = (await res.json()) as { email?: string }
  return data.email ?? null
}

// ── Calendar (direct fetch, primary calendar) ─────────────────────────

const CAL = 'https://www.googleapis.com/calendar/v3/calendars/primary'

export async function fetchCalendarTimeZone(accessToken: string): Promise<string | null> {
  const res = await fetch(CAL, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return null
  const data = (await res.json()) as { timeZone?: string }
  return data.timeZone ?? null
}

/**
 * Render a Date as a floating wall-clock RFC3339 local time in the given
 * IANA zone ("2026-07-10T09:00:00", no offset). Combined with an
 * explicit timeZone field, Google lands the event at the right
 * wall-clock hour regardless of the server's zone (the Arc rule).
 */
export function floatingLocal(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

export interface CalendarEventInput {
  summary: string
  description?: string
  startsAt: Date
  endsAt: Date
  tz: string
}

function eventBody(e: CalendarEventInput) {
  return {
    summary: e.summary,
    description: e.description,
    start: { dateTime: floatingLocal(e.startsAt, e.tz), timeZone: e.tz },
    end: { dateTime: floatingLocal(e.endsAt, e.tz), timeZone: e.tz },
  }
}

export async function insertEvent(
  accessToken: string,
  e: CalendarEventInput
): Promise<{ ok: boolean; eventId?: string; status: number }> {
  const res = await fetch(`${CAL}/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(e)),
  })
  if (!res.ok) return { ok: false, status: res.status }
  const data = (await res.json()) as { id?: string }
  return { ok: true, eventId: data.id, status: res.status }
}

export async function patchEvent(
  accessToken: string,
  eventId: string,
  e: CalendarEventInput
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${CAL}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(e)),
  })
  return { ok: res.ok, status: res.status }
}

export async function deleteEvent(
  accessToken: string,
  eventId: string
): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${CAL}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // 404/410: already gone counts as removed.
  return { ok: res.ok || res.status === 404 || res.status === 410, status: res.status }
}

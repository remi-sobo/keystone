import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { env } from '@/lib/env'
import { enforceRateLimits, clientIp, LIMITS } from '@/lib/rateLimit'
import { ReadAiWebhook, normalizeMeeting, secretMatches } from '@/lib/readai/payload'
import { receiveReadAiMeeting } from '@/lib/readai/import'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * POST /api/readai/webhook?key=<READAI_WEBHOOK_SECRET>
 * (specs/keystone-readai.md).
 *
 * Read AI posts one JSON body per meeting when its report is ready (the
 * meeting_end trigger). Read AI does not sign webhooks and cannot send a
 * header, so the secret rides the URL and is compared in constant time.
 * Rate limited per IP BEFORE the secret check, fail closed when either
 * setting is missing, and the practice comes from config, never from
 * the caller. Service role only after the check, inside lib/readai/import.ts.
 *
 * Logs carry outcomes and codes only, never meeting content.
 */

const BODY_CAP_BYTES = 4 * 1024 * 1024
// Any uuid shape (zod's uuid() also checks the version nibble).
const PracticeIdShape = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimits([
    { config: LIMITS.READAI_WEBHOOK_PER_MIN, key: clientIp(req) },
    { config: LIMITS.READAI_WEBHOOK_PER_HOUR, key: clientIp(req) },
  ])
  if (limited) return limited

  const secret = env.READAI_WEBHOOK_SECRET
  const practiceId = PracticeIdShape.safeParse(env.READAI_PRACTICE_ID?.trim())
  if (!secret || secret.length < 32 || !practiceId.success) {
    console.error('[readai] READAI_WEBHOOK_SECRET or READAI_PRACTICE_ID is not set; refusing.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  if (!secretMatches(req.nextUrl.searchParams.get('key'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const length = Number(req.headers.get('content-length') ?? 0)
  if (length > BODY_CAP_BYTES) {
    return NextResponse.json({ error: 'too_large' }, { status: 413 })
  }
  let body: unknown
  try {
    const text = await req.text()
    if (text.length > BODY_CAP_BYTES) {
      return NextResponse.json({ error: 'too_large' }, { status: 413 })
    }
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = ReadAiWebhook.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }
  // Read AI's "send a test request" button and any future trigger we do
  // not handle are acknowledged and ignored.
  if (parsed.data.trigger && parsed.data.trigger !== 'meeting_end') {
    return NextResponse.json({ ok: true, outcome: 'ignored' })
  }

  const result = await receiveReadAiMeeting(practiceId.data, normalizeMeeting(parsed.data))
  if (result.outcome === 'error') {
    return NextResponse.json({ error: 'import_failed' }, { status: 500 })
  }
  console.log(`[readai] meeting received: ${result.outcome}`)
  return NextResponse.json({ ok: true, outcome: result.outcome })
}

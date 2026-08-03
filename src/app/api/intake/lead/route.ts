import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { enforceRateLimits, clientIp, LIMITS } from '@/lib/rateLimit'
import { leadIntakeSchema, secretMatches, stagingRow } from '@/lib/intake'

export const runtime = 'nodejs'

/**
 * POST /api/intake/lead (specs/website-to-keystone-lead-intake.md, commit 2).
 *
 * The one door the marketing site has into Keystone. Machine caller only,
 * on the established secret-endpoint pattern (hub/v1/snapshot, digest,
 * notify): rate limited per IP BEFORE the secret check so guessing is
 * bounded, fail closed when unconfigured, service role after the check.
 *
 * The constrained surface is the point. One route, one insert, one table
 * nobody reads directly, an opaque rotatable secret, and a payload that
 * cannot express anything except a lead. A compromise of the public
 * marketing site must not become a compromise of client delivery data,
 * which is why there is no shared database between the two projects.
 *
 * SCOPE COMES FROM THE ENVIRONMENT, NEVER THE BODY. practice_id is read
 * from INTAKE_PRACTICE_ID, the same discipline the browser-facing
 * surfaces follow with the authenticated user. A leaked secret can add
 * rows to one practice's untriaged queue and nothing else.
 *
 * IDEMPOTENT. The site's own submission id is the key, and the unique
 * index is the enforcement. Replaying the same POST five times inserts
 * once and answers 200 every time, so the site's reconcile job can retry
 * without fear of duplicating a lead.
 *
 * Nothing here promotes anything. A staging row is inert until a human
 * routes it (commit 3, which does not exist yet).
 */

const ok = (status: 'created' | 'duplicate') => NextResponse.json({ ok: true, status })

export async function POST(req: NextRequest) {
  // Spent before the secret check, on purpose: an attacker guessing the
  // secret pays the limit, and a wrong guess never gets a cheap retry.
  const limited = await enforceRateLimits([
    { config: LIMITS.INTAKE_LEAD_PER_MIN, key: clientIp(req) },
    { config: LIMITS.INTAKE_LEAD_PER_HOUR, key: clientIp(req) },
  ])
  if (limited) return limited

  const secret = env.SITE_INTAKE_SECRET
  const practiceId = env.INTAKE_PRACTICE_ID
  if (!secret || !practiceId) {
    // Honest 503 rather than a silent accept. The site treats the forward
    // as non-fatal and leaves forwarded_at null, so a submission is
    // delayed and never lost.
    console.error('[intake/lead] SITE_INTAKE_SECRET or INTAKE_PRACTICE_ID is not set; refusing.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  if (!secretMatches(secret, req.headers.get('x-intake-secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = leadIntakeSchema.safeParse(body)
  if (!parsed.success) {
    // Field names only, never values: an inbound payload is person-data
    // and logs carry metadata (SECURITY.md section 6).
    console.error(
      '[intake/lead] payload rejected:',
      parsed.error.issues.map((i) => i.path.join('.')).join(',')
    )
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  const { error, data } = await supabaseAdmin
    .from('sales_intake_staging')
    .upsert(stagingRow(parsed.data, practiceId), {
      onConflict: 'practice_id,external_submission_id',
      ignoreDuplicates: true,
    })
    .select('id')

  if (error) {
    console.error('[intake/lead] insert failed:', error.message)
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
  }

  // ignoreDuplicates returns zero rows on a conflict. Both outcomes are
  // success to the caller; the distinction is only for the logs.
  const created = (data ?? []).length > 0
  console.info(`[intake/lead] ${created ? 'staged' : 'duplicate ignored'}`)
  return ok(created ? 'created' : 'duplicate')
}

import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { enforceRateLimits, clientIp, LIMITS } from '@/lib/rateLimit'
import {
  parseHubMemberIds,
  parseSince,
  hubTaskFilterExpression,
  serializeEngagement,
  serializeWorkstream,
  serializeActionItem,
  openProjectIds,
  type HubSnapshot,
  type SourceEngagement,
  type SourceWorkstream,
  type SourceActionItem,
} from '@/lib/hub'

export const runtime = 'nodejs'

/**
 * GET /api/hub/v1/snapshot?since=<iso> (trellis specs/Life-hub-spec 3.3).
 *
 * The read-only feed for the Trellis Life hub. Machine caller only:
 * bearer HUB_SECRET_KEYSTONE, the CRON_SECRET pattern (fail closed when
 * unset, 401 on a wrong value), rate limited per IP BEFORE the secret
 * check so guessing is bounded. Service role after the check, the
 * documented machine-endpoint pattern.
 *
 * THE FILTER IS THE FEATURE (see src/lib/hub.ts): action items leave
 * only when audience = 'practice' or the item is assigned to a hub
 * member from HUB_MEMBER_IDS. Client homework never leaves. Every
 * query is additionally scoped to the hub members' own practice, so a
 * second tenant's engagements can never ride along. Fail closed: no
 * secret, no member ids, or no resolvable practice means no data.
 *
 * `since` cuts the payload to rows whose updated_at moved (migration
 * 0043 added the columns and triggers); full_open_ids is ALWAYS the
 * full open set, so the hub can mark vanished rows dropped.
 */

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimits([
    { config: LIMITS.HUB_SNAPSHOT_PER_MIN, key: clientIp(req) },
    { config: LIMITS.HUB_SNAPSHOT_PER_HOUR, key: clientIp(req) },
  ])
  if (limited) return limited

  const secret = env.HUB_SECRET_KEYSTONE
  if (!secret) {
    console.error('[hub/snapshot] HUB_SECRET_KEYSTONE is not set; refusing to serve.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const since = parseSince(req.nextUrl.searchParams.get('since'))
  if (!since.ok) {
    return NextResponse.json({ error: 'invalid_since' }, { status: 400 })
  }

  const memberIds = parseHubMemberIds(env.HUB_MEMBER_IDS)
  if (memberIds.length === 0) {
    console.error('[hub/snapshot] HUB_MEMBER_IDS is not set; refusing to serve.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  // The practice scope comes from the configured members, never from
  // the caller. Revoked memberships do not widen the scope.
  const { data: members, error: mErr } = await supabaseAdmin
    .from('practice_members')
    .select('id, practice_id')
    .in('id', memberIds)
    .is('revoked_at', null)
  if (mErr) {
    console.error('[hub/snapshot] member resolve failed:', mErr.message)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }
  const practiceIds = [...new Set((members ?? []).map((m) => m.practice_id as string))]
  if (practiceIds.length === 0) {
    console.error('[hub/snapshot] HUB_MEMBER_IDS resolved to no live practice member.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const taskFilter = hubTaskFilterExpression(memberIds)

  // Payload queries honor the since cursor; the open-id queries never do.
  let engQ = supabaseAdmin
    .from('engagements')
    .select('id, title, status, owner_practice_member_id, updated_at, clients(name)')
    .in('practice_id', practiceIds)
  let wsQ = supabaseAdmin
    .from('workstreams')
    .select('id, engagement_id, title, stage, owner_practice_member_id, updated_at, clients(name)')
    .in('practice_id', practiceIds)
  let aiQ = supabaseAdmin
    .from('action_items')
    .select(
      'id, title, status, due_on, audience, assigned_practice_member_id, workstream_id, engagement_id, body_md, updated_at'
    )
    .in('practice_id', practiceIds)
    .or(taskFilter)
  if (since.value) {
    engQ = engQ.gt('updated_at', since.value)
    wsQ = wsQ.gt('updated_at', since.value)
    aiQ = aiQ.gt('updated_at', since.value)
  }

  const [eng, ws, ai, engOpen, wsOpen, aiOpen] = await Promise.all([
    engQ,
    wsQ,
    aiQ,
    supabaseAdmin
      .from('engagements')
      .select('id, status')
      .in('practice_id', practiceIds)
      .eq('status', 'active'),
    supabaseAdmin
      .from('workstreams')
      .select('id, stage')
      .in('practice_id', practiceIds)
      .neq('stage', 'done'),
    supabaseAdmin
      .from('action_items')
      .select('id')
      .in('practice_id', practiceIds)
      .eq('status', 'open')
      .or(taskFilter),
  ])
  const failed = [eng, ws, ai, engOpen, wsOpen, aiOpen].find((r) => r.error)
  if (failed?.error) {
    console.error('[hub/snapshot] query failed:', failed.error.message)
    return NextResponse.json({ error: 'query_failed' }, { status: 500 })
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const clientName = (row: any): string | null => (row.clients as any)?.name ?? null
  const engagements: SourceEngagement[] = (eng.data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    owner_practice_member_id: r.owner_practice_member_id,
    updated_at: r.updated_at,
    client_name: clientName(r),
  }))
  const workstreams: SourceWorkstream[] = (ws.data ?? []).map((r: any) => ({
    id: r.id,
    engagement_id: r.engagement_id,
    title: r.title,
    stage: r.stage,
    owner_practice_member_id: r.owner_practice_member_id,
    updated_at: r.updated_at,
    client_name: clientName(r),
  }))
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const actionItems = (ai.data ?? []) as SourceActionItem[]

  const snapshot: HubSnapshot = {
    system: 'keystone',
    generated_at: new Date().toISOString(),
    projects: [
      ...engagements.map(serializeEngagement),
      ...workstreams.map(serializeWorkstream),
    ],
    tasks: actionItems.map(serializeActionItem),
    full_open_ids: {
      projects: openProjectIds(
        (engOpen.data ?? []) as Array<{ id: string; status: string }>,
        (wsOpen.data ?? []) as Array<{ id: string; stage: string }>
      ),
      tasks: ((aiOpen.data ?? []) as Array<{ id: string }>).map((r) => r.id),
    },
  }

  return NextResponse.json(snapshot)
}

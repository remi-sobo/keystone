import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requirePracticeMember } from '@/lib/auth'
import { enforceRateLimits, LIMITS } from '@/lib/rateLimit'
import { buildConfidenceCsv, type ConfidenceResponseRow } from '@/lib/confidence'
import { logAuditAction } from '@/lib/audit'
import { safeName } from '@/lib/exportRecord'

/**
 * CSV of every confidence response on the engagement, for the impact
 * reporting. Practice-side only: membership verified first, the
 * engagement read scoped to the caller's practice, every query on the
 * SESSION so RLS stays the wall underneath (the 5B export shape).
 * Audited as metadata (who exported which engagement, row counts),
 * never values.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requirePracticeMember()
  if (isErrorResponse(ctx)) return ctx
  const { id } = await params

  const limited = await enforceRateLimits([
    { config: LIMITS.EXPORT_PER_HOUR, key: ctx.userId },
    { config: LIMITS.EXPORT_PER_DAY, key: ctx.userId },
  ])
  if (limited) return limited

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, clients(name)')
    .eq('id', id)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!engagement) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const [{ data: items }, { data: checkins }, { data: participants }, { data: responses }] =
    await Promise.all([
      supabase
        .from('confidence_items')
        .select('id, domain, prompt, kind, sort_order')
        .eq('engagement_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('confidence_checkins')
        .select('id, label, opens_at, due_at')
        .eq('engagement_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('confidence_participants')
        .select('client_member_id, client_members(email)')
        .eq('engagement_id', id),
      supabase
        .from('confidence_responses')
        .select('checkin_id, item_id, client_member_id, score, text_answer, submitted_at')
        .eq('engagement_id', id),
    ])

  const csv = buildConfidenceCsv({
    items: items ?? [],
    checkins: checkins ?? [],
    participants: (participants ?? []).map((p) => ({
      client_member_id: p.client_member_id,
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      email: ((p.client_members as any)?.email as string) ?? 'unknown',
    })),
    responses: (responses ?? []) as ConfidenceResponseRow[],
  })

  void logAuditAction({
    actorEmail: ctx.email,
    action: 'export.confidence',
    target: engagement.id,
    detail: { rows: (responses ?? []).length },
    practiceId: ctx.practiceId,
    engagementId: engagement.id,
  })

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const clientName = ((engagement.clients as any)?.name as string) ?? 'client'
  const exportedOn = new Date().toISOString().slice(0, 10)
  const filename = `${safeName(clientName, 'client')}-confidence-${exportedOn}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

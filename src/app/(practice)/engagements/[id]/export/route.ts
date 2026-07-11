import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requirePracticeMember } from '@/lib/auth'
import { enforceRateLimits, LIMITS } from '@/lib/rateLimit'
import { buildArchiveZip, safeName } from '@/lib/exportRecord'
import { logAuditAction } from '@/lib/audit'

/**
 * The practice's export (V2 5B): the same client-shaped archive, for
 * handover and closeout. Membership is verified first and the
 * engagement row is read scoped to the caller's practice; the archive
 * itself is assembled on the SESSION with every query filtered to the
 * shared shape (gate 5B-3), so a forwarded zip can never leak
 * practice-only material.
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
    .select('id, title, starts_on, ends_on, clients(name), practices(name)')
    .eq('id', id)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!engagement) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const clientName = ((engagement.clients as any)?.name as string) ?? 'client'
  const practiceName = ((engagement.practices as any)?.name as string) ?? 'the practice'
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const exportedOn = new Date().toISOString().slice(0, 10)

  const result = await buildArchiveZip(supabase, engagement.id, {
    engagementTitle: engagement.title,
    clientName,
    practiceName,
    startsOn: engagement.starts_on,
    endsOn: engagement.ends_on,
    exportedFor: ctx.email,
    side: 'practice',
    exportedOn,
  })
  if (!result.ok) {
    const status = result.error === 'too_large' ? 413 : 502
    return NextResponse.json({ error: result.error }, { status })
  }

  void logAuditAction({
    actorEmail: ctx.email,
    action: 'export.record',
    target: engagement.id,
    detail: { side: 'practice', bytes: result.bytes, ...result.counts },
  })

  const filename = `${safeName(clientName, 'client')}-engagement-record-${exportedOn}.zip`
  return new NextResponse(new Uint8Array(result.zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requireClientMember } from '@/lib/auth'
import { enforceRateLimits, LIMITS } from '@/lib/rateLimit'
import { buildArchiveZip, safeName } from '@/lib/exportRecord'
import { logAuditAction } from '@/lib/audit'

/**
 * The client's export (V2 5B): the engagement record as a zip they
 * keep. Pure RLS end to end: the archive is assembled on THIS SESSION,
 * so its scope is exactly what this member can already read, and the
 * storage policies serve every byte. The audit record rides the lib
 * chokepoint after membership passed (the qaExchange precedent), and
 * it carries metadata only: counts and bytes, never contents.
 */
export async function GET() {
  const ctx = await requireClientMember()
  if (isErrorResponse(ctx)) return ctx

  const limited = await enforceRateLimits([
    { config: LIMITS.EXPORT_PER_HOUR, key: ctx.userId },
    { config: LIMITS.EXPORT_PER_DAY, key: ctx.userId },
  ])
  if (limited) return limited

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, starts_on, ends_on, clients(name), practices(name)')
    .eq('client_id', ctx.clientId)
    .in('status', ['active', 'proposed', 'paused', 'done'])
    .order('created_at', { ascending: false })
    .limit(1)
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
    side: 'client',
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
    detail: { side: 'client', bytes: result.bytes, ...result.counts },
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

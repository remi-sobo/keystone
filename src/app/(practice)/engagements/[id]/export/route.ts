import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requirePracticeMember } from '@/lib/auth'
import { buildEngagementRecord } from '@/lib/exportRecord'

/**
 * The practice's export of the same record (V2 5B): what the client
 * keeps, generated for handing over. Runs on the practice SESSION
 * client under RLS, and the builder itself filters to published and
 * sent shapes, so both sides export the same paper.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requirePracticeMember()
  if (isErrorResponse(ctx)) return ctx
  const { id } = await params

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id')
    .eq('id', id)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!engagement) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const record = await buildEngagementRecord(supabase, engagement.id)
  if (!record) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return new NextResponse(record.markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${record.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

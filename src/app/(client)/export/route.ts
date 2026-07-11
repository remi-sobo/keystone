import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requireClientMember } from '@/lib/auth'
import { buildEngagementRecord } from '@/lib/exportRecord'

/**
 * The client's export (V2 5B). PURE RLS: the record builder runs on
 * the SESSION client, so this file contains exactly what this client
 * may read: the published charter, the shared record, the sent
 * digests, the published closeout. You own your data; you can leave
 * with it.
 */
export async function GET() {
  const ctx = await requireClientMember()
  if (isErrorResponse(ctx)) return ctx

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id')
    .eq('client_id', ctx.clientId)
    .order('created_at', { ascending: true })
    .limit(1)
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

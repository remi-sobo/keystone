import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requireClientMember } from '@/lib/auth'

/**
 * Evidence file download, client side (3C-4). Pure RLS twice over,
 * the documents route pattern: the trail row returns only to the
 * assignee (the V2-4 wall in homework_activity_read), and the bytes
 * stream through the SESSION client, where the storage policy demands
 * the same coachee wall. A teammate or buyer gets 404 at the row and
 * a denial at the bucket, in that order.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> }
) {
  const ctx = await requireClientMember()
  if (isErrorResponse(ctx)) return ctx
  const { id, activityId } = await params

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('homework_activity')
    .select('id, file_path, file_name, mime_type')
    .eq('id', activityId)
    .eq('action_item_id', id)
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  if (!row?.file_path) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: blob, error } = await supabase.storage
    .from('homework-evidence')
    .download(row.file_path)
  if (error || !blob) {
    console.error('[homework] evidence download failed:', error?.message)
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }

  const inline = req.nextUrl.searchParams.get('view') === '1'
  const filename = (row.file_name || 'evidence').replace(/"/g, '')
  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': row.mime_type || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

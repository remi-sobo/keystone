import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requirePracticeMember } from '@/lib/auth'

/**
 * Evidence file download, practice side (3C-4). The scoped row read
 * proves the trail row belongs to the caller's practice, then the
 * bytes stream through the SESSION client so the path-scoped storage
 * policy is the wall that serves them (the documents route pattern).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; activityId: string }> }
) {
  const ctx = await requirePracticeMember()
  if (isErrorResponse(ctx)) return ctx
  const { id, itemId, activityId } = await params

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('homework_activity')
    .select('id, file_path, file_name, mime_type')
    .eq('id', activityId)
    .eq('action_item_id', itemId)
    .eq('engagement_id', id)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!row?.file_path) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: blob, error } = await supabase.storage
    .from('homework-evidence')
    .download(row.file_path)
  if (error || !blob) {
    console.error('[homework] practice evidence download failed:', error?.message)
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

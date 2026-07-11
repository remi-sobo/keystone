import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requirePracticeMember } from '@/lib/auth'

/**
 * Old deliverable versions, practice side (V2 3D, gate 3D-3). The row
 * read proves scope; the bytes stream through the SESSION client under
 * the deliverables bucket's path-scoped read policy. Clients download
 * the live file only at launch.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const ctx = await requirePracticeMember()
  if (isErrorResponse(ctx)) return ctx
  const { id, versionId } = await params

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('deliverable_versions')
    .select('id, version, storage_path')
    .eq('id', versionId)
    .eq('engagement_id', id)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: blob, error } = await supabase.storage
    .from('deliverables')
    .download(row.storage_path)
  if (error || !blob) {
    console.error('[deliverables] version download failed:', error?.message)
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }

  const inline = req.nextUrl.searchParams.get('view') === '1'
  const filename = (row.storage_path.split('/').pop() ?? `version-${row.version}`).replace(/"/g, '')
  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

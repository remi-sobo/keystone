import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requirePracticeMember } from '@/lib/auth'

/**
 * Practice-side resource document download. Scoped row read, then the
 * bytes stream through the SESSION client under the resources bucket's
 * path-scoped read policy (the deliverables route pattern).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requirePracticeMember()
  if (isErrorResponse(ctx)) return ctx
  const { id } = await params

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('resources')
    .select('id, storage_path')
    .eq('id', id)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!row?.storage_path) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: blob, error } = await supabase.storage
    .from('resources')
    .download(row.storage_path)
  if (error || !blob) {
    console.error('[library] practice download failed:', error?.message)
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }

  const inline = req.nextUrl.searchParams.get('view') === '1'
  const filename = (row.storage_path.split('/').pop() ?? 'document').replace(/"/g, '')
  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

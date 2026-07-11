import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requireClientMember } from '@/lib/auth'

/**
 * File deliverable download (Ring 4). Pure RLS twice over: the row read
 * proves the deliverable belongs to the caller's client, and the
 * storage download runs on the SESSION client, so the path-scoped
 * storage policy is the wall that actually serves the bytes. No service
 * role anywhere on this surface.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireClientMember()
  if (isErrorResponse(ctx)) return ctx
  const { id } = await params

  const supabase = await createServerSupabase()
  const { data: row } = await supabase
    .from('deliverables')
    .select('id, kind, storage_path')
    .eq('id', id)
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  if (!row || row.kind !== 'file' || !row.storage_path) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const { data: blob, error } = await supabase.storage
    .from('deliverables')
    .download(row.storage_path)
  if (error || !blob) {
    console.error('[deliverables] download failed:', error?.message)
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }

  const filename = row.storage_path.split('/').pop() ?? 'deliverable'
  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': blob.type || 'application/octet-stream',
      'Content-Disposition': `${req.nextUrl.searchParams.get('view') === '1' ? 'inline' : 'attachment'}; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

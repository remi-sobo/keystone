import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { isErrorResponse, requireClientMember } from '@/lib/auth'

/**
 * Client document download (the agreement). Pure RLS twice over, the
 * deliverables route pattern: the row read can only return a SHARED
 * document of the caller's own client (the table policy demands
 * visible_to_client), and the bytes stream through the SESSION client,
 * where the storage policy demands the same visible row. No service
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
    .from('engagement_documents')
    .select('id, storage_path, file_name, mime_type')
    .eq('id', id)
    .eq('client_id', ctx.clientId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: blob, error } = await supabase.storage
    .from('engagement-documents')
    .download(row.storage_path)
  if (error || !blob) {
    console.error('[documents] client download failed:', error?.message)
    return NextResponse.json({ error: 'unavailable' }, { status: 502 })
  }

  const inline = req.nextUrl.searchParams.get('view') === '1'
  const filename = (row.file_name || 'document.pdf').replace(/"/g, '')
  return new NextResponse(blob.stream(), {
    headers: {
      'Content-Type': row.mime_type || 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

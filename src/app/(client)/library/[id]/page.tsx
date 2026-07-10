import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { MarkdownLite } from '@/components/MarkdownLite'

/**
 * One resource (Ring 4). Pure RLS: the row comes back only for members
 * of the practice's clients. Bodies render as preformatted prose; the
 * catalog is reference text, not an app inside the app.
 */

export default async function ResourcePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: resource } = await supabase
    .from('resources')
    .select('id, title, kind, tags, body_md, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (!resource) redirect('/library')

  return (
    <RoomShell
      eyebrow={
        <>
          <Link href="/library" className="underline">
            Library
          </Link>{' '}
          / {resource.kind}
        </>
      }
      title={resource.title}
      description={
        (resource.tags ?? []).length > 0 ? (resource.tags as string[]).join(', ') : undefined
      }
      maxWidth="max-w-3xl"
    >
      {resource.storage_path ? (
        <p className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-ink/10 bg-paper-raised px-4 py-3 text-sm text-ink">
          {resource.storage_path.split('/').pop()}
          <a
            href={`/library/${resource.id}/file?view=1`}
            target="_blank"
            rel="noreferrer"
            className="text-forest underline"
          >
            View
          </a>
          <a href={`/library/${resource.id}/file`} className="text-forest underline">
            Download
          </a>
        </p>
      ) : null}
      {resource.body_md ? (
        <MarkdownLite text={resource.body_md} />
      ) : resource.storage_path ? null : (
        <p className="text-sm text-ink-dim">This resource has no body yet.</p>
      )}
    </RoomShell>
  )
}

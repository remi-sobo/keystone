import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

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
    .select('id, title, kind, tags, body_md')
    .eq('id', id)
    .maybeSingle()
  if (!resource) redirect('/library')

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <p className="eyebrow">
        <Link href="/library" className="underline">
          Library
        </Link>{' '}
        / {resource.kind}
      </p>
      <h1 className="text-page-title mt-2 text-ink">{resource.title}</h1>
      {(resource.tags ?? []).length > 0 ? (
        <p className="mt-2 text-xs text-ink-dim">{(resource.tags as string[]).join(', ')}</p>
      ) : null}

      {resource.body_md ? (
        <div className="mt-8 whitespace-pre-line text-sm leading-relaxed text-ink">
          {resource.body_md}
        </div>
      ) : (
        <p className="mt-8 text-sm text-ink-dim">This resource has no body yet.</p>
      )}
    </div>
  )
}

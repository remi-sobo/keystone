import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BookOpen, Grid2x2, FileText } from 'lucide-react'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

/**
 * The client library (Ring 4): the practice's reference catalog,
 * readable by every client member of the practice (spec 5.1). Pure RLS
 * surface; the resources policy is the wall.
 */

const KIND_META: Record<string, { label: string }> = {
  guide: { label: 'Guide' },
  framework: { label: 'Framework' },
  template: { label: 'Template' },
}

export default async function LibraryPage() {
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: resources } = await supabase
    .from('resources')
    .select('id, title, kind, tags, created_at')
    .order('created_at', { ascending: false })
  const rows = resources ?? []

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <p className="eyebrow">{viewer.client.clientName}</p>
      <h1 className="text-page-title mt-2 text-ink">Library</h1>
      <p className="mt-2 text-sm text-ink-dim">
        Session prep guides and frameworks from your consultant live here.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-ink-dim">The first resources land before your next session.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-3"
            >
              <p className="flex items-center gap-2">
                {r.kind === 'framework' ? (
                  <Grid2x2 size={16} strokeWidth={1.75} aria-hidden className="text-brass" />
                ) : r.kind === 'template' ? (
                  <FileText size={16} strokeWidth={1.75} aria-hidden className="text-brass" />
                ) : (
                  <BookOpen size={16} strokeWidth={1.75} aria-hidden className="text-brass" />
                )}
                <Link href={`/library/${r.id}`} className="font-medium text-forest underline">
                  {r.title}
                </Link>
                <span className="font-mono text-xs uppercase text-ink-dim">
                  {KIND_META[r.kind]?.label ?? r.kind}
                </span>
              </p>
              {(r.tags ?? []).length > 0 ? (
                <p className="mt-1 text-xs text-ink-dim">{(r.tags as string[]).join(', ')}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

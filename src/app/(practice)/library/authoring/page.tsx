import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import MarkdownEditor from '@/components/MarkdownEditor'
import { createResource } from './actions'

/**
 * Library authoring (Ring 4): the practice's catalog. Everything
 * published here reaches every client member of the practice, which is
 * the point (spec 5.1) and the reason nothing client-specific belongs
 * in a resource. Client-specific artifacts are deliverables.
 */

const STATES: Record<string, string> = {
  created: 'Published. Every client can read it now.',
  deleted: 'Removed.',
  invalid: 'That did not validate. Title and kind are required.',
  save_failed: 'That did not save. Try again.',
}

export default async function AuthoringPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const supabase = await createServerSupabase()
  const { data: resources } = await supabase
    .from('resources')
    .select('id, title, kind, tags, created_at')
    .order('created_at', { ascending: false })

  return (
    <RoomShell
      eyebrow="Library"
      title="Authoring"
      description="Resources you publish here reach every client. Anything for one client only ships as a deliverable instead."
      maxWidth="max-w-3xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <section>
        {(resources ?? []).length === 0 ? (
          <p className="text-sm text-ink-dim">Nothing published yet. Author the first one below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(resources ?? []).map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-ink/10 bg-paper-raised px-4 py-2.5"
              >
                <span className="text-sm text-ink">
                  <Link href={`/library/authoring/${r.id}`} className="font-medium text-forest underline">
                    {r.title}
                  </Link>{' '}
                  <span className="font-mono text-xs uppercase text-ink-dim">{r.kind}</span>
                </span>
                {(r.tags ?? []).length > 0 ? (
                  <span className="text-xs text-ink-dim">{(r.tags as string[]).join(', ')}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">New resource</h2>
        <form action={createResource} className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <input
              name="title"
              placeholder="Title"
              className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
            />
            <select
              name="kind"
              defaultValue="guide"
              className="rounded-lg border border-ink/15 bg-paper-raised px-2 py-1 text-sm"
            >
              <option value="guide">Guide</option>
              <option value="framework">Framework</option>
              <option value="template">Template</option>
            </select>
          </div>
          <input
            name="tags"
            placeholder="Tags, comma separated (session prep, fundraising)"
            className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
          />
          <MarkdownEditor
            name="body"
            rows={10}
            placeholder="The resource itself. Use the toolbar for headings, lists, bold, and links."
          />
          <div>
            <button
              type="submit"
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Publish
            </button>
          </div>
        </form>
      </section>
    </RoomShell>
  )
}

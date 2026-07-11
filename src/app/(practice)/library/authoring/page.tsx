import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import MarkdownEditor from '@/components/MarkdownEditor'
import { createResource } from './actions'
import { KIND_OPTIONS } from './kinds'

/**
 * Library authoring (Ring 4, split by V2 4H): the practice's catalog,
 * two shelves. The client learning path reaches every client member of
 * the practice; the knowledge base (audience 'practice') never leaves
 * the workshop, by policy. Client-specific artifacts are deliverables.
 */

const STATES: Record<string, string> = {
  created: 'Published.',
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
    .select('id, title, kind, audience, tags, created_at')
    .order('created_at', { ascending: false })

  const clientPath = (resources ?? []).filter((r) => r.audience !== 'practice')
  const knowledgeBase = (resources ?? []).filter((r) => r.audience === 'practice')

  const row = (r: { id: string; title: string; kind: string; tags: string[] | null }) => (
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
  )

  return (
    <RoomShell
      eyebrow="Library"
      title="Authoring"
      description="Two shelves: the client learning path reaches every client; the knowledge base stays in the workshop."
      maxWidth="max-w-3xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <section>
        <h2 className="font-display text-2xl font-medium text-ink">Client learning path</h2>
        <p className="mt-1 text-xs text-ink-dim">Every client member of the practice reads these.</p>
        {clientPath.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">Nothing published yet. Author the first one below.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">{clientPath.map(row)}</ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Knowledge base</h2>
        <p className="mt-1 text-xs text-ink-dim">
          Practice only, by policy: SOPs, templates, prompt recipes, diagnostics. The way of
          working, kept where you work.
        </p>
        {knowledgeBase.length === 0 ? (
          <p className="mt-3 text-sm text-ink-dim">
            The shelf is built and empty. It fills as templates prove out; nothing moves in
            uninvited.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">{knowledgeBase.map(row)}</ul>
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
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <select
              name="audience"
              defaultValue="client"
              className="rounded-lg border border-ink/15 bg-paper-raised px-2 py-1 text-sm"
            >
              <option value="client">Client learning path</option>
              <option value="practice">Knowledge base (practice only)</option>
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

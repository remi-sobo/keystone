import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { deleteResource, updateResource } from '../actions'

/**
 * Edit one resource (Ring 4). Reads and writes ride the session client;
 * the consultant-only policies are the wall.
 */

const STATES: Record<string, string> = {
  saved: 'Saved.',
  invalid: 'That did not validate.',
  save_failed: 'That did not save. Try again.',
}

export default async function EditResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const { id } = await params
  const { state } = await searchParams
  const supabase = await createServerSupabase()

  const { data: resource } = await supabase
    .from('resources')
    .select('id, title, kind, tags, body_md')
    .eq('id', id)
    .maybeSingle()
  if (!resource) redirect('/library/authoring')

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:px-10 md:py-12">
      <p className="eyebrow">
        <Link href="/library/authoring" className="underline">
          Library
        </Link>{' '}
        / edit
      </p>
      <h1 className="text-page-title mt-2 text-ink">{resource.title}</h1>

      {state && STATES[state] ? (
        <p role="status" className="mt-4 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <form action={updateResource} className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="resourceId" value={resource.id} />
        <div className="flex flex-wrap gap-3">
          <input
            name="title"
            defaultValue={resource.title}
            className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
          />
          <select
            name="kind"
            defaultValue={resource.kind}
            className="rounded-lg border border-ink/15 bg-paper-raised px-2 py-1 text-sm"
          >
            <option value="guide">Guide</option>
            <option value="framework">Framework</option>
            <option value="template">Template</option>
          </select>
        </div>
        <input
          name="tags"
          defaultValue={((resource.tags ?? []) as string[]).join(', ')}
          placeholder="Tags, comma separated"
          className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
        />
        <textarea
          name="body"
          rows={14}
          defaultValue={resource.body_md ?? ''}
          className="w-full rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm text-ink"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Save
          </button>
        </div>
      </form>

      <form action={deleteResource} className="mt-6">
        <input type="hidden" name="resourceId" value={resource.id} />
        <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
          Remove from the library
        </button>
      </form>
    </div>
  )
}

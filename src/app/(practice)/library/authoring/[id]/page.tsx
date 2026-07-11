import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import MarkdownEditor from '@/components/MarkdownEditor'
import AttachDocForm from './AttachDocForm'
import { deleteResource, removeResourceFile, updateResource } from '../actions'
import { KIND_OPTIONS } from '../kinds'

/**
 * Edit one resource (Ring 4). Reads and writes ride the session client;
 * the consultant-only policies are the wall.
 */

const STATES: Record<string, string> = {
  saved: 'Saved.',
  invalid: 'That did not validate.',
  save_failed: 'That did not save. Try again.',
  doc_removed: 'Document removed from the resource.',
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
    .select('id, title, kind, audience, tags, body_md, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (!resource) redirect('/library/authoring')

  return (
    <RoomShell
      eyebrow={
        <>
          <Link href="/library/authoring" className="underline">
            Library
          </Link>{' '}
          / edit
        </>
      }
      title={resource.title}
      maxWidth="max-w-3xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <form action={updateResource} className="flex flex-col gap-3">
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
            {KIND_OPTIONS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <select
            name="audience"
            defaultValue={resource.audience ?? 'client'}
            className="rounded-lg border border-ink/15 bg-paper-raised px-2 py-1 text-sm"
          >
            <option value="client">Client learning path</option>
            <option value="practice">Knowledge base (practice only)</option>
          </select>
        </div>
        <input
          name="tags"
          defaultValue={((resource.tags ?? []) as string[]).join(', ')}
          placeholder="Tags, comma separated"
          className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
        />
        <MarkdownEditor name="body" rows={16} defaultValue={resource.body_md ?? ''} />
        <div className="flex gap-3">
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Save
          </button>
        </div>
      </form>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Document</h2>
        <p className="mt-1 text-sm text-ink-dim">
          A PDF or Word file that ships with this resource. Clients view and download it from
          the library.
        </p>
        {resource.storage_path ? (
          <p className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink">
            {resource.storage_path.split('/').pop()}
            <a
              href={`/library/authoring/${resource.id}/file?view=1`}
              target="_blank"
              rel="noreferrer"
              className="text-ink-dim underline hover:text-ink"
            >
              View
            </a>
            <a
              href={`/library/authoring/${resource.id}/file`}
              className="text-ink-dim underline hover:text-ink"
            >
              Download
            </a>
            <span className="inline-flex">
              <RemoveDocButton resourceId={resource.id} />
            </span>
          </p>
        ) : (
          <p className="mt-3 text-sm text-ink-dim">Nothing attached.</p>
        )}
        <div className="mt-3">
          <AttachDocForm resourceId={resource.id} />
        </div>
      </section>

      <form action={deleteResource} className="mt-10">
        <input type="hidden" name="resourceId" value={resource.id} />
        <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
          Remove from the library
        </button>
      </form>
    </RoomShell>
  )
}

function RemoveDocButton({ resourceId }: { resourceId: string }) {
  return (
    <form action={removeResourceFile}>
      <input type="hidden" name="resourceId" value={resourceId} />
      <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
        Remove
      </button>
    </form>
  )
}

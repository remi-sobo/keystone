import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { MarkdownLite } from '@/components/MarkdownLite'
import { publishCharter, requestCharterSignoff, saveCharterDraft } from './actions'

/**
 * The charter editor (V2 2A). Draft, publish, and the sign-off state.
 * Publishing supersedes the previous version, withdraws its pending
 * request, and sends the new sign-off ask; the fee appears in the
 * charter body and nowhere else in the app (gate 9).
 */

const STATES: Record<string, string> = {
  saved: 'Draft saved.',
  published: 'Published, and the sign-off request is with the client.',
  no_draft: 'There is no draft to publish. Write one below.',
  no_published: 'Nothing is published yet.',
  already_asked: 'A sign-off is already pending or granted for this version.',
  asked: 'Sign-off requested.',
  error: 'That did not save. Try again.',
}

function fmtDay(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function CharterEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const { id } = await params
  const { state } = await searchParams
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  const { data: versions } = await supabase
    .from('engagement_charters')
    .select('id, version, status, body_md, published_at')
    .eq('engagement_id', id)
    .order('version', { ascending: false })

  const draft = (versions ?? []).find((v) => v.status === 'draft')
  const published = (versions ?? []).find((v) => v.status === 'published')
  const superseded = (versions ?? []).filter((v) => v.status === 'superseded')

  const { data: signoff } = published
    ? await supabase
        .from('approvals')
        .select('status, decided_by_email, decided_at, note_md, requested_at')
        .eq('subject_type', 'charter')
        .eq('subject_id', published.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  return (
    <RoomShell eyebrow="Engagements / charter" title={engagement.title} maxWidth="max-w-3xl">
      <p className="text-sm text-ink-dim">
        The engagement&apos;s constitution: what this is, what it is not, and what both sides
        agreed to. The fee lives here and nowhere else.{' '}
        <Link href={`/engagements/${engagement.id}`} className="underline hover:text-ink">
          Back to the engagement
        </Link>
      </p>
      {state && STATES[state] ? (
        <p role="status" className="mt-3 text-sm text-ink">
          {STATES[state]}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">Published</h2>
        {published ? (
          <>
            <p className="mt-1 text-sm text-ink-dim">
              Version {published.version}, published {fmtDay(published.published_at)}.{' '}
              {signoff?.status === 'approved'
                ? `Approved by ${signoff.decided_by_email ?? 'the client'}, ${fmtDay(signoff.decided_at)}.`
                : signoff?.status === 'pending'
                  ? `Sign-off requested ${fmtDay(signoff.requested_at)}, awaiting the client.`
                  : signoff?.status === 'not_yet'
                    ? `The client said not yet${signoff.note_md ? `: "${signoff.note_md}"` : '.'}`
                    : 'No sign-off has been requested for this version.'}
            </p>
            {!signoff || signoff.status === 'not_yet' || signoff.status === 'withdrawn' ? (
              <form action={requestCharterSignoff} className="mt-2">
                <input type="hidden" name="engagementId" value={engagement.id} />
                <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                  Request sign-off
                </button>
              </form>
            ) : null}
            <KeystoneCard className="mt-4">
              <MarkdownLite text={published.body_md} />
            </KeystoneCard>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-dim">
            Nothing published yet. The client sees no charter until you publish.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">
          {draft ? `Draft, version ${draft.version}` : 'Next draft'}
        </h2>
        <p className="mt-1 text-sm text-ink-dim">
          {published
            ? `Publishing supersedes version ${published.version} and sends a fresh sign-off request; assent binds to the version that was read.`
            : 'Publishing makes this the live charter and sends the sign-off request.'}
        </p>
        <form action={saveCharterDraft} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="engagementId" value={engagement.id} />
          <textarea
            name="body"
            rows={16}
            maxLength={60000}
            defaultValue={draft?.body_md ?? published?.body_md ?? ''}
            placeholder="## Why this engagement exists"
            className="rounded-lg border border-ink/15 bg-paper p-3 font-mono text-sm text-ink"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Save draft
            </button>
          </div>
        </form>
        {draft ? (
          <form action={publishCharter} className="mt-3">
            <input type="hidden" name="engagementId" value={engagement.id} />
            <button
              type="submit"
              className="rounded-lg border border-forest px-4 py-2 text-sm font-medium text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
            >
              Publish version {draft.version}
            </button>
          </form>
        ) : null}
      </section>

      {superseded.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-2xl font-medium text-ink">History</h2>
          <ul className="mt-2 flex flex-col gap-1">
            {superseded.map((v) => (
              <li key={v.id} className="text-sm text-ink-dim">
                Version {v.version}, published {fmtDay(v.published_at)}, superseded.
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </RoomShell>
  )
}

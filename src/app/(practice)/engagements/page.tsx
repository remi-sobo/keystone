import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import WorkstreamArc from '@/components/WorkstreamArc'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { newDraft } from './drafts/actions'

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

const NOTES: Record<string, string> = {
  draft_error: 'That draft could not be created. Try again.',
  draft_discarded: 'Draft discarded. It stays in the record and can be restored.',
}

/**
 * The practice's engagement list with each engagement's workstream
 * arcs, and the builder's drafts above it (V2 1B). Mission control
 * (run of show, homework ledger, readiness panel) assembled in Ring 3;
 * the engagement cards are the read-only spine view.
 */
export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>
}) {
  const { note } = await searchParams
  const supabase = await createServerSupabase()
  const [{ data: engagements }, { data: practice }, { data: upcoming }, { data: drafts }] =
    await Promise.all([
      supabase
        .from('engagements')
        .select('id, title, status, clients(name), workstreams(id, title, stage, sort)')
        .order('created_at', { ascending: true }),
      supabase.from('practices').select('stage_config').limit(1).maybeSingle(),
      supabase
        .from('sessions')
        .select('id, engagement_id, starts_at, tz, kind')
        .eq('status', 'booked')

        .gte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: true }),
      supabase
        .from('engagement_drafts')
        .select('id, title, status, client_id, clients(name), updated_at')
        .in('status', ['draft', 'published'])
        .order('updated_at', { ascending: false }),
    ])

  const stages =
    Array.isArray(practice?.stage_config) && practice.stage_config.length > 0
      ? (practice.stage_config as string[])
      : DEFAULT_STAGES

  const openDrafts = (drafts ?? []).filter((d) => d.status === 'draft')
  const publishedDrafts = (drafts ?? []).filter((d) => d.status === 'published')

  return (
    <RoomShell eyebrow="Engagements" title="Engagements" maxWidth="max-w-4xl">
      {note && NOTES[note] ? (
        <p role="status" className="mb-4 text-sm text-ink">
          {NOTES[note]}
        </p>
      ) : null}

      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">Drafts</p>
          <form action={newDraft}>
            <button
              type="submit"
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              New engagement
            </button>
          </form>
        </div>
        {openDrafts.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-2">
            {openDrafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 basis-48">
                  <Link href={`/engagements/drafts/${d.id}`} className="text-sm text-ink hover:underline">
                    {d.title}
                  </Link>
                  <span className="block text-xs text-ink-dim">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {((d.clients as any)?.name as string) ?? 'no client yet'}, touched{' '}
                    {new Date(d.updated_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </span>
                <Link
                  href={`/engagements/drafts/${d.id}`}
                  className="text-sm text-ink-dim underline hover:text-ink"
                >
                  Resume
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-dim">
            No drafts in progress. A draft stays invisible to the client until you publish it.
          </p>
        )}
        {publishedDrafts.length > 0 ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-ink-dim">
              Published drafts, kept as the scoping record ({publishedDrafts.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {publishedDrafts.map((d) => (
                <li key={d.id} className="text-sm text-ink-dim">
                  <Link href={`/engagements/drafts/${d.id}`} className="underline hover:text-ink">
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {!engagements || engagements.length === 0 ? (
        <p className="text-ink-dim">No engagements yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {engagements.map((e) => (
            <KeystoneCard key={e.id}>
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-2xl font-medium text-ink">
                  <a href={`/engagements/${e.id}`} className="hover:underline">
                    {e.title}
                  </a>
                </h2>
                <span className="eyebrow">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {((e.clients as any)?.name as string) ?? ''}
                </span>
              </div>
              <div className="mt-6 flex flex-col gap-6">
                {(e.workstreams ?? [])
                  .sort((a, b) => a.sort - b.sort)
                  .map((w) => (
                    <WorkstreamArc
                      key={w.id}
                      title={w.title}
                      stage={w.stage}
                      stages={stages}
                      freshStages={[]}
                    />
                  ))}
              </div>
              {(upcoming ?? []).filter((s) => s.engagement_id === e.id).length > 0 ? (
                <div className="mt-6 border-t border-ink/10 pt-4">
                  <p className="eyebrow">Upcoming sessions</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {(upcoming ?? [])
                      .filter((s) => s.engagement_id === e.id)
                      .slice(0, 5)
                      .map((s) => (
                        <li key={s.id} className="text-sm text-ink-dim">
                          {new Intl.DateTimeFormat('en-US', {
                            timeZone: s.tz,
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date(s.starts_at))}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </KeystoneCard>
          ))}
        </div>
      )}
    </RoomShell>
  )
}

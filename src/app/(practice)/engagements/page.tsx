import { createServerSupabase } from '@/lib/supabase/server'
import WorkstreamArc from '@/components/WorkstreamArc'

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

/**
 * The practice's engagement list with each engagement's workstream
 * arcs. Mission control (run of show, homework ledger, readiness
 * panel) assembles in Ring 3; this page is the read-only spine view.
 */
export default async function EngagementsPage() {
  const supabase = await createServerSupabase()
  const [{ data: engagements }, { data: practice }] = await Promise.all([
    supabase
      .from('engagements')
      .select('id, title, status, clients(name), workstreams(id, title, stage, sort)')
      .order('created_at', { ascending: true }),
    supabase.from('practices').select('stage_config').limit(1).maybeSingle(),
  ])

  const stages =
    Array.isArray(practice?.stage_config) && practice.stage_config.length > 0
      ? (practice.stage_config as string[])
      : DEFAULT_STAGES

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
      <p className="eyebrow">Engagements</p>
      <h1 className="text-page-title mt-2 text-ink">Engagements</h1>

      {!engagements || engagements.length === 0 ? (
        <p className="mt-6 text-ink-dim">No engagements yet.</p>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {engagements.map((e) => (
            <section
              key={e.id}
              className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-6"
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="font-display text-2xl font-medium text-ink">{e.title}</h2>
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
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

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
  const [{ data: engagements }, { data: practice }, { data: upcoming }] = await Promise.all([
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
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

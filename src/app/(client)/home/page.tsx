import { redirect } from 'next/navigation'
import WorkstreamArc from '@/components/WorkstreamArc'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

/**
 * Client Home, the progress view: the screen the fee lives on
 * (spec 6.4). One row per workstream, each at its own stage. The right
 * rail (next session, homework due, latest deliverable) fills in as
 * Rings 2 through 4 land; its empty states do work in the meantime.
 * Answers "where are we" in five seconds without a word of jargon.
 */

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

export default async function ClientHomePage() {
  const viewer = await getViewer()
  if (!viewer.client) redirect('/login')
  const supabase = await createServerSupabase()

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, status, practice_id')
    .eq('client_id', viewer.client.clientId)
    .in('status', ['active', 'proposed', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let workstreams: Array<{ id: string; title: string; stage: string }> = []
  let stages = DEFAULT_STAGES
  const freshByWorkstream = new Map<string, string[]>()

  if (engagement) {
    const [ws, practice, events] = await Promise.all([
      supabase
        .from('workstreams')
        .select('id, title, stage, sort')
        .eq('engagement_id', engagement.id)
        .order('sort', { ascending: true }),
      supabase.from('practices').select('stage_config').eq('id', engagement.practice_id).maybeSingle(),
      supabase
        .from('workstream_stage_events')
        .select('workstream_id, from_stage, at')
        .eq('engagement_id', engagement.id)
        // Per-request wall clock is intended: the brass tick marks
        // stages completed within the last 7 days of THIS render.
        // eslint-disable-next-line react-hooks/purity
        .gte('at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])
    workstreams = ws.data ?? []
    if (Array.isArray(practice.data?.stage_config) && practice.data.stage_config.length > 0) {
      stages = practice.data.stage_config as string[]
    }
    for (const e of events.data ?? []) {
      if (!e.from_stage) continue
      const list = freshByWorkstream.get(e.workstream_id) ?? []
      list.push(e.from_stage)
      freshByWorkstream.set(e.workstream_id, list)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
      <p className="eyebrow">{viewer.client.clientName}</p>
      <h1 className="text-page-title mt-2 text-ink">
        {engagement ? engagement.title : 'Your engagement'}
      </h1>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_280px]">
        <section aria-label="Workstreams" className="flex flex-col gap-8">
          {workstreams.length === 0 ? (
            <p className="text-ink-dim">
              Your workstreams appear here after the kickoff session.
            </p>
          ) : (
            workstreams.map((w) => (
              <WorkstreamArc
                key={w.id}
                title={w.title}
                stage={w.stage}
                stages={stages}
                freshStages={freshByWorkstream.get(w.id) ?? []}
              />
            ))
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-4">
            <p className="eyebrow">Next session</p>
            <p className="mt-2 text-sm text-ink-dim">
              Scheduling opens soon. Your consultant will reach out.
            </p>
          </div>
          <div className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-4">
            <p className="eyebrow">Homework due</p>
            <p className="mt-2 text-sm text-ink-dim">Nothing due yet.</p>
          </div>
          <div className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-4">
            <p className="eyebrow">Latest deliverable</p>
            <p className="mt-2 text-sm text-ink-dim">
              Your first deliverable lands after the kickoff session.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

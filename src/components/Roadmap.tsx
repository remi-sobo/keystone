import { KeystoneCard } from '@/components/KeystoneCard'

/**
 * Roadmap: the six-month build as the client sees it (0038). Six phase
 * cards in order, each with its numbered sessions; the active session
 * breathes forest (the one allowed loop), done sessions carry the brass
 * tick, the future stays quiet ink. Read-only by design: no operator
 * controls ever render here, and the data arrives through the caller's
 * own session under RLS.
 */

export interface RoadmapSession {
  id: string
  code: string
  title: string
  attendees: string | null
  status: string
  scheduled_at: string | null
}

export interface RoadmapPhase {
  id: string
  month_label: string
  title: string
  subtitle: string | null
  sessions: RoadmapSession[]
}

/** The standing room; only the additions ("+ Shannon") earn a chip. */
function extraAttendees(attendees: string | null): string | null {
  if (!attendees) return null
  const plus = attendees.indexOf('+')
  return plus >= 0 ? attendees.slice(plus).trim() : null
}

export function Roadmap({ phases }: { phases: RoadmapPhase[] }) {
  if (phases.length === 0) return null
  return (
    <section aria-label="The six-month roadmap" className="mb-10">
      <p className="eyebrow">The six months</p>
      <div className="mt-3 grid items-start gap-4 md:grid-cols-2">
        {phases.map((phase) => {
          const hasActive = phase.sessions.some((s) => s.status === 'active')
          return (
            <KeystoneCard key={phase.id} feature={hasActive}>
              <p className="eyebrow">{phase.month_label}</p>
              <h3 className="font-display mt-1 text-xl text-navy">{phase.title}</h3>
              {phase.subtitle ? (
                <p className="mt-1 text-sm text-ink-dim">{phase.subtitle}</p>
              ) : null}
              <ul className="mt-3 flex flex-col gap-1.5 border-t border-ink/10 pt-3">
                {phase.sessions.map((s) => {
                  const extra = extraAttendees(s.attendees)
                  return (
                    <li key={s.id} className="flex items-baseline gap-2 text-sm">
                      <span className="w-8 shrink-0 font-mono text-xs text-ink-dim">
                        {s.code}
                      </span>
                      {s.status === 'done' ? (
                        <span aria-hidden="true" className="shrink-0 text-brass">
                          ✓
                        </span>
                      ) : null}
                      <span
                        className={
                          s.status === 'active'
                            ? 'font-medium text-forest'
                            : s.status === 'done'
                              ? 'text-ink-dim'
                              : 'text-ink'
                        }
                      >
                        {s.title}
                        {s.status === 'done' ? (
                          <span className="sr-only"> (done)</span>
                        ) : null}
                      </span>
                      {s.status === 'active' ? (
                        <span className="stage-breathing shrink-0 rounded-full border border-forest px-2 py-0.5 font-mono text-[0.65rem] uppercase tracking-wider text-forest">
                          now
                        </span>
                      ) : null}
                      {extra || (s.scheduled_at && s.status !== 'done') ? (
                        <span className="ml-auto flex shrink-0 items-baseline gap-2 font-mono text-[0.65rem] text-ink-dim">
                          {extra ? <span>{extra}</span> : null}
                          {s.scheduled_at && s.status !== 'done' ? (
                            <span>
                              {new Date(s.scheduled_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </KeystoneCard>
          )
        })}
      </div>
    </section>
  )
}

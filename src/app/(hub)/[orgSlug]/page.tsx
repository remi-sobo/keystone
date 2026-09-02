import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { homeFigures } from '@/lib/hubFigures'
import { hubMoney } from '@/lib/hubTheme'
import Stat from '@/components/hub/Stat'
import Card from '@/components/hub/Card'
import Tag from '@/components/hub/Tag'
import SectionTitle from '@/components/hub/SectionTitle'

/**
 * HOME: what matters right now. The Monday morning screen, not a
 * dashboard. Three numbers (computed or absent), the next three moves
 * (chosen by rules, each with its reason visible), the money summary
 * by strategy, and this week's hours. Built last in full (phase
 * five); this shell already refuses to show a number it cannot
 * compute.
 */
export default async function HubHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const [figures, tasksRes, strategiesRes, capacityRes] = await Promise.all([
    homeFigures(supabase, hub.orgId, hub.fiscalYearStart),
    supabase
      .from('hub_tasks')
      .select('id, title, why, owner, due_date, pinned_slot')
      .eq('org_id', hub.orgId)
      .is('done_at', null)
      .order('pinned_slot', { ascending: true, nullsFirst: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(3),
    supabase
      .from('hub_strategies')
      .select('id, name, owner, goal_cents, goal_trust, next_move, sort')
      .eq('org_id', hub.orgId)
      .order('sort'),
    supabase
      .from('hub_capacity')
      .select('person, hours_per_week, trust')
      .eq('org_id', hub.orgId)
      .order('sort'),
  ])

  const tasks = tasksRes.data ?? []
  const strategies = strategiesRes.data ?? []
  const capacity = capacityRes.data ?? []
  const hoursAvailable = capacity.reduce((s, c) => s + (Number(c.hours_per_week) || 0), 0)

  const fyLabel = figures.fiscalYear ? `FY${figures.fiscalYear}` : null

  return (
    <div>
      <SectionTitle label="Home" title="What matters right now" />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 1,
          background: 'var(--hub-line-on-black)',
          border: '1px solid var(--hub-line-on-black)',
        }}
      >
        <Stat
          label={fyLabel ? `To raise, ${fyLabel}` : 'To raise this year'}
          value={figures.goal.cents !== null ? hubMoney(figures.goal.cents) : null}
          trust={figures.goal.trust}
          gap="The budget workbook isn't loaded yet. The goal comes from it, never from a typed-in number."
        />
        <Stat
          label="Committed so far"
          value={figures.committed.cents !== null ? hubMoney(figures.committed.cents) : null}
          trust={figures.committed.trust}
          gap="No gifts or pledges are recorded yet."
        />
        <Stat
          label="Still to raise"
          value={figures.gap.cents !== null ? hubMoney(figures.gap.cents) : null}
          trust={figures.gap.trust}
          gap="Computed from the goal and what's committed, once the goal is in."
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 44, marginTop: 34 }}>
        <section>
          <h2
            style={{
              fontFamily: 'var(--hub-font-detail)',
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--hub-gold-ink)',
              borderBottom: '3px solid var(--hub-gold)',
              paddingBottom: 8,
            }}
          >
            Your next three moves
          </h2>
          {tasks.length === 0 ? (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)' }}>
              Nothing queued yet. Moves show up here once people and plans are in, each with the
              reason it matters.
            </p>
          ) : (
            tasks.map((t, i) => (
              <div key={t.id} style={{ marginTop: 16 }}>
                <Card rule={i === 0}>
                  <div
                    style={{
                      fontFamily: 'var(--hub-font-detail)',
                      fontSize: 11,
                      letterSpacing: '0.18em',
                      color: 'var(--hub-gold-ink)',
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{t.title}</div>
                  {t.why ? (
                    <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 6 }}>{t.why}</div>
                  ) : null}
                  <div
                    style={{
                      fontFamily: 'var(--hub-font-detail)',
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--hub-stone-ink)',
                      marginTop: 10,
                    }}
                  >
                    {[t.due_date, t.owner].filter(Boolean).join(' · ')}
                  </div>
                </Card>
              </div>
            ))
          )}
        </section>

        <section>
          <h2
            style={{
              fontFamily: 'var(--hub-font-detail)',
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--hub-gold-ink)',
              borderBottom: '3px solid var(--hub-gold)',
              paddingBottom: 8,
            }}
          >
            Where the money will come from
          </h2>
          {strategies.length === 0 ? (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)' }}>
              No strategies are set up yet.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
              <tbody>
                {strategies.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                    <td style={{ padding: '10px 8px 10px 0', fontSize: 14, fontWeight: 600 }}>
                      {s.name}
                    </td>
                    <td
                      style={{
                        padding: '10px 8px',
                        fontFamily: 'var(--hub-font-detail)',
                        fontSize: 12,
                      }}
                    >
                      {s.goal_cents !== null ? (
                        <>
                          {hubMoney(Number(s.goal_cents))}
                          {s.goal_trust ? (
                            <span style={{ color: 'var(--hub-stone-ink)' }}> · {s.goal_trust}</span>
                          ) : null}
                        </>
                      ) : (
                        <Tag tone="terracotta">no goal yet</Tag>
                      )}
                    </td>
                    <td style={{ padding: '10px 0', fontSize: 13, color: 'var(--hub-stone-ink)' }}>
                      {s.owner ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2
            style={{
              fontFamily: 'var(--hub-font-detail)',
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--hub-gold-ink)',
              borderBottom: '3px solid var(--hub-gold)',
              paddingBottom: 8,
              marginTop: 34,
            }}
          >
            This week
          </h2>
          {capacity.length === 0 ? (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)' }}>
              No hours are recorded yet.
            </p>
          ) : (
            <p style={{ fontSize: 15, lineHeight: 1.6 }}>
              {hoursAvailable} hours available across{' '}
              {capacity.map((c) => c.person).join(' and ')}. What each strategy costs in hours
              lives under Work.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { annualCost, committedByStrategy, homeFigures } from '@/lib/hubFigures'
import { chooseHomeMoves, type MoveTask } from '@/lib/hubMoves'
import { hubMoney } from '@/lib/hubTheme'
import Stat from '@/components/hub/Stat'
import Card from '@/components/hub/Card'
import Tag from '@/components/hub/Tag'
import SectionTitle from '@/components/hub/SectionTitle'
import { pinTask, unpinTask } from './home-actions'

/**
 * HOME: what matters right now. The Monday morning screen, not a
 * dashboard: three numbers (computed or absent), the next three moves
 * (chosen by the rules in lib/hubMoves.ts, never by a model, each
 * with its reason on the card, pinnable), the money summarized one
 * row per strategy, and this week's hours. Built last on purpose: it
 * summarizes the four sections that now exist.
 */

const label = {
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  color: 'var(--hub-stone-ink)',
}

export default async function HubHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const figures = await homeFigures(supabase, hub.orgId, hub.fiscalYearStart)
  const [cost, committed, tasksRes, strategiesRes, capacityRes, collateralRes, donorsRes, touchesRes] =
    await Promise.all([
      annualCost(supabase, hub.orgId, figures.fiscalYear),
      committedByStrategy(supabase, hub.orgId, figures.fiscalYear),
      supabase
        .from('hub_tasks')
        .select('id, title, why, owner, area, source, due_date, due_label, pinned_slot')
        .eq('org_id', hub.orgId)
        .is('done_at', null),
      supabase
        .from('hub_strategies')
        .select('id, slug, name, owner, goal_cents, goal_trust, next_move, sort')
        .eq('org_id', hub.orgId)
        .order('sort'),
      supabase
        .from('hub_capacity')
        .select('person, hours_per_week')
        .eq('org_id', hub.orgId)
        .order('sort'),
      supabase
        .from('hub_collateral')
        .select('name, owner, due_date, status, blocks')
        .eq('org_id', hub.orgId)
        .order('sort'),
      supabase
        .from('hub_donors')
        .select('id, household, capacity_5yr_cents, do_not_contact, last_gift_date')
        .eq('org_id', hub.orgId),
      supabase.from('hub_touches').select('donor_id').eq('org_id', hub.orgId),
    ])

  const tasks = (tasksRes.data ?? []) as MoveTask[]
  const strategies = strategiesRes.data ?? []
  const capacity = capacityRes.data ?? []
  const touchedIds = new Set((touchesRes.data ?? []).map((t) => t.donor_id as string))

  const moves = chooseHomeMoves({
    today: new Date().toISOString().slice(0, 10),
    tasks,
    collateral: collateralRes.data ?? [],
    strategies: strategies.map((s) => ({
      id: s.id,
      name: s.name,
      owner: s.owner,
      goal_cents: s.goal_cents === null ? null : Number(s.goal_cents),
      next_move: s.next_move,
    })),
    committedByStrategy: committed,
    donors: (donorsRes.data ?? []).map((d) => ({
      id: d.id,
      household: d.household,
      capacity_5yr_cents: d.capacity_5yr_cents === null ? null : Number(d.capacity_5yr_cents),
      do_not_contact: d.do_not_contact,
      last_gift_date: d.last_gift_date,
      touched: touchedIds.has(d.id),
    })),
  })

  const available = capacity.reduce((s, c) => s + (Number(c.hours_per_week) || 0), 0)

  const fyLabel = figures.fiscalYear ? `FY${figures.fiscalYear}` : null
  const pinAction = pinTask.bind(null, orgSlug)
  const unpinAction = unpinTask.bind(null, orgSlug)

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
          explain={
            cost.cents !== null
              ? `Running the ministry costs ${hubMoney(cost.cents)} this year; the goal adds the service charge on gifts and the capital need, minus the rent and transfers the area already gets.`
              : 'Costs, minus rent and transfers, grossed up for the service charge on gifts, plus the capital need.'
          }
        />
        <Stat
          label="Committed so far"
          value={figures.committed.cents !== null ? hubMoney(figures.committed.cents) : null}
          trust={figures.committed.trust}
          gap="No gifts or pledges are recorded yet."
          explain="Actual gift and pledge records for the current year, logged here. Not lifetime giving, not capacity, and never an estimate."
        />
        <Stat
          label="Still to raise"
          value={figures.gap.cents !== null ? hubMoney(figures.gap.cents) : null}
          trust={figures.gap.trust}
          gap="Computed from the goal and what's committed, once the goal is in."
          explain="The goal minus what's committed. When this reaches zero the year is funded."
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 56,
          marginTop: 48,
        }}
      >
        <section>
          <h2 className="hub-h2">Your next three moves</h2>
          {moves.length === 0 ? (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)' }}>
              Nothing is asking for attention right now.
            </p>
          ) : (
            moves.map((m, i) => (
              <div key={`${m.title}-${i}`} style={{ marginTop: 16 }}>
                <Card rule={i === 0}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div
                      style={{
                        fontFamily: 'var(--hub-font-detail)',
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: '0.16em',
                        color: 'var(--hub-gold-ink)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {String(i + 1).padStart(2, '0')} · {m.verb}
                    </div>
                    {m.taskId ? (
                      m.pinned ? (
                        <form action={unpinAction}>
                          <input type="hidden" name="task_id" value={m.taskId} />
                          <button
                            type="submit"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: 'var(--hub-font-detail)',
                              fontSize: 11,
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              color: 'var(--hub-gold-ink)',
                            }}
                          >
                            Pinned · unpin
                          </button>
                        </form>
                      ) : (
                        <form action={pinAction}>
                          <input type="hidden" name="task_id" value={m.taskId} />
                          <input type="hidden" name="slot" value={i + 1} />
                          <button
                            type="submit"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontFamily: 'var(--hub-font-detail)',
                              fontSize: 11,
                              letterSpacing: '0.14em',
                              textTransform: 'uppercase',
                              color: 'var(--hub-stone-ink)',
                            }}
                          >
                            Pin here
                          </button>
                        </form>
                      )
                    ) : null}
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.3, marginTop: 8 }}>
                    {m.title}
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.6, marginTop: 8 }}>{m.why}</div>
                  <div style={{ ...label, marginTop: 12 }}>
                    {[m.when, m.owner].filter(Boolean).join(' · ')}
                  </div>
                </Card>
              </div>
            ))
          )}
          <p style={{ marginTop: 18 }}>
            <Link href={`/${orgSlug}/work`} className="hub-quiet-link">
              · Everything on the list, under Work
            </Link>
          </p>
        </section>

        <section>
          <h2 className="hub-h2">Where the money will come from</h2>
          {strategies.length === 0 ? (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)' }}>
              No strategies are set up yet.
            </p>
          ) : (
            <div style={{ marginTop: 6 }}>
              {strategies.map((s) => {
                const c = committed.get(s.id) ?? 0
                const goal = s.goal_cents === null ? null : Number(s.goal_cents)
                const status =
                  goal === null
                    ? 'no goal yet'
                    : c === 0
                      ? 'not started'
                      : c >= goal
                        ? 'covered'
                        : 'moving'
                const pct = goal ? Math.min(100, Math.round((c / goal) * 100)) : 0
                return (
                  <div
                    key={s.id}
                    style={{
                      borderBottom: '1px solid var(--hub-line-on-paper)',
                      padding: '16px 0 18px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 12,
                      }}
                    >
                      <Link
                        href={`/${orgSlug}/plan/${s.slug}`}
                        style={{
                          color: 'var(--hub-acid-black)',
                          textDecoration: 'none',
                          fontSize: 16,
                          fontWeight: 700,
                        }}
                      >
                        {s.name}
                      </Link>
                      <Tag
                        tone={status === 'covered' ? 'gold' : status === 'no goal yet' ? 'terracotta' : 'muted'}
                        fill={status === 'covered'}
                      >
                        {status}
                      </Tag>
                    </div>
                    {goal !== null ? (
                      <>
                        <div className="hub-num" style={{ marginTop: 6, color: 'var(--hub-stone-ink)' }}>
                          <span style={{ color: 'var(--hub-acid-black)', fontWeight: 700 }}>
                            {hubMoney(c)}
                          </span>{' '}
                          of {hubMoney(goal)}
                        </div>
                        <div className="hub-bar" aria-hidden>
                          <i style={{ width: `${pct}%` }} />
                        </div>
                      </>
                    ) : (
                      <div style={{ ...label, marginTop: 6 }}>
                        Goal lands with a trust level when the figure is entered.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <h2 className="hub-h2" style={{ marginTop: 44 }}>This week</h2>
          {capacity.length === 0 ? (
            <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)' }}>
              No hours are recorded yet.
            </p>
          ) : (
            <p style={{ fontSize: 15, lineHeight: 1.6 }}>
              {available} hours available across {capacity.map((c) => c.person).join(' and ')}.
              Whether that covers what the strategies ask for lives under{' '}
              <Link href={`/${orgSlug}/work`} style={{ color: 'var(--hub-gold-ink)' }}>
                Work
              </Link>
              .
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

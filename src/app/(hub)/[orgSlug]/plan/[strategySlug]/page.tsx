import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { hubMoney } from '@/lib/hubTheme'
import { committedByStrategy, homeFigures } from '@/lib/hubFigures'
import Tag from '@/components/hub/Tag'
import ContentBlocks from '@/components/hub/ContentBlocks'

/**
 * One strategy's full playbook: the four things the method requires
 * (precondition, dependency, failure mode, done means), each rendered
 * as a gap when it has not been written, then the playbook content
 * from the plan itself, the committed gifts, and the open moves.
 */

const label = {
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--hub-stone-ink)',
}

const METHOD_FIELDS: [key: 'precondition' | 'dependency' | 'failure_mode' | 'done_means', title: string, gap: string][] = [
  ['precondition', 'The precondition', 'What has to exist before this can start. Not written yet.'],
  ['dependency', 'The dependency', 'Who else has to do something. Not written yet.'],
  ['failure_mode', 'The failure mode', 'The specific way this goes wrong. Not written yet.'],
  ['done_means', 'Done means', 'What has to be true to call it complete. Not written yet.'],
]

export default async function HubStrategyPage({
  params,
}: {
  params: Promise<{ orgSlug: string; strategySlug: string }>
}) {
  const { orgSlug, strategySlug } = await params
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const { data: s } = await supabase
    .from('hub_strategies')
    .select('*')
    .eq('org_id', hub.orgId)
    .eq('slug', strategySlug)
    .maybeSingle()
  if (!s) notFound()

  const figures = await homeFigures(supabase, hub.orgId, hub.fiscalYearStart)
  const [committed, giftsRes, tasksRes] = await Promise.all([
    committedByStrategy(supabase, hub.orgId, figures.fiscalYear),
    supabase
      .from('hub_gifts')
      .select('id, amount_cents, gift_date, kind, designation, donor_id, hub_donors(household)')
      .eq('org_id', hub.orgId)
      .eq('strategy_id', s.id)
      .order('gift_date', { ascending: false }),
    supabase
      .from('hub_tasks')
      .select('id, title, why, owner, due_date')
      .eq('org_id', hub.orgId)
      .eq('strategy_id', s.id)
      .is('done_at', null)
      .order('due_date', { ascending: true, nullsFirst: false }),
  ])
  const gifts = giftsRes.data ?? []
  const tasks = tasksRes.data ?? []
  const c = committed.get(s.id) ?? 0

  return (
    <div style={{ maxWidth: 880 }}>
      <Link href={`/${orgSlug}/plan`} style={{ ...label, color: 'var(--hub-gold-ink)', textDecoration: 'none' }}>
        · Back to the plan
      </Link>
      <h1
        style={{
          fontFamily: 'var(--hub-font-display)',
          fontSize: 34,
          lineHeight: 1.05,
          textTransform: 'uppercase',
          margin: '12px 0 0',
          fontWeight: 400,
        }}
      >
        {s.name}
      </h1>
      <div style={{ ...label, marginTop: 8 }}>
        {s.owner ?? 'owner unassigned'}
        {s.hours_per_week !== null
          ? ` · ${Number(s.hours_per_week)} hrs/week${s.hours_trust ? ` · ${s.hours_trust}` : ''}`
          : ' · hours not settled'}
      </div>
      <div style={{ marginTop: 12, fontFamily: 'var(--hub-font-detail)', fontSize: 16 }}>
        {s.goal_cents !== null ? (
          <>
            {hubMoney(Number(s.goal_cents))}
            {s.goal_trust ? (
              <span style={{ color: 'var(--hub-stone-ink)', fontSize: 12 }}> · {s.goal_trust}</span>
            ) : null}
            <span style={{ color: 'var(--hub-stone-ink)' }}> · {hubMoney(c)} committed this year</span>
          </>
        ) : (
          <Tag tone="terracotta">no goal yet</Tag>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          marginTop: 24,
        }}
      >
        {METHOD_FIELDS.map(([key, title, gap]) => (
          <div
            key={key}
            style={{
              border: '1px solid var(--hub-line-on-paper)',
              background: 'var(--hub-paper-raised)',
              padding: 14,
            }}
          >
            <div style={{ ...label, color: 'var(--hub-gold-ink)' }}>{title}</div>
            {s[key] ? (
              <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 6 }}>{s[key]}</div>
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 6, color: 'var(--hub-terracotta)' }}>
                {gap}
              </div>
            )}
          </div>
        ))}
      </div>

      <ContentBlocks orgId={hub.orgId} section="strategy" strategyId={s.id} />

      {gifts.length > 0 ? (
        <section style={{ marginTop: 34 }}>
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
            Committed through this strategy
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <tbody>
              {gifts.map((g) => (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                  <td style={{ padding: '8px 8px 8px 0', fontSize: 14, fontWeight: 600 }}>
                    <Link
                      href={`/${orgSlug}/people/${g.donor_id}`}
                      style={{ color: 'var(--hub-acid-black)', textDecoration: 'none' }}
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {((g.hub_donors as any)?.household as string) ?? 'household'}
                    </Link>
                  </td>
                  <td style={{ padding: '8px', fontFamily: 'var(--hub-font-detail)', fontSize: 13 }}>
                    {hubMoney(Number(g.amount_cents))}
                  </td>
                  <td style={{ padding: '8px 0', fontSize: 13, color: 'var(--hub-stone-ink)' }}>
                    {g.kind === 'pledged' ? 'promised' : 'cash in hand'}
                    {g.gift_date ? ` · ${g.gift_date}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {tasks.length > 0 ? (
        <section style={{ marginTop: 34 }}>
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
            Open moves
          </h2>
          {tasks.map((t) => (
            <div key={t.id} style={{ borderBottom: '1px solid var(--hub-line-on-paper)', padding: '8px 0' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</div>
              {t.why ? <div style={{ fontSize: 13, marginTop: 2 }}>{t.why}</div> : null}
              <div style={{ ...label, marginTop: 4 }}>
                {[t.due_date, t.owner].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}

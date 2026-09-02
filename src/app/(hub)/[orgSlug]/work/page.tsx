import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import SectionTitle from '@/components/hub/SectionTitle'
import Card from '@/components/hub/Card'
import Tag from '@/components/hub/Tag'

/**
 * WORK: can we actually do this. Hours available against hours
 * planned at the top, tasks grouped by owner beneath, and blockers at
 * the bottom: not a list of documents, a list of things stopping
 * other things. A plan that needs twelve hours from someone who has
 * seven does not fail for lack of effort.
 */
export default async function HubWorkPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const [capacityRes, strategiesRes, tasksRes, collateralRes] = await Promise.all([
    supabase
      .from('hub_capacity')
      .select('id, person, hours_per_week, trust, note')
      .eq('org_id', hub.orgId)
      .order('sort'),
    supabase
      .from('hub_strategies')
      .select('name, hours_per_week, hours_trust')
      .eq('org_id', hub.orgId)
      .order('sort'),
    supabase
      .from('hub_tasks')
      .select('id, title, why, owner, due_date')
      .eq('org_id', hub.orgId)
      .is('done_at', null)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('hub_collateral')
      .select('id, name, owner, due_date, status, blocks')
      .eq('org_id', hub.orgId)
      .order('sort'),
  ])

  const capacity = capacityRes.data ?? []
  const strategies = strategiesRes.data ?? []
  const tasks = tasksRes.data ?? []
  const collateral = collateralRes.data ?? []

  const available = capacity.reduce((s, c) => s + (Number(c.hours_per_week) || 0), 0)
  const planned = strategies.reduce((s, x) => s + (Number(x.hours_per_week) || 0), 0)
  const unsettled = strategies.filter((s) => s.hours_per_week === null)

  return (
    <div>
      <SectionTitle label="Work" title="Can we actually do this" />

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
          This week
        </h2>
        {capacity.length === 0 ? (
          <p style={{ fontSize: 15, color: 'var(--hub-stone-ink)' }}>No hours are recorded yet.</p>
        ) : (
          <div style={{ marginTop: 12 }}>
            {capacity.map((c) => (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--hub-line-on-paper)',
                  padding: '8px 0',
                  fontSize: 14,
                }}
              >
                <span style={{ fontWeight: 600 }}>{c.person}</span>
                <span style={{ fontFamily: 'var(--hub-font-detail)', fontSize: 12 }}>
                  {c.hours_per_week !== null
                    ? `${Number(c.hours_per_week)} hrs/week${c.trust ? ` · ${c.trust}` : ''}`
                    : 'hours not settled'}
                </span>
              </div>
            ))}
            <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 14, maxWidth: 640 }}>
              {available} hours available. The strategies with settled hours ask for {planned} of
              them
              {unsettled.length > 0
                ? `, and ${unsettled.map((s) => s.name).join(' and ')} ${
                    unsettled.length === 1 ? "hasn't" : "haven't"
                  } put a number on theirs yet, so the real total is higher than this.`
                : '.'}
              {available > 0 && planned > available
                ? ' That does not fit. Something gets cut or handed off, on purpose, before it slips on its own.'
                : ''}
            </p>
          </div>
        )}
      </section>

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
          Tasks
        </h2>
        {tasks.length === 0 ? (
          <p style={{ fontSize: 15, color: 'var(--hub-stone-ink)' }}>Nothing open right now.</p>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              style={{ borderBottom: '1px solid var(--hub-line-on-paper)', padding: '10px 0' }}
            >
              <div style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</div>
              {t.why ? <div style={{ fontSize: 14, marginTop: 4 }}>{t.why}</div> : null}
              <div
                style={{
                  fontFamily: 'var(--hub-font-detail)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--hub-stone-ink)',
                  marginTop: 6,
                }}
              >
                {[t.due_date, t.owner].filter(Boolean).join(' · ')}
              </div>
            </div>
          ))
        )}
      </section>

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
          Blockers
        </h2>
        {collateral.length === 0 ? (
          <p style={{ fontSize: 15, color: 'var(--hub-stone-ink)' }}>Nothing is blocking work.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
              marginTop: 14,
            }}
          >
            {collateral.map((c) => (
              <Card key={c.id}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                  <Tag
                    tone={
                      c.status === 'exists'
                        ? 'gold'
                        : c.status === 'in_progress'
                          ? 'muted'
                          : 'terracotta'
                    }
                  >
                    {c.status === 'in_progress' ? 'in progress' : c.status}
                  </Tag>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--hub-font-detail)',
                    fontSize: 10,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: 'var(--hub-stone-ink)',
                    marginTop: 8,
                  }}
                >
                  {[c.owner ?? 'owner unassigned', c.due_date ? `due ${c.due_date}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {c.blocks ? (
                  <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>
                    Blocks {c.blocks}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

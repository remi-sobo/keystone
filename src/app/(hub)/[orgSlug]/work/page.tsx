import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import SectionTitle from '@/components/hub/SectionTitle'
import Card from '@/components/hub/Card'
import Tag from '@/components/hub/Tag'
import ContentBlocks from '@/components/hub/ContentBlocks'
import { addTask, doneTask, reopenTask } from './actions'

/**
 * WORK: can we actually do this. This week at the top (hours
 * available against hours planned, by person, with a plain sentence
 * when it does not fit), tasks beneath grouped by owner with the
 * plan's own prose deadlines rendered verbatim, the calendar as a
 * view of the same rhythm, and blockers at the bottom: not a list of
 * documents, a list of things stopping other things.
 */

const label = {
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 10,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--hub-stone-ink)',
}
const h2 = {
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 11,
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  color: 'var(--hub-gold-ink)',
  borderBottom: '3px solid var(--hub-gold)',
  paddingBottom: 8,
}
const input = {
  padding: '10px 12px',
  background: 'var(--hub-paper-raised)',
  border: '1px solid var(--hub-line-on-paper)',
  fontSize: 14,
  color: 'var(--hub-acid-black)',
  width: '100%',
}
const goldButton = {
  padding: '10px 16px',
  background: 'var(--hub-gold)',
  color: 'var(--hub-acid-black)',
  border: 'none',
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 11,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  cursor: 'pointer',
}
const quietButton = {
  background: 'transparent',
  border: '1px solid var(--hub-line-on-paper)',
  color: 'var(--hub-forest-ink)',
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase' as const,
  padding: '6px 10px',
  cursor: 'pointer',
}

interface Task {
  id: string
  title: string
  why: string | null
  owner: string | null
  area: string | null
  due_date: string | null
  due_label: string | null
  done_at: string | null
}

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
      .select('id, name, hours_per_week, hours_trust')
      .eq('org_id', hub.orgId)
      .order('sort'),
    supabase
      .from('hub_tasks')
      .select('id, title, why, owner, area, due_date, due_label, done_at')
      .eq('org_id', hub.orgId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('hub_collateral')
      .select('id, name, owner, due_date, status, blocks')
      .eq('org_id', hub.orgId)
      .order('sort'),
  ])

  const capacity = capacityRes.data ?? []
  const strategies = strategiesRes.data ?? []
  const allTasks = (tasksRes.data ?? []) as Task[]
  const open = allTasks.filter((t) => !t.done_at)
  const done = allTasks.filter((t) => t.done_at)
  const collateral = collateralRes.data ?? []

  const available = capacity.reduce((s, c) => s + (Number(c.hours_per_week) || 0), 0)
  const planned = strategies.reduce((s, x) => s + (Number(x.hours_per_week) || 0), 0)
  const unsettled = strategies.filter((s) => s.hours_per_week === null)

  const owners = [...new Set(open.map((t) => t.owner ?? 'Unassigned'))].sort((a, b) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)
  )
  const when = (t: Task) => [t.due_date ?? t.due_label, t.area].filter(Boolean).join(' · ')

  const addAction = addTask.bind(null, orgSlug)
  const doneAction = doneTask.bind(null, orgSlug)
  const reopenAction = reopenTask.bind(null, orgSlug)

  return (
    <div>
      <SectionTitle label="Work" title="Can we actually do this" />

      <section>
        <h2 style={h2}>This week</h2>
        {capacity.length === 0 ? (
          <p style={{ fontSize: 15, color: 'var(--hub-stone-ink)' }}>No hours are recorded yet.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 44, marginTop: 12 }}>
            <div>
              <div style={label}>Hours available</div>
              {capacity.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--hub-line-on-paper)',
                    padding: '8px 0',
                    fontSize: 14,
                    gap: 12,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{c.person}</span>
                  <span style={{ fontFamily: 'var(--hub-font-detail)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {c.hours_per_week !== null
                      ? `${Number(c.hours_per_week)} hrs/week${c.trust ? ` · ${c.trust}` : ''}`
                      : 'not settled'}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div style={label}>Hours the strategies ask for</div>
              {strategies.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid var(--hub-line-on-paper)',
                    padding: '8px 0',
                    fontSize: 14,
                    gap: 12,
                  }}
                >
                  <span>{s.name}</span>
                  <span style={{ fontFamily: 'var(--hub-font-detail)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {s.hours_per_week !== null
                      ? `${Number(s.hours_per_week)} hrs/week${s.hours_trust ? ` · ${s.hours_trust}` : ''}`
                      : 'not settled'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {capacity.length > 0 ? (
          <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 14, maxWidth: 680 }}>
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
        ) : null}
      </section>

      <section style={{ marginTop: 34 }}>
        <h2 style={h2}>Tasks, by owner</h2>
        {open.length === 0 ? (
          <p style={{ fontSize: 15, color: 'var(--hub-stone-ink)' }}>Nothing open right now.</p>
        ) : (
          owners.map((owner) => (
            <div key={owner} style={{ marginTop: 18 }}>
              <div style={{ ...label, color: 'var(--hub-gold-ink)', borderBottom: '1px solid var(--hub-line-on-paper)', paddingBottom: 6 }}>
                {owner} · {open.filter((t) => (t.owner ?? 'Unassigned') === owner).length}
              </div>
              {open
                .filter((t) => (t.owner ?? 'Unassigned') === owner)
                .map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 12,
                      borderBottom: '1px solid var(--hub-line-on-paper)',
                      padding: '10px 0',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{t.title}</div>
                      {t.why ? (
                        <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 2, maxWidth: 640 }}>{t.why}</div>
                      ) : null}
                      {when(t) ? <div style={{ ...label, marginTop: 4 }}>{when(t)}</div> : null}
                    </div>
                    <form action={doneAction}>
                      <input type="hidden" name="task_id" value={t.id} />
                      <button type="submit" style={quietButton}>
                        Done
                      </button>
                    </form>
                  </div>
                ))}
            </div>
          ))
        )}

        <details style={{ marginTop: 20, maxWidth: 560 }}>
          <summary style={{ ...label, color: 'var(--hub-gold-ink)', cursor: 'pointer' }}>
            Add a task
          </summary>
          <form action={addAction} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <div>
              <label htmlFor="task-title" style={label}>
                The task
              </label>
              <input id="task-title" name="title" required maxLength={300} style={input} />
            </div>
            <div>
              <label htmlFor="task-why" style={label}>
                Why it matters
              </label>
              <input id="task-why" name="why" maxLength={1000} style={input} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label htmlFor="task-owner" style={label}>
                  Who owns it
                </label>
                <input id="task-owner" name="owner" maxLength={120} style={input} />
              </div>
              <div>
                <label htmlFor="task-due" style={label}>
                  Due, if it has a date
                </label>
                <input id="task-due" name="due_date" type="date" style={input} />
              </div>
              <div>
                <label htmlFor="task-strategy" style={label}>
                  Strategy, if one fits
                </label>
                <select id="task-strategy" name="strategy_id" style={input} defaultValue="">
                  <option value="">None</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" style={{ ...goldButton, justifySelf: 'start' }}>
              Add it
            </button>
          </form>
        </details>

        {done.length > 0 ? (
          <details style={{ marginTop: 16 }}>
            <summary style={{ ...label, cursor: 'pointer' }}>Done · {done.length}</summary>
            {done.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  gap: 12,
                  borderBottom: '1px solid var(--hub-line-on-paper)',
                  padding: '8px 0',
                  color: 'var(--hub-stone-ink)',
                }}
              >
                <span style={{ fontSize: 14 }}>{t.title}</span>
                <form action={reopenAction}>
                  <input type="hidden" name="task_id" value={t.id} />
                  <button type="submit" style={{ ...quietButton, color: 'var(--hub-stone-ink)' }}>
                    Reopen
                  </button>
                </form>
              </div>
            ))}
          </details>
        ) : null}
      </section>

      <ContentBlocks orgId={hub.orgId} section="work-calendar" heading="The calendar" />

      <section style={{ marginTop: 34 }}>
        <h2 style={h2}>Blockers</h2>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                  <Tag
                    tone={
                      c.status === 'exists' ? 'gold' : c.status === 'in_progress' ? 'muted' : 'terracotta'
                    }
                  >
                    {c.status === 'in_progress' ? 'in progress' : c.status}
                  </Tag>
                </div>
                <div style={{ ...label, marginTop: 8 }}>
                  {[c.owner ?? 'owner unassigned', c.due_date ? `due ${c.due_date}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {c.blocks ? (
                  <div style={{ fontSize: 14, lineHeight: 1.55, marginTop: 8 }}>Blocks {c.blocks}</div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The plan's own words, read from hub_content_blocks so changing a
 * sentence is a row update, not a deploy. Three shapes from the
 * handoff plus the two heading registers: a paragraph, a four-column
 * table, and a row of stat cards. Renders nothing when a section has
 * no rows: an absent block is absent, never scaffolding.
 */

interface Block {
  id: string
  kind: 'headline' | 'lead' | 'paragraph' | 'table' | 'stat_row' | 'cards'
  payload: Record<string, unknown>
}

export default async function ContentBlocks({
  orgId,
  section,
  strategyId,
  heading,
}: {
  orgId: string
  section: string
  strategyId?: string
  heading?: string
}) {
  const supabase = await createServerSupabase()
  let query = supabase
    .from('hub_content_blocks')
    .select('id, kind, payload')
    .eq('org_id', orgId)
    .eq('section', section)
  query = strategyId ? query.eq('strategy_id', strategyId) : query.is('strategy_id', null)
  const { data } = await query.order('sort')

  const blocks = (data ?? []) as Block[]
  if (blocks.length === 0) return null

  return (
    <section style={{ marginTop: 34 }}>
      {heading ? (
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
          {heading}
        </h2>
      ) : null}
      {blocks.map((b) => (
        <BlockView key={b.id} block={b} />
      ))}
    </section>
  )
}

function BlockView({ block }: { block: Block }) {
  const p = block.payload
  if (block.kind === 'headline') {
    return (
      <h3
        style={{
          fontFamily: 'var(--hub-font-display)',
          fontSize: 26,
          textTransform: 'uppercase',
          lineHeight: 1.05,
          margin: '20px 0 0',
          fontWeight: 400,
        }}
      >
        {String(p.text ?? '')}
      </h3>
    )
  }
  if (block.kind === 'lead') {
    return (
      <p style={{ fontSize: 17, lineHeight: 1.6, marginTop: 14, maxWidth: 720 }}>
        {String(p.text ?? '')}
      </p>
    )
  }
  if (block.kind === 'paragraph') {
    return (
      <p style={{ fontSize: 15, lineHeight: 1.6, marginTop: 12, maxWidth: 720 }}>
        {String(p.text ?? '')}
      </p>
    )
  }
  if (block.kind === 'table') {
    const columns = (p.columns as string[] | undefined) ?? []
    const rows = (p.rows as string[][] | undefined) ?? []
    return (
      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {columns.length > 0 ? (
            <thead>
              <tr>
                {columns.map((c, i) => (
                  <th
                    key={i}
                    style={{
                      textAlign: 'left',
                      fontFamily: 'var(--hub-font-detail)',
                      fontSize: 10,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: 'var(--hub-gold-ink)',
                      padding: '8px 12px 8px 0',
                      borderBottom: '1px solid var(--hub-line-on-paper)',
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                {r.map((cell, j) => (
                  <td
                    key={j}
                    style={{ padding: '10px 12px 10px 0', fontSize: 14, lineHeight: 1.5 }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if (block.kind === 'cards') {
    const cards =
      (p.cards as { tag?: string; value?: string; title?: string; note?: string }[] | undefined) ??
      []
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginTop: 14,
        }}
      >
        {cards.map((c, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--hub-line-on-paper)',
              borderTop: '3px solid var(--hub-gold)',
              background: 'var(--hub-paper-raised)',
              padding: 14,
            }}
          >
            {c.tag ? (
              <div
                style={{
                  fontFamily: 'var(--hub-font-detail)',
                  fontSize: 10,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--hub-gold-ink)',
                }}
              >
                {c.tag}
              </div>
            ) : null}
            {c.value ? (
              <div style={{ fontFamily: 'var(--hub-font-detail)', fontSize: 22, marginTop: 6 }}>
                {c.value}
              </div>
            ) : null}
            {c.title ? <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{c.title}</div> : null}
            {c.note ? (
              <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>{c.note}</div>
            ) : null}
          </div>
        ))}
      </div>
    )
  }
  // stat_row: [{value, label, trust?}]
  const stats =
    (p.stats as { value: string; label: string; trust?: string }[] | undefined) ?? []
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 16,
        marginTop: 14,
      }}
    >
      {stats.map((s, i) => (
        <div
          key={i}
          style={{
            border: '1px solid var(--hub-line-on-paper)',
            background: 'var(--hub-paper-raised)',
            padding: 14,
          }}
        >
          <div style={{ fontFamily: 'var(--hub-font-detail)', fontSize: 20 }}>{s.value}</div>
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
            {s.label}
            {s.trust ? (
              <>
                {' '}
                <span style={{ color: 'var(--hub-gold-ink)' }}>·</span> {s.trust}
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { annualCost, homeFigures } from '@/lib/hubFigures'
import { hubMoney } from '@/lib/hubTheme'
import Stat from '@/components/hub/Stat'
import SectionTitle from '@/components/hub/SectionTitle'
import Card from '@/components/hub/Card'
import Tag from '@/components/hub/Tag'
import ContentBlocks from '@/components/hub/ContentBlocks'
import { confirmBudgetImport, dismissImport, uploadHubDocument } from '../uploads'

/**
 * MONEY: are we funded. Four figures at the top, then the cash
 * calendar (when money is needed against what is in the bank), with
 * everything else behind View budget details: committee and planning
 * material, not a Monday morning. Every figure computes from
 * hub_budget_lines rows the workbook parser wrote, each carrying its
 * trust level; a number that cannot be computed renders as a gap.
 */

interface Line {
  section: string
  line: string
  fiscal_year: number
  amount_cents: number | null
  trust: string
  note: string | null
  sort: number
}

const label = {
  fontFamily: 'var(--hub-font-detail)',
  fontSize: 11,
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: 'var(--hub-stone-ink)',
}
const mono = { fontFamily: 'var(--hub-font-detail)', fontSize: 14, fontVariantNumeric: 'tabular-nums' as const }

const sum = (lines: Line[]) => lines.reduce((s, l) => s + (l.amount_cents ?? 0), 0)

export default async function HubMoneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const { orgSlug } = await params
  const { state } = await searchParams
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const figures = await homeFigures(supabase, hub.orgId, hub.fiscalYearStart)
  const fy = figures.fiscalYear
  const [cost, linesRes, pendingRes] = await Promise.all([
    annualCost(supabase, hub.orgId, fy),
    supabase
      .from('hub_budget_lines')
      .select('section, line, fiscal_year, amount_cents, trust, note, sort')
      .eq('org_id', hub.orgId)
      .order('sort'),
    supabase
      .from('hub_documents')
      .select('id, filename, parse_result')
      .eq('org_id', hub.orgId)
      .eq('kind', 'budget')
      .is('parsed_at', null)
      .order('created_at', { ascending: false }),
  ])

  const lines = (linesRes.data ?? []) as Line[]
  const by = (section: string, year: number | null = fy) =>
    lines.filter((l) => l.section === section && (year === null || l.fiscal_year === year))
  const pending = (pendingRes.data ?? []).filter(
    (d) => (d.parse_result as { status?: string } | null)?.status === 'preview'
  )

  const cash = by('cash', null)[0] ?? null
  const cashOut = by('cash_out', null)
  const cumulative = cashOut.reduce<{ month: string; cents: number }[]>((acc, m) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cents : 0
    acc.push({ month: m.line, cents: prev + (m.amount_cents ?? 0) })
    return acc
  }, [])
  const maxOut = cumulative.length > 0 ? cumulative[cumulative.length - 1].cents : 0

  // The gross-up, computed line by line from the parsed sections.
  const expenses = lines.filter((l) => l.section.startsWith('expenses:') && l.fiscal_year === fy)
  const rentalAndTransfers = by('income').filter((l) => !/contribution|service charge/i.test(l.line))
  const grossContrib = by('to_raise').find((l) => /contributions/i.test(l.line)) ?? null
  const capitalToFund = by('to_raise').find((l) => /capital/i.test(l.line)) ?? null
  const netNeeded = cost.cents !== null ? cost.cents - sum(rentalAndTransfers) : null
  const serviceCharge =
    grossContrib?.amount_cents != null && netNeeded !== null
      ? Number(grossContrib.amount_cents) - netNeeded
      : null

  const functional = by('functional')
  const functionalTotal = sum(functional)
  const menuFull = by('gift_buys_full')
  const menuDirect = by('gift_buys_direct')
  const directByLine = new Map(menuDirect.map((l) => [l.line, l]))
  const menuLines = [
    ...menuFull.map((l) => l.line),
    ...menuDirect.filter((l) => !menuFull.some((f) => f.line === l.line)).map((l) => l.line),
  ]
  const fys = [...new Set(lines.filter((l) => l.section === 'to_raise').map((l) => l.fiscal_year))].sort()

  const uploadAction = uploadHubDocument.bind(null, orgSlug)
  const confirmAction = confirmBudgetImport.bind(null, orgSlug)
  const dismissAction = dismissImport.bind(null, orgSlug)

  return (
    <div>
      <SectionTitle label="Money" title="Are we funded" />

      {state === 'imported' ? (
        <p style={{ fontSize: 14, color: 'var(--hub-forest-ink)', marginBottom: 12 }}>
          The budget is in. Every figure on this page now comes from that workbook.
        </p>
      ) : null}
      {state === 'error' ? (
        <p style={{ fontSize: 14, color: 'var(--hub-terracotta)', marginBottom: 12 }}>
          That didn&apos;t work. The file is safe; try again in a minute.
        </p>
      ) : null}

      {pending.map((doc) => {
        const r = doc.parse_result as {
          lines?: number
          fiscalYears?: number[]
          firstYearCost?: string
          firstYearToRaise?: string
          warnings?: string[]
        }
        return (
          <div key={doc.id} style={{ marginBottom: 16 }}>
            <Card rule>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{doc.filename} is ready to bring in</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
                {r.lines ?? 0} budget lines across{' '}
                {(r.fiscalYears ?? []).map((y) => `FY${y}`).join(', ')}. First year:{' '}
                {r.firstYearCost} to run the ministry, {r.firstYearToRaise} to raise. Bringing it
                in replaces the previous budget figures and nothing else.
              </p>
              {r.warnings && r.warnings.length > 0 ? (
                <ul style={{ fontSize: 13, color: 'var(--hub-terracotta)', paddingLeft: 18 }}>
                  {r.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : null}
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <form action={confirmAction}>
                  <input type="hidden" name="document_id" value={doc.id} />
                  <button
                    type="submit"
                    style={{
                      padding: '10px 16px',
                      background: 'var(--hub-gold)',
                      color: 'var(--hub-acid-black)',
                      border: 'none',
                      fontFamily: 'var(--hub-font-detail)',
                      fontSize: 11,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    Bring it in
                  </button>
                </form>
                <form action={dismissAction}>
                  <input type="hidden" name="document_id" value={doc.id} />
                  <input type="hidden" name="back" value="money" />
                  <button
                    type="submit"
                    style={{
                      padding: '10px 16px',
                      background: 'transparent',
                      color: 'var(--hub-stone-ink)',
                      border: '1px solid var(--hub-line-on-paper)',
                      fontFamily: 'var(--hub-font-detail)',
                      fontSize: 11,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    Not now
                  </button>
                </form>
              </div>
            </Card>
          </div>
        )
      })}

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
          label="What the year costs"
          value={cost.cents !== null ? hubMoney(cost.cents) : null}
          trust={cost.trust}
          gap="The budget workbook isn't loaded yet. Upload it below and every number here comes from it."
        />
        <Stat
          label="The goal"
          value={figures.goal.cents !== null ? hubMoney(figures.goal.cents) : null}
          trust={figures.goal.trust}
          gap="Costs, minus the rent and transfers, grossed up for the service charge, plus the capital need."
        />
        <Stat
          label="Raised and committed"
          value={figures.committed.cents !== null ? hubMoney(figures.committed.cents) : null}
          trust={figures.committed.trust}
          gap="No gifts or pledges are recorded yet."
        />
        <Stat
          label="The gap"
          value={figures.gap.cents !== null ? hubMoney(figures.gap.cents) : null}
          trust={figures.gap.trust}
          gap="Computed once the goal is in."
        />
      </div>

      {cumulative.length > 0 ? (
        <section style={{ marginTop: 34 }}>
          <h2 className="hub-h2">When the money is needed</h2>
          <p style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 640 }}>
            Spending piles up month by month; the gold line is what&apos;s in the bank
            {cash?.amount_cents != null ? ` (${hubMoney(Number(cash.amount_cents))}, ${cash.trust})` : ''}.
            Every month past it is money that has to have arrived by then. This is why the
            November brunch matters.
          </p>
          <div
            aria-hidden="true"
            style={{ position: 'relative', height: 180, marginTop: 16, maxWidth: 720 }}
          >
            {cash?.amount_cents != null && maxOut > 0 ? (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: `${(Number(cash.amount_cents) / maxOut) * 160}px`,
                  borderTop: '2px solid var(--hub-gold)',
                }}
              />
            ) : null}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 160 }}>
              {cumulative.map((m) => {
                const past = cash?.amount_cents != null && m.cents > Number(cash.amount_cents)
                return (
                  <div
                    key={m.month}
                    title={`${m.month}: ${hubMoney(m.cents)} out by month end`}
                    style={{
                      flex: 1,
                      height: `${maxOut > 0 ? Math.max(2, (m.cents / maxOut) * 160) : 2}px`,
                      background: past ? 'var(--hub-terracotta)' : 'var(--hub-acid-black)',
                    }}
                  />
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {cumulative.map((m) => (
                <div key={m.month} style={{ ...label, flex: 1, textAlign: 'center' as const, letterSpacing: '0.08em' }}>
                  {m.month}
                </div>
              ))}
            </div>
          </div>
          <details style={{ marginTop: 10, maxWidth: 720 }}>
            <summary style={{ ...label, color: 'var(--hub-gold-ink)', cursor: 'pointer' }}>
              The same months as a table
            </summary>
            <table style={{ borderCollapse: 'collapse', marginTop: 8 }}>
              <tbody>
                {cumulative.map((m, i) => (
                  <tr key={m.month} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                    <td style={{ ...mono, padding: '6px 16px 6px 0' }}>{m.month}</td>
                    <td style={{ ...mono, padding: '6px 16px 6px 0' }}>
                      {hubMoney(cashOut[i]?.amount_cents ?? 0)} out
                    </td>
                    <td style={{ ...mono, padding: '6px 0' }}>{hubMoney(m.cents)} cumulative</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--hub-stone-ink)', maxWidth: '64ch', marginTop: 12 }}>
            These are the workbook&apos;s own months. Its timing tab was built on August through
            July, before the fiscal year settled at October through September, so read the shape,
            not the calendar positions.
          </p>
        </section>
      ) : (
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)', marginTop: 24, maxWidth: 640 }}>
          The cash calendar, the budget detail, and what a gift pays for all land here once the
          budget workbook is in, every line carrying how well it is known.
        </p>
      )}

      {lines.length > 0 ? (
        <details style={{ marginTop: 34 }}>
          <summary
            className="hub-h2"
            style={{ cursor: 'pointer', display: 'inline-block' }}
          >
            View budget details
          </summary>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 44, marginTop: 20 }}>
            <section>
              <h3 style={label}>How the cost becomes the goal</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                <tbody>
                  {[
                    ['Cost of running the ministry for the year', cost.cents],
                    ['Minus house rent and transfers in', -sum(rentalAndTransfers)],
                    ['What gifts have to cover', netNeeded],
                    ['Plus the service charge off every gift', serviceCharge],
                    ['Plus the capital work not yet funded', capitalToFund?.amount_cents ?? null],
                    ['Total to raise', figures.goal.cents],
                  ].map(([l, v], i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                      <td style={{ padding: '8px 8px 8px 0', fontSize: 14, fontWeight: i === 5 ? 700 : 400 }}>
                        {l as string}
                      </td>
                      <td style={{ ...mono, padding: '8px 0', textAlign: 'right' as const, fontWeight: i === 5 ? 700 : 400 }}>
                        {v === null ? 'not settled' : hubMoney(Number(v))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ ...label, marginTop: 24 }}>Where the spending goes</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                <tbody>
                  {expenses.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                      <td style={{ padding: '8px 8px 8px 0', fontSize: 14 }}>
                        {l.line}
                        {l.trust === 'placeholder' ? (
                          <>
                            {' '}
                            <Tag tone="terracotta">placeholder</Tag>
                          </>
                        ) : null}
                        {l.note ? (
                          <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--hub-stone-ink)', marginTop: 4 }}>{l.note}</div>
                        ) : null}
                      </td>
                      <td style={{ ...mono, padding: '8px 0', textAlign: 'right' as const, whiteSpace: 'nowrap' }}>
                        {l.amount_cents === null ? 'not settled' : hubMoney(Number(l.amount_cents))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              {functional.length > 0 && functionalTotal > 0 ? (
                <>
                  <h3 style={label}>The same money, by what it was for</h3>
                  <div style={{ display: 'flex', height: 18, marginTop: 8, border: '1px solid var(--hub-line-on-paper)' }}>
                    {functional.map((f, i) => (
                      <div
                        key={f.line}
                        title={`${f.line}: ${hubMoney(Number(f.amount_cents ?? 0))}`}
                        style={{
                          width: `${((f.amount_cents ?? 0) / functionalTotal) * 100}%`,
                          background:
                            i === 0 ? 'var(--hub-forest)' : i === 1 ? 'var(--hub-stone)' : 'var(--hub-gold)',
                          borderRight: i < functional.length - 1 ? '2px solid var(--hub-paper)' : 'none',
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                    {functional.map((f) => (
                      <span key={f.line} style={{ ...label, letterSpacing: '0.12em' }}>
                        {f.line} · {functionalTotal > 0 ? Math.round(((f.amount_cents ?? 0) / functionalTotal) * 100) : 0}%
                      </span>
                    ))}
                  </div>
                </>
              ) : null}

              {fys.length > 1 ? (
                <>
                  <h3 style={{ ...label, marginTop: 24 }}>The three-year arc</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                    <tbody>
                      {fys.map((y) => {
                        const raise = sum(by('to_raise', y))
                        return (
                          <tr key={y} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                            <td style={{ ...mono, padding: '8px 8px 8px 0' }}>FY{y}</td>
                            <td style={{ ...mono, padding: '8px 0', textAlign: 'right' as const }}>
                              {hubMoney(raise)} to raise
                              {y !== fy ? <span style={{ color: 'var(--hub-stone-ink)' }}> · estimated</span> : null}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </>
              ) : null}

              {menuLines.length > 0 ? (
                <>
                  <h3 style={{ ...label, marginTop: 24 }}>What a gift pays for</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
                    <thead>
                      <tr>
                        <th style={{ ...label, textAlign: 'left' as const, padding: '4px 8px 4px 0' }}> </th>
                        <th style={{ ...label, textAlign: 'right' as const, padding: '4px 8px' }}>Full cost</th>
                        <th style={{ ...label, textAlign: 'right' as const, padding: '4px 0' }}>Direct cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {menuLines.map((name) => {
                        const full = menuFull.find((l) => l.line === name)
                        const direct = directByLine.get(name)
                        return (
                          <tr key={name} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                            <td style={{ padding: '8px 8px 8px 0', fontSize: 14 }}>
                              {name}
                              {(full?.note ?? direct?.note) ? (
                                <div style={{ fontSize: 12, color: 'var(--hub-stone-ink)', marginTop: 2 }}>
                                  {full?.note ?? direct?.note}
                                </div>
                              ) : null}
                            </td>
                            <td style={{ ...mono, padding: '8px', textAlign: 'right' as const }}>
                              {full?.amount_cents != null ? hubMoney(Number(full.amount_cents)) : ''}
                            </td>
                            <td style={{ ...mono, padding: '8px 0', textAlign: 'right' as const }}>
                              {direct?.amount_cents != null ? hubMoney(Number(direct.amount_cents)) : ''}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <p style={{ fontSize: 12, color: 'var(--hub-stone-ink)', marginTop: 6 }}>
                    Full cost is the honest number and direct cost is the accessible one.
                  </p>
                </>
              ) : null}
            </section>
          </div>

          <ContentBlocks orgId={hub.orgId} section="money-unsettled" heading="The unsettled numbers" />
        </details>
      ) : null}

      <div style={{ marginTop: 34, maxWidth: 420 }}>
        <form action={uploadAction}>
          <input type="hidden" name="back" value="money" />
          <label htmlFor="money-file" style={label}>
            Upload the budget workbook
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input id="money-file" type="file" name="file" required style={{ fontSize: 13 }} />
            <button
              type="submit"
              style={{
                padding: '8px 14px',
                background: 'var(--hub-acid-black)',
                color: 'var(--hub-bone)',
                border: 'none',
                fontFamily: 'var(--hub-font-detail)',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

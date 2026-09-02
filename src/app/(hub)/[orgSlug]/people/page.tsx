import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { hubMoney } from '@/lib/hubTheme'
import SectionTitle from '@/components/hub/SectionTitle'
import Card from '@/components/hub/Card'
import Tag from '@/components/hub/Tag'
import { addHousehold } from './actions'
import ContentBlocks from '@/components/hub/ContentBlocks'
import { confirmYlImport, dismissImport, uploadHubDocument } from '../uploads'

/**
 * PEOPLE: who are we moving. One list, search then filters; a row is
 * the household, their relationship to the ministry, their last gift,
 * and the next move. The upload box speaks plainly ("Upload the
 * latest Young Life report") and a recognized report shows its diff
 * and waits for a yes before anything changes.
 */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'donors', label: 'Current donors' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'follow-up', label: 'Needs follow-up' },
  { key: 'dnc', label: 'Do not contact' },
] as const

export default async function HubPeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ q?: string; filter?: string; state?: string }>
}) {
  const { orgSlug } = await params
  const { q = '', filter = 'all', state } = await searchParams
  const hub = await hubContext(orgSlug)
  if (!hub) return null
  const supabase = await createServerSupabase()

  const [donorsRes, tasksRes, pendingRes] = await Promise.all([
    supabase
      .from('hub_donors')
      .select(
        'id, household, greeting, status, do_not_contact, receives_appeals, last_gift_date, last_gift_cents, insights_category'
      )
      .eq('org_id', hub.orgId)
      .order('household'),
    supabase
      .from('hub_tasks')
      .select('donor_id, title, due_date')
      .eq('org_id', hub.orgId)
      .is('done_at', null)
      .not('donor_id', 'is', null),
    supabase
      .from('hub_documents')
      .select('id, filename, parse_result, parse_error, created_at')
      .eq('org_id', hub.orgId)
      .eq('kind', 'yl_export')
      .is('parsed_at', null)
      .order('created_at', { ascending: false }),
  ])

  const allDonors = donorsRes.data ?? []
  const openTaskByDonor = new Map<string, { title: string; due_date: string | null }>()
  for (const t of tasksRes.data ?? []) {
    if (t.donor_id && !openTaskByDonor.has(t.donor_id)) {
      openTaskByDonor.set(t.donor_id, { title: t.title, due_date: t.due_date })
    }
  }
  const pending = (pendingRes.data ?? []).filter(
    (d) => (d.parse_result as { status?: string } | null)?.status === 'preview'
  )

  const needle = q.trim().toLowerCase()
  const donors = allDonors.filter((d) => {
    if (needle && !`${d.household} ${d.greeting ?? ''}`.toLowerCase().includes(needle))
      return false
    if (filter === 'donors') return d.status === 'donor'
    if (filter === 'prospects') return d.status === 'prospect'
    if (filter === 'dnc') return d.do_not_contact
    if (filter === 'follow-up') {
      const t = openTaskByDonor.get(d.id)
      return !!t && !!t.due_date && t.due_date <= new Date().toISOString().slice(0, 10)
    }
    return true
  })

  const uploadAction = uploadHubDocument.bind(null, orgSlug)
  const confirmAction = confirmYlImport.bind(null, orgSlug)
  const dismissAction = dismissImport.bind(null, orgSlug)
  const addAction = addHousehold.bind(null, orgSlug)

  const label = {
    fontFamily: 'var(--hub-font-detail)',
    fontSize: 10,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    color: 'var(--hub-stone-ink)',
  }
  const input = {
    padding: '10px 12px',
    background: 'var(--hub-paper-raised)',
    border: '1px solid var(--hub-line-on-paper)',
    fontSize: 14,
    color: 'var(--hub-acid-black)',
    width: '100%',
  }

  return (
    <div>
      <SectionTitle label="People" title="Who are we moving" />

      {state === 'imported' ? (
        <p style={{ fontSize: 14, color: 'var(--hub-forest-ink)' }}>
          The report is in. Every change came from the file you just confirmed.
        </p>
      ) : null}
      {state === 'error' ? (
        <p style={{ fontSize: 14, color: 'var(--hub-terracotta)' }}>
          That didn&apos;t work. The file is safe; try again in a minute.
        </p>
      ) : null}

      {pending.map((doc) => {
        const r = doc.parse_result as {
          households?: number
          added?: string[]
          matched?: number
          gifts?: number
          warnings?: string[]
        }
        return (
          <div key={doc.id} style={{ margin: '16px 0' }}>
            <Card rule>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                {doc.filename} is ready to bring in
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 8 }}>
                {r.households ?? 0} households in the file: {r.added?.length ?? 0} new,{' '}
                {r.matched ?? 0} already here and getting refreshed, {r.gifts ?? 0} giving-history
                rows. Anything you logged by hand stays exactly as you entered it.
              </p>
              {r.added && r.added.length > 0 ? (
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--hub-stone-ink)' }}>
                  New: {r.added.join(', ')}
                </p>
              ) : null}
              {r.warnings && r.warnings.length > 0 ? (
                <ul style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--hub-terracotta)', paddingLeft: 18 }}>
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
        <form method="get" style={{ flex: '1 1 260px' }}>
          <label htmlFor="people-q" style={label}>
            Search
          </label>
          <input id="people-q" name="q" defaultValue={q} placeholder="A household name" style={input} />
          {filter !== 'all' ? <input type="hidden" name="filter" value={filter} /> : null}
        </form>
        <form action={uploadAction}>
          <label htmlFor="people-file" style={label}>
            Upload the latest Young Life report
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input id="people-file" type="file" name="file" required style={{ fontSize: 13 }} />
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

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/${orgSlug}/people?filter=${f.key}${needle ? `&q=${encodeURIComponent(q)}` : ''}`}
            style={{
              fontFamily: 'var(--hub-font-detail)',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              padding: '6px 10px',
              textDecoration: 'none',
              color: filter === f.key ? 'var(--hub-acid-black)' : 'var(--hub-stone-ink)',
              background: filter === f.key ? 'var(--hub-gold)' : 'transparent',
              border: '1px solid var(--hub-line-on-paper)',
            }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {donors.length === 0 ? (
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--hub-stone-ink)', marginTop: 24, maxWidth: 640 }}>
          {allDonors.length === 0
            ? 'No households are in yet. Upload the latest Young Life report above, or add someone by hand below.'
            : 'Nothing matches that search and filter.'}
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
          <tbody>
            {donors.map((d) => {
              const next = openTaskByDonor.get(d.id)
              return (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--hub-line-on-paper)' }}>
                  <td style={{ padding: '12px 8px 12px 0', fontSize: 15 }}>
                    <Link
                      href={`/${orgSlug}/people/${d.id}`}
                      style={{ color: 'var(--hub-acid-black)', fontWeight: 600, textDecoration: 'none' }}
                    >
                      {d.household}
                    </Link>
                    {d.greeting ? (
                      <span style={{ color: 'var(--hub-stone-ink)' }}> · {d.greeting}</span>
                    ) : null}{' '}
                    {d.do_not_contact ? <Tag tone="terracotta">do not contact</Tag> : null}
                    {!d.do_not_contact && !d.receives_appeals ? (
                      <Tag tone="muted">no appeals</Tag>
                    ) : null}
                  </td>
                  <td
                    style={{
                      padding: '12px 8px',
                      fontFamily: 'var(--hub-font-detail)',
                      fontSize: 11,
                      color: 'var(--hub-stone-ink)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.last_gift_cents
                      ? `last gift ${hubMoney(Number(d.last_gift_cents))}${d.last_gift_date ? ` · ${d.last_gift_date}` : ''}`
                      : 'no gift on record'}
                  </td>
                  <td style={{ padding: '12px 0', fontSize: 13, textAlign: 'right' }}>
                    {next ? (
                      <span>
                        <span style={{ color: 'var(--hub-gold-ink)' }}>·</span> {next.title}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--hub-stone-ink)' }}>no next move</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <details style={{ marginTop: 28, maxWidth: 520 }}>
        <summary
          style={{
            fontFamily: 'var(--hub-font-detail)',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--hub-gold-ink)',
            cursor: 'pointer',
          }}
        >
          Add a household by hand
        </summary>
        <form action={addAction} style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          <div>
            <label htmlFor="add-household" style={label}>
              Household
            </label>
            <input id="add-household" name="household" required maxLength={200} style={input} />
          </div>
          <div>
            <label htmlFor="add-greeting" style={label}>
              How they like to be greeted
            </label>
            <input id="add-greeting" name="greeting" maxLength={200} style={input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label htmlFor="add-email" style={label}>
                Email
              </label>
              <input id="add-email" name="email" type="email" style={input} />
            </div>
            <div>
              <label htmlFor="add-phone" style={label}>
                Phone
              </label>
              <input id="add-phone" name="phone" style={input} />
            </div>
          </div>
          <div>
            <label htmlFor="add-notes" style={label}>
              Notes
            </label>
            <textarea id="add-notes" name="notes" rows={2} style={input} />
          </div>
          <button
            type="submit"
            style={{
              justifySelf: 'start',
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
            Add them
          </button>
        </form>
      </details>

      <ContentBlocks orgId={hub.orgId} section="stewardship" heading="Stewardship" />
    </div>
  )
}

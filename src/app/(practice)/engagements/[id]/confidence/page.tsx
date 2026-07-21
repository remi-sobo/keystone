import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import {
  DOMAIN_LABELS,
  domainAverage,
  type ConfidenceResponseRow,
} from '@/lib/confidence'

/**
 * The operator trend view (practice side): per person, the fixed
 * instrument down the rows and the check-ins across the columns, a
 * domain-average row per section, latest open-text answers beneath.
 * Session reads under RLS (the practice reads all of its scope); the
 * CSV export for Kendra's impact reporting rides the sibling route.
 * Facts beside judgment: scores are shown as the person entered them,
 * never colored, ranked, or compared across people.
 */

export default async function ConfidencePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createServerSupabase()

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (!engagement) redirect('/engagements')

  const [{ data: items }, { data: checkins }, { data: participants }, { data: responses }] =
    await Promise.all([
      supabase
        .from('confidence_items')
        .select('id, domain, prompt, kind, sort_order')
        .eq('engagement_id', id)
        .eq('active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('confidence_checkins')
        .select('id, label, opens_at, due_at, sort_order')
        .eq('engagement_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('confidence_participants')
        .select('client_member_id, client_members(email)')
        .eq('engagement_id', id),
      supabase
        .from('confidence_responses')
        .select('checkin_id, item_id, client_member_id, score, text_answer, submitted_at')
        .eq('engagement_id', id),
    ])

  const scaleItems = (items ?? []).filter((i) => i.kind === 'scale')
  const textItems = (items ?? []).filter((i) => i.kind === 'text')
  const domains = [...new Set(scaleItems.map((i) => i.domain))]
  const today = new Date().toISOString().slice(0, 10)
  // Columns: check-ins that are open or already answered; the unopened
  // future stays out of the table's way.
  const answered = new Set((responses ?? []).map((r) => r.checkin_id))
  const columns = (checkins ?? []).filter((c) => c.opens_at <= today || answered.has(c.id))

  const byPerson = new Map<string, ConfidenceResponseRow[]>()
  for (const r of (responses ?? []) as ConfidenceResponseRow[]) {
    const list = byPerson.get(r.client_member_id) ?? []
    list.push(r)
    byPerson.set(r.client_member_id, list)
  }
  const cell = (rows: ConfidenceResponseRow[], checkinId: string, itemId: string) =>
    rows.find((r) => r.checkin_id === checkinId && r.item_id === itemId)

  const people = (participants ?? []).map((p) => ({
    memberId: p.client_member_id,
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    email: ((p.client_members as any)?.email as string) ?? 'unknown',
    rows: byPerson.get(p.client_member_id) ?? [],
  }))

  return (
    <RoomShell
      eyebrow={
        <Link href={`/engagements/${id}`} className="hover:text-ink">
          {engagement.title} /
        </Link>
      }
      title="Confidence"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="max-w-prose text-sm text-ink-dim">
          The same fixed instrument, taken at baseline and monthly. Each person watches their own
          line; so do we. Growth described, never graded.
        </p>
        <a
          href={`/engagements/${id}/confidence/export`}
          className="shrink-0 rounded-lg border border-sage px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper"
        >
          Export CSV
        </a>
      </div>

      {people.length === 0 ? (
        <p className="mt-8 text-sm text-ink-dim">
          No participants are named yet. The instrument seed marks the coachees.
        </p>
      ) : null}

      {people.map((person) => (
        <section key={person.memberId} aria-label={person.email} className="mt-10">
          <h2 className="font-display text-2xl font-medium text-ink">{person.email}</h2>
          {person.rows.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">Nothing submitted yet.</p>
          ) : (
            <>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-ink/15 py-2 pr-4 text-left font-normal text-ink-dim">
                        Item
                      </th>
                      {columns.map((c) => (
                        <th
                          key={c.id}
                          className="border-b border-ink/15 px-2 py-2 text-center font-normal text-ink-dim"
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {domains.map((domain) => (
                      <ConfidenceDomainRows
                        key={domain}
                        domain={domain}
                        items={scaleItems.filter((i) => i.domain === domain)}
                        columns={columns}
                        rows={person.rows}
                        cell={cell}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {textItems.length > 0 ? (
                <div className="mt-5 flex flex-col gap-4">
                  {textItems.map((item) => {
                    const answers = columns
                      .map((c) => ({
                        label: c.label,
                        row: cell(person.rows, c.id, item.id),
                      }))
                      .filter((a) => a.row?.text_answer)
                    if (answers.length === 0) return null
                    return (
                      <KeystoneCard key={item.id}>
                        <p className="eyebrow">{item.prompt}</p>
                        <div className="mt-2 flex flex-col gap-2">
                          {answers.map((a) => (
                            <p key={a.label} className="text-sm text-ink">
                              <span className="font-mono text-xs text-ink-dim">{a.label}</span>{' '}
                              {a.row!.text_answer}
                            </p>
                          ))}
                        </div>
                      </KeystoneCard>
                    )
                  })}
                </div>
              ) : null}
            </>
          )}
        </section>
      ))}
    </RoomShell>
  )
}

function ConfidenceDomainRows({
  domain,
  items,
  columns,
  rows,
  cell,
}: {
  domain: string
  items: Array<{ id: string; prompt: string }>
  columns: Array<{ id: string; label: string }>
  rows: ConfidenceResponseRow[]
  cell: (
    rows: ConfidenceResponseRow[],
    checkinId: string,
    itemId: string
  ) => ConfidenceResponseRow | undefined
}) {
  const itemIds = items.map((i) => i.id)
  return (
    <>
      <tr>
        <td colSpan={columns.length + 1} className="pt-4">
          <span className="eyebrow">{DOMAIN_LABELS[domain] ?? domain}</span>
        </td>
      </tr>
      {items.map((item) => (
        <tr key={item.id}>
          <td className="border-b border-ink/5 py-1.5 pr-4 text-ink">{item.prompt}</td>
          {columns.map((c) => {
            const r = cell(rows, c.id, item.id)
            return (
              <td
                key={c.id}
                className="border-b border-ink/5 px-2 py-1.5 text-center font-mono text-ink"
              >
                {r?.score ?? ''}
              </td>
            )
          })}
        </tr>
      ))}
      <tr>
        <td className="py-1.5 pr-4 text-ink-dim">Average</td>
        {columns.map((c) => {
          const avg = domainAverage(rows, c.id, itemIds)
          return (
            <td key={c.id} className="px-2 py-1.5 text-center font-mono text-ink-dim">
              {avg ?? ''}
            </td>
          )
        })}
      </tr>
    </>
  )
}

/**
 * lib/confidence.ts
 *
 * The pure half of the confidence check-in views: domain labels, the
 * domain average, and the CSV assembly for Kendra's impact reporting.
 * No client, no network; the pages and the export route pass rows in.
 */

export const DOMAIN_LABELS: Record<string, string> = {
  fundraising: 'Fundraising',
  departments: 'Across the organization',
  mindset: 'The executive seat',
  open: 'In your own words',
}

export interface ConfidenceResponseRow {
  checkin_id: string
  item_id: string
  client_member_id: string
  score: number | null
  text_answer: string | null
  submitted_at: string
}

/** Mean of the scores this person gave these items at this check-in,
 *  one decimal, or null when nothing is submitted. */
export function domainAverage(
  rows: ConfidenceResponseRow[],
  checkinId: string,
  itemIds: string[]
): string | null {
  const scores = rows
    .filter((r) => r.checkin_id === checkinId && itemIds.includes(r.item_id) && r.score !== null)
    .map((r) => r.score as number)
  if (scores.length === 0) return null
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  return mean.toFixed(1)
}

function csvField(value: string | number | null): string {
  if (value === null) return ''
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface ConfidenceCsvInput {
  items: Array<{ id: string; domain: string; prompt: string; kind: string; sort_order: number }>
  checkins: Array<{ id: string; label: string; opens_at: string; due_at: string }>
  participants: Array<{ client_member_id: string; email: string }>
  responses: ConfidenceResponseRow[]
}

/** Every response of the engagement, one row per answer, stable order:
 *  person, then check-in, then item. Pure. */
export function buildConfidenceCsv(input: ConfidenceCsvInput): string {
  const itemById = new Map(input.items.map((i) => [i.id, i]))
  const checkinById = new Map(input.checkins.map((c) => [c.id, c]))
  const emailByMember = new Map(input.participants.map((p) => [p.client_member_id, p.email]))

  const header = [
    'participant',
    'checkin',
    'checkin_due',
    'item_order',
    'domain',
    'item',
    'kind',
    'score',
    'text_answer',
    'submitted_at',
  ].join(',')

  const rows = [...input.responses]
    .map((r) => ({
      r,
      email: emailByMember.get(r.client_member_id) ?? 'unknown',
      item: itemById.get(r.item_id),
      checkin: checkinById.get(r.checkin_id),
    }))
    .sort(
      (a, b) =>
        a.email.localeCompare(b.email) ||
        (a.checkin?.opens_at ?? '').localeCompare(b.checkin?.opens_at ?? '') ||
        (a.item?.sort_order ?? 0) - (b.item?.sort_order ?? 0)
    )
    .map(({ r, email, item, checkin }) =>
      [
        csvField(email),
        csvField(checkin?.label ?? ''),
        csvField(checkin?.due_at ?? ''),
        csvField(item?.sort_order ?? ''),
        csvField(item?.domain ?? ''),
        csvField(item?.prompt ?? ''),
        csvField(item?.kind ?? ''),
        csvField(r.score),
        csvField(r.text_answer),
        csvField(r.submitted_at),
      ].join(',')
    )

  return [header, ...rows].join('\n') + '\n'
}

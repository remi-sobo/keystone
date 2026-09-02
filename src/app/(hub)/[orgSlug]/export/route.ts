import { NextResponse } from 'next/server'
import { zipSync, strToU8 } from 'fflate'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { enforceRateLimits, LIMITS } from '@/lib/rateLimit'

/**
 * The hub export (build prompt correction 5): one click, everything
 * for an org, a zip of CSVs plus research profiles as markdown.
 * Kendra's notes and next steps are her work product and she takes
 * them with her if the engagement ends; that is true from the first
 * week the hub holds anything real.
 *
 * Pure RLS: assembled on the caller's own session, so the archive
 * holds exactly what this member can already read and nothing about
 * any other org can enter it. Rate limited like the engagement
 * export; not audited, per the activity-view rule for client-side
 * actions.
 */

const TABLES: { name: string; columns: string[] }[] = [
  {
    name: 'donors',
    columns: [
      'household', 'greeting', 'status', 'city', 'state', 'zip', 'email', 'phone',
      'yl_account_number', 'lifetime_cents', 'gift_count', 'capacity_5yr_cents',
      'suggested_ask_cents', 'iwave_score', 'planned_giving_segment', 'insights_category',
      'first_gift_date', 'first_gift_cents', 'last_gift_date', 'last_gift_cents',
      'largest_gift_date', 'largest_gift_cents', 'business', 'business_title',
      'foundation_name', 'foundation_assets_cents', 'pub_foundation_name',
      'pub_foundation_assets_cents', 'do_not_contact', 'receives_appeals', 'source',
      'notes', 'updated_at',
    ],
  },
  {
    name: 'gifts',
    columns: ['donor_id', 'fiscal_year', 'amount_cents', 'gift_date', 'kind', 'designation', 'source'],
  },
  {
    name: 'tasks',
    columns: ['donor_id', 'strategy_id', 'title', 'why', 'owner', 'due_date', 'done_at', 'source', 'created_at'],
  },
  { name: 'touches', columns: ['donor_id', 'kind', 'occurred_on', 'note', 'created_at'] },
  {
    name: 'strategies',
    columns: [
      'slug', 'name', 'owner', 'goal_cents', 'goal_trust', 'hours_per_week', 'hours_trust',
      'precondition', 'dependency', 'failure_mode', 'done_means', 'next_move',
    ],
  },
  { name: 'budget_lines', columns: ['fiscal_year', 'section', 'line', 'amount_cents', 'trust', 'note'] },
  { name: 'collateral', columns: ['name', 'owner', 'due_date', 'status', 'blocks'] },
  { name: 'capacity', columns: ['person', 'hours_per_week', 'trust', 'note'] },
  { name: 'content_blocks', columns: ['section', 'kind', 'payload', 'sort'] },
]

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(',')]
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(','))
  return lines.join('\n') + '\n'
}

const PROFILE_SECTIONS: [string, string][] = [
  ['snapshot', 'The short version'],
  ['public_notes', 'What is public'],
  ['capacity_ladder', 'Capacity ladder'],
  ['relationship_read', 'Relationship read'],
  ['questions', 'Questions to ask'],
  ['proposals', 'Proposal options'],
  ['sequence', 'The sequence'],
  ['ask_path', 'The ask path'],
]

function profileMarkdown(household: string, p: Record<string, unknown>): string {
  const lines = [`# ${household}`, '']
  if (p.headline) lines.push(String(p.headline), '')
  for (const [key, title] of PROFILE_SECTIONS) {
    const v = p[key]
    if (v === null || v === undefined) continue
    lines.push(`## ${title}`, '')
    lines.push(typeof v === 'string' ? v : '```json\n' + JSON.stringify(v, null, 2) + '\n```', '')
  }
  return lines.join('\n')
}

const safeName = (s: string) => s.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'org'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const { orgSlug } = await params
  const viewer = await getViewer()
  if (!viewer.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!viewer.hub || viewer.hub.orgSlug !== orgSlug) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  const limited = await enforceRateLimits([
    { config: LIMITS.EXPORT_PER_HOUR, key: viewer.user.id },
    { config: LIMITS.EXPORT_PER_DAY, key: viewer.user.id },
  ])
  if (limited) return limited

  const supabase = await createServerSupabase()
  const files: Record<string, Uint8Array> = {}

  for (const t of TABLES) {
    const { data, error } = await supabase
      .from(`hub_${t.name}`)
      .select('*')
      .eq('org_id', viewer.hub.orgId)
    if (error) return NextResponse.json({ error: 'read_failed' }, { status: 502 })
    files[`${t.name}.csv`] = strToU8(toCsv(t.columns, data ?? []))
  }

  const [{ data: profiles }, { data: donors }] = await Promise.all([
    supabase.from('hub_profiles').select('*').eq('org_id', viewer.hub.orgId),
    supabase.from('hub_donors').select('id, household').eq('org_id', viewer.hub.orgId),
  ])
  const householdById = new Map((donors ?? []).map((d) => [d.id as string, d.household as string]))
  for (const p of profiles ?? []) {
    const household = householdById.get(p.donor_id as string) ?? 'household'
    files[`profiles/${safeName(household)}.md`] = strToU8(
      profileMarkdown(household, p as Record<string, unknown>)
    )
  }

  const exportedOn = new Date().toISOString().slice(0, 10)
  files['README.txt'] = strToU8(
    [
      `${viewer.hub.orgName}: everything the hub holds, exported ${exportedOn}.`,
      '',
      'Money columns are integer cents. Every budget figure carries its',
      'trust level (verified, estimated, stated, placeholder). Young Life',
      'Connect stays the system of record for gifts; this is the plan and',
      'the work product, and it is yours.',
      '',
    ].join('\n')
  )

  const zip = zipSync(files, { level: 6 })
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName(viewer.hub.orgName)}-hub-export-${exportedOn}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}

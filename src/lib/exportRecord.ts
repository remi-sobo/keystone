import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * lib/exportRecord.ts (V2 5B)
 *
 * The engagement record as one clean markdown file the client keeps.
 * The thesis made literal: we build the system, remove ourselves, and
 * the record walks out the door with them. The builder takes the
 * CALLER'S Supabase client, so RLS shapes every export: a client
 * session exports exactly what a client may read (published charter,
 * sent digests, shared record), and nothing here ever widens a wall.
 * No AI, no storage bytes (files stay downloadable in the app); this
 * is the paper record.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

function fmtWhen(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

export async function buildEngagementRecord(
  supabase: SupabaseClient,
  engagementId: string
): Promise<{ fileName: string; markdown: string } | null> {
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, status, created_at, clients(name)')
    .eq('id', engagementId)
    .maybeSingle()
  if (!engagement) return null

  const [charter, decisions, outcomes, deliverables, sessions, digests, closeout] =
    await Promise.all([
      supabase
        .from('engagement_charters')
        .select('version, body_md, published_at')
        .eq('engagement_id', engagementId)
        .eq('status', 'published')
        .maybeSingle(),
      supabase
        .from('decisions')
        .select('title, decided_on, decided_by_label, context_md')
        .eq('engagement_id', engagementId)
        .order('decided_on', { ascending: true }),
      supabase
        .from('outcomes')
        .select('title, baseline_md, target_md, standing_md, reached_on, sort')
        .eq('engagement_id', engagementId)
        .order('sort'),
      supabase
        .from('deliverables')
        .select('title, kind, url, about_md, delivered_on')
        .eq('engagement_id', engagementId)
        .order('delivered_on', { ascending: true }),
      supabase
        .from('sessions')
        .select('starts_at, tz, kind, purpose, status')
        .eq('engagement_id', engagementId)
        .in('status', ['held', 'booked'])
        .order('starts_at', { ascending: true }),
      // Sent and published only, on BOTH sides: the record is what the
      // client was given, not the practice's drafts.
      supabase
        .from('digests')
        .select('week_of, subject, draft_md')
        .eq('engagement_id', engagementId)
        .eq('status', 'sent')
        .order('week_of', { ascending: true }),
      supabase
        .from('closeouts')
        .select('*')
        .eq('engagement_id', engagementId)
        .eq('status', 'published')
        .maybeSingle(),
    ])

  const clientName = ((engagement.clients as any)?.name as string) ?? ''
  const lines: string[] = []
  const push = (s: string) => lines.push(s)

  push(`# ${engagement.title}`)
  push('')
  push(`The engagement record${clientName ? ` for ${clientName}` : ''}. Exported from Keystone.`)
  push('This file is yours to keep: the agreement, the decisions, the outcomes, and the ending.')
  push('')

  if (charter.data) {
    push(`## The charter (version ${charter.data.version})`)
    push('')
    push(charter.data.body_md ?? '')
    push('')
  }

  if ((decisions.data ?? []).length > 0) {
    push('## Decisions, in order')
    push('')
    for (const d of decisions.data ?? []) {
      push(`- ${fmtWhen(d.decided_on)}: ${d.title}${d.decided_by_label ? ` (${d.decided_by_label})` : ''}`)
      if (d.context_md) push(`  ${d.context_md.replace(/\n+/g, ' ')}`)
    }
    push('')
  }

  if ((outcomes.data ?? []).length > 0) {
    push('## Outcomes')
    push('')
    for (const o of outcomes.data ?? []) {
      push(`### ${o.title}${o.reached_on ? ` (reached ${fmtWhen(o.reached_on)})` : ''}`)
      if (o.baseline_md) push(`Baseline: ${o.baseline_md}`)
      if (o.target_md) push(`Target: ${o.target_md}`)
      if (o.standing_md) push(`Standing: ${o.standing_md}`)
      push('')
    }
  }

  if ((deliverables.data ?? []).length > 0) {
    push('## Deliverables')
    push('')
    for (const d of deliverables.data ?? []) {
      push(`- ${d.title}${d.delivered_on ? ` (${fmtWhen(d.delivered_on)})` : ''}${d.kind === 'link' && d.url ? `: ${d.url}` : ''}`)
      if (d.about_md) push(`  ${d.about_md.replace(/\n+/g, ' ')}`)
    }
    push('')
  }

  if ((sessions.data ?? []).length > 0) {
    push('## Sessions')
    push('')
    for (const s of sessions.data ?? []) {
      push(`- ${fmtWhen(s.starts_at)}: ${s.kind}${s.purpose ? `, ${s.purpose}` : ''}`)
    }
    push('')
  }

  if ((digests.data ?? []).length > 0) {
    push('## The weekly digests')
    push('')
    for (const g of digests.data ?? []) {
      push(`### Week of ${g.week_of}: ${g.subject ?? ''}`)
      push('')
      push(g.draft_md ?? '')
      push('')
    }
  }

  const co = closeout.data
  if (co) {
    push('## The closeout')
    push('')
    const sections: Array<[string, string | null]> = [
      ['What to do if it breaks', co.breaks_md],
      ['Who owns what now', co.ownership_md],
      ['The maintenance rhythm', co.maintenance_md],
      ['Training completed', co.training_md],
      ['Open risks', co.risks_md],
      ['What comes next', co.next_md],
    ]
    for (const [title, body] of sections) {
      if (!body) continue
      push(`### ${title}`)
      push('')
      push(body)
      push('')
    }
  }

  const slug = engagement.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return { fileName: `${slug || 'engagement'}-record.md`, markdown: lines.join('\n') }
}

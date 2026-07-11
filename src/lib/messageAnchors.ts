import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * lib/messageAnchors.ts (V2 3E)
 *
 * Anchor resolution and rendering for the one thread. The label is
 * derived SERVER-SIDE through the CALLER'S OWN session client, so a
 * member can only ever anchor what their wall already admits (an
 * internal practice task, for instance, resolves to nothing for a
 * client session and therefore cannot be anchored). The browser sends
 * only "type:id"; a forged or out-of-scope id fails the send.
 */

export const ANCHOR_TYPES = [
  'session',
  'action_item',
  'deliverable',
  'workstream',
  'decision',
  'digest',
] as const
export type AnchorType = (typeof ANCHOR_TYPES)[number]

export interface ResolvedAnchor {
  type: AnchorType
  id: string
  label: string
}

/** Parse the "type:id" form value; null on anything malformed. */
export function parseAnchorParam(raw: string | undefined | null): { type: AnchorType; id: string } | null {
  if (!raw) return null
  const idx = raw.indexOf(':')
  if (idx < 1) return null
  const type = raw.slice(0, idx) as AnchorType
  const id = raw.slice(idx + 1)
  if (!ANCHOR_TYPES.includes(type)) return null
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  return { type, id }
}

const LABEL_CAP = 140

/** Resolve an anchor inside ONE engagement through the given session. */
export async function resolveAnchor(
  supabase: SupabaseClient,
  engagementId: string,
  type: AnchorType,
  id: string
): Promise<ResolvedAnchor | null> {
  let label: string | null = null
  if (type === 'digest') {
    // The client's session sees only SENT rows (the 0024 policy), so a
    // client can never anchor a digest that never reached anyone.
    const { data } = await supabase
      .from('digests')
      .select('id, week_of')
      .eq('id', id)
      .eq('engagement_id', engagementId)
      .maybeSingle()
    if (data) label = `the digest for the week of ${data.week_of}`
  } else if (type === 'session') {
    const { data } = await supabase
      .from('sessions')
      .select('id, starts_at, purpose')
      .eq('id', id)
      .eq('engagement_id', engagementId)
      .maybeSingle()
    if (data) label = data.purpose || `the session on ${data.starts_at.slice(0, 10)}`
  } else {
    const table =
      type === 'action_item'
        ? 'action_items'
        : type === 'deliverable'
          ? 'deliverables'
          : type === 'workstream'
            ? 'workstreams'
            : 'decisions'
    const { data } = await supabase
      .from(table)
      .select('id, title')
      .eq('id', id)
      .eq('engagement_id', engagementId)
      .maybeSingle()
    if (data) label = data.title
  }
  if (!label) return null
  return { type, id, label: label.slice(0, LABEL_CAP) }
}

/** The chip's link target, per side. Pure. */
export function anchorHref(
  side: 'client' | 'practice',
  type: AnchorType,
  id: string,
  engagementId: string
): string {
  if (side === 'client') {
    switch (type) {
      case 'session':
        return `/sessions/${id}`
      case 'action_item':
        return `/homework/${id}`
      case 'deliverable':
        return '/deliverables'
      case 'decision':
        return '/decisions'
      case 'workstream':
        return '/home'
      case 'digest':
        return '/digests'
    }
  }
  switch (type) {
    case 'session':
      return `/sessions/${id}/notes`
    case 'action_item':
      return `/engagements/${engagementId}/homework/${id}`
    case 'decision':
      return `/engagements/${engagementId}#decisions`
    default:
      return `/engagements/${engagementId}`
  }
}

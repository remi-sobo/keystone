/**
 * The Life hub snapshot contract (trellis specs/Life-hub-spec 3.3),
 * Keystone's half. Pure logic only: no IO, no supabase import, so
 * e2e/hub-snapshot.spec.ts can unit-test every rule directly.
 *
 * THE FILTER IS THE FEATURE. The hub is Remi and Kendra's private
 * planning surface inside Trellis; almost every live action_items row
 * is client homework assigned to SafeSpace staff and must never reach
 * it. A task qualifies only when its audience is 'practice' or it is
 * assigned to one of the hub members named in HUB_MEMBER_IDS. The
 * filter runs in this adapter (in the endpoint's SQL and re-asserted
 * here), never in the consuming hub, so a hub-side bug cannot widen
 * what leaves Keystone.
 *
 * Engagements and workstreams are the practice's own management
 * objects: they serialize as hub projects without an audience filter,
 * scoped to the hub members' practice.
 */

// ── Snapshot shapes (the wire contract) ─────────────────────────────────────

export interface HubProject {
  external_id: string // 'eng:<uuid>' or 'ws:<uuid>'
  kind: 'engagement' | 'workstream'
  title: string
  client_name: string | null
  engagement_external_id: string | null // parent 'eng:<uuid>' for workstreams
  status: string // engagements: active|done; workstreams: the stage value
  owner_practice_member_id: string | null
  updated_at: string
}

export interface HubTask {
  external_id: string // the action_items uuid
  title: string
  status: string // open|done
  due_on: string | null
  audience: string // carried so the consumer can assert the wall held
  assigned_practice_member_id: string | null
  project_external_id: string // 'ws:<uuid>' when set, else 'eng:<uuid>'
  notes: string | null
  updated_at: string
}

export interface HubSnapshot {
  system: 'keystone'
  generated_at: string
  projects: HubProject[]
  tasks: HubTask[]
  full_open_ids: { projects: string[]; tasks: string[] }
}

// ── Source row shapes (only the fields the snapshot reads) ──────────────────

export interface SourceEngagement {
  id: string
  title: string
  status: string
  owner_practice_member_id: string | null
  updated_at: string
  client_name: string | null
}

export interface SourceWorkstream {
  id: string
  engagement_id: string
  title: string
  stage: string
  owner_practice_member_id: string | null
  updated_at: string
  client_name: string | null
}

export interface SourceActionItem {
  id: string
  title: string
  status: string
  due_on: string | null
  audience: string
  assigned_practice_member_id: string | null
  workstream_id: string | null
  engagement_id: string
  body_md: string | null
  updated_at: string
}

// ── Configuration parsing ───────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * HUB_MEMBER_IDS is a comma-separated list of practice_members ids (the
 * hub members: Remi's two rows and Kendra's one). Only well-formed
 * uuids survive parsing; anything else is dropped, which can only
 * NARROW the filter, and dropping garbage also keeps the values safe
 * to embed in a PostgREST or() filter string.
 */
export function parseHubMemberIds(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID_RE.test(s))
}

/**
 * The since cursor. Absent means a full snapshot. Anything present must
 * parse as a real timestamp; it is normalized to ISO so the endpoint
 * never forwards caller text into a query.
 */
export function parseSince(
  raw: string | null
): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: null }
  const t = Date.parse(raw)
  if (Number.isNaN(t)) return { ok: false }
  return { ok: true, value: new Date(t).toISOString() }
}

// ── The filter ──────────────────────────────────────────────────────────────

/**
 * Spec 3.3: audience = 'practice' OR assigned_practice_member_id maps
 * to a hub member. Everything else is the client's work and never
 * leaves Keystone through this endpoint.
 */
export function qualifiesForHub(
  item: Pick<SourceActionItem, 'audience' | 'assigned_practice_member_id'>,
  hubMemberIds: string[]
): boolean {
  if (item.audience === 'practice') return true
  return (
    item.assigned_practice_member_id !== null &&
    hubMemberIds.includes(item.assigned_practice_member_id.toLowerCase())
  )
}

/**
 * The same filter as a PostgREST or() expression, used by the endpoint
 * so the cut happens in the adapter SQL. Caller guarantees the ids came
 * through parseHubMemberIds (uuid-shaped, safe to embed).
 */
export function hubTaskFilterExpression(hubMemberIds: string[]): string {
  if (hubMemberIds.length === 0) return 'audience.eq.practice'
  return `audience.eq.practice,assigned_practice_member_id.in.(${hubMemberIds.join(',')})`
}

// ── Serialization ───────────────────────────────────────────────────────────

export function engagementExternalId(id: string): string {
  return `eng:${id}`
}

export function workstreamExternalId(id: string): string {
  return `ws:${id}`
}

export function serializeEngagement(e: SourceEngagement): HubProject {
  return {
    external_id: engagementExternalId(e.id),
    kind: 'engagement',
    title: e.title,
    client_name: e.client_name,
    engagement_external_id: null,
    status: e.status,
    owner_practice_member_id: e.owner_practice_member_id,
    updated_at: e.updated_at,
  }
}

export function serializeWorkstream(w: SourceWorkstream): HubProject {
  return {
    external_id: workstreamExternalId(w.id),
    kind: 'workstream',
    title: w.title,
    client_name: w.client_name,
    engagement_external_id: engagementExternalId(w.engagement_id),
    status: w.stage,
    owner_practice_member_id: w.owner_practice_member_id,
    updated_at: w.updated_at,
  }
}

export function serializeActionItem(a: SourceActionItem): HubTask {
  return {
    external_id: a.id,
    title: a.title,
    status: a.status,
    due_on: a.due_on,
    audience: a.audience,
    assigned_practice_member_id: a.assigned_practice_member_id,
    project_external_id: a.workstream_id
      ? workstreamExternalId(a.workstream_id)
      : engagementExternalId(a.engagement_id),
    notes: a.body_md,
    updated_at: a.updated_at,
  }
}

// ── The open-id sets for reconciliation ─────────────────────────────────────
// full_open_ids is mandatory in the contract: the hub diffs these full
// sets each run and marks vanished rows dropped. Open means an
// engagement still active, a workstream not at its done stage, an
// action item still open.

export function openProjectIds(
  engagements: Array<Pick<SourceEngagement, 'id' | 'status'>>,
  workstreams: Array<Pick<SourceWorkstream, 'id' | 'stage'>>
): string[] {
  return [
    ...engagements.filter((e) => e.status === 'active').map((e) => engagementExternalId(e.id)),
    ...workstreams.filter((w) => w.stage !== 'done').map((w) => workstreamExternalId(w.id)),
  ]
}

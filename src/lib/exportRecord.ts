import type { SupabaseClient } from '@supabase/supabase-js'
import { zipSync, strToU8 } from 'fflate'

/**
 * lib/exportRecord.ts (V2 5B, specs/keystone-v2-portability.md)
 *
 * The engagement record as a zip the caller keeps. Two laws from the
 * spec, both enforced here:
 *
 * 1. The archive is assembled on the CALLER'S OWN SESSION under RLS
 *    (the 2E corpus discipline), so no export path ever widens what a
 *    session can read. There is no service role anywhere in this file.
 * 2. Both sides get the SHARED record only (gate 5B-3): every query
 *    filters to the shared shape explicitly (published charters,
 *    shared notes, client-audience homework, sent digests,
 *    client-visible documents), so a practice session, which can read
 *    more, still exports the same client-shaped archive and a
 *    forwarded zip can never leak practice-only material. Homework
 *    activity threads render only for a client caller, whose RLS
 *    admits their own threads alone (the 3C wall).
 *
 * Raw transcripts are excluded BY QUERY on top of RLS: the notes
 * select never touches raw_transcript or transcript_path
 * (SECURITY.md section 4 rule 2). ai_proposals, readiness prose, and
 * Q&A exchanges are never queried at all.
 */

export interface ExportMeta {
  engagementTitle: string
  clientName: string
  practiceName: string
  startsOn: string | null
  endsOn: string | null
  exportedFor: string
  side: 'client' | 'practice'
  // YYYY-MM-DD, stamped by the route.
  exportedOn: string
}

export interface ExportDoc {
  path: string
  text: string
}

export interface ExportCounts {
  charters: number
  decisions: number
  outcomes: number
  sessions: number
  homework: number
  deliverables: number
  digests: number
  messages: number
  documents: number
  library: number
  closeout: number
  files: number
}

/** Total archive ceiling. Past this the export refuses honestly. */
export const EXPORT_BYTE_CEILING = 150 * 1024 * 1024

/** A filesystem-safe, readable name fragment. */
export function safeName(input: string, fallback = 'item'): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return cleaned || fallback
}

/** Dedupe zip paths: a second "plan.pdf" becomes "plan-2.pdf". */
export function dedupePath(path: string, taken: Set<string>): string {
  if (!taken.has(path)) {
    taken.add(path)
    return path
  }
  const dot = path.lastIndexOf('.')
  const stem = dot > 0 ? path.slice(0, dot) : path
  const ext = dot > 0 ? path.slice(dot) : ''
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
}

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : ''
}

// Renderers. Pure, fixture-testable; they receive rows the assembly
// already filtered to the shared shape and never query anything.

interface CharterRow {
  version: number
  body_md: string
  status: string
  published_at: string | null
}

export function renderCharter(rows: CharterRow[]): string {
  if (rows.length === 0) return '# The charter\n\nNo charter has been published yet.\n'
  const parts = ['# The charter\n']
  for (const c of rows) {
    parts.push(
      `## Version ${c.version}${c.status === 'superseded' ? ' (superseded)' : ''}${
        c.published_at ? `, published ${day(c.published_at)}` : ''
      }\n\n${c.body_md.trim()}\n`
    )
  }
  return parts.join('\n')
}

interface DecisionRow {
  id: string
  decided_on: string
  title: string
  context_md: string | null
  decided_by_label: string | null
  revisit_on: string | null
  supersedes: string | null
}

export function renderDecisions(rows: DecisionRow[]): string {
  if (rows.length === 0) return '# The decision log\n\nNo decisions logged yet.\n'
  const supersededIds = new Set(rows.map((d) => d.supersedes).filter(Boolean))
  const parts = ['# The decision log\n']
  for (const d of rows) {
    const lines = [
      `## ${day(d.decided_on)}: ${d.title}${supersededIds.has(d.id) ? ' (superseded)' : ''}`,
    ]
    if (d.decided_by_label) lines.push(`Decided by ${d.decided_by_label}.`)
    if (d.context_md) lines.push(d.context_md.trim())
    if (d.revisit_on) lines.push(`Revisit on ${d.revisit_on}.`)
    parts.push(lines.join('\n\n') + '\n')
  }
  return parts.join('\n')
}

interface OutcomeRow {
  id: string
  title: string
  baseline_md: string | null
  target_md: string | null
  standing_md: string | null
  standing_updated_at: string | null
  reached_on: string | null
}

export interface EvidenceRef {
  outcome_id: string
  kind: string
  label: string
}

export function renderOutcomes(rows: OutcomeRow[], evidence: EvidenceRef[]): string {
  if (rows.length === 0) return '# Outcomes\n\nNo outcomes recorded yet.\n'
  const parts = ['# Outcomes\n\nThe success measures, with where each one stands.\n']
  for (const o of rows) {
    const lines = [`## ${o.title}${o.reached_on ? ` (reached ${o.reached_on})` : ''}`]
    if (o.baseline_md) lines.push(`Starting point: ${o.baseline_md.trim()}`)
    if (o.target_md) lines.push(`Done looks like: ${o.target_md.trim()}`)
    if (o.standing_md) {
      lines.push(
        `Where it stands${o.standing_updated_at ? ` (${day(o.standing_updated_at)})` : ''}: ${o.standing_md.trim()}`
      )
    }
    const ev = evidence.filter((e) => e.outcome_id === o.id)
    if (ev.length > 0) {
      lines.push(`Evidence: ${ev.map((e) => e.label).join('; ')}.`)
    }
    parts.push(lines.join('\n\n') + '\n')
  }
  return parts.join('\n')
}

interface SessionRow {
  id: string
  starts_at: string
  kind: string
  status: string
  purpose: string | null
  agenda_md: string | null
  moves_label: string | null
}

interface NoteRow {
  session_id: string
  summary_md: string | null
  decisions_md: string | null
}

export function renderSessions(rows: SessionRow[], notes: NoteRow[]): string {
  if (rows.length === 0) return '# Sessions\n\nNo sessions on the record yet.\n'
  const bySession = new Map(notes.map((n) => [n.session_id, n]))
  const parts = ['# Sessions\n']
  for (const s of rows) {
    const lines = [`## ${day(s.starts_at)} (${s.kind.replace('_', ' ')}, ${s.status})`]
    if (s.purpose) lines.push(`Purpose: ${s.purpose}`)
    if (s.moves_label) lines.push(`This session moves ${s.moves_label}.`)
    if (s.agenda_md) lines.push(`Agenda:\n\n${s.agenda_md.trim()}`)
    const note = bySession.get(s.id)
    if (note?.summary_md) lines.push(`Notes:\n\n${note.summary_md.trim()}`)
    if (note?.decisions_md) lines.push(`Decisions discussed:\n\n${note.decisions_md.trim()}`)
    parts.push(lines.join('\n\n') + '\n')
  }
  return parts.join('\n')
}

interface HomeworkRow {
  id: string
  title: string
  body_md: string | null
  status: string
  due_on: string | null
  done_at: string | null
  review_requested: boolean
}

export interface ActivityRow {
  action_item_id: string
  kind: string
  body_md: string | null
  link_url: string | null
  created_at: string
  by: 'client' | 'practice'
}

const ACTIVITY_WORDS: Record<string, string> = {
  comment: 'commented',
  submission: 'submitted',
  send_back: 'sent it back with a note',
  acceptance: 'accepted it',
  blocked: 'marked it blocked',
  unblocked: 'cleared the block',
}

export function renderHomework(
  rows: HomeworkRow[],
  activity: ActivityRow[],
  meta: Pick<ExportMeta, 'side' | 'practiceName'>
): string {
  if (rows.length === 0) return '# Homework\n\nNo homework on the record yet.\n'
  const parts = ['# Homework\n']
  for (const h of rows) {
    const lines = [
      `## ${h.title} (${h.status === 'done' ? `done${h.done_at ? ` ${day(h.done_at)}` : ''}` : 'open'})`,
    ]
    if (h.due_on) lines.push(`Due ${h.due_on}.${h.review_requested ? ' Reviewed work.' : ''}`)
    if (h.body_md) lines.push(h.body_md.trim())
    if (meta.side === 'client') {
      const thread = activity.filter((a) => a.action_item_id === h.id)
      if (thread.length > 0) {
        lines.push(
          thread
            .map((a) => {
              const who = a.by === 'client' ? 'You' : meta.practiceName
              const word = ACTIVITY_WORDS[a.kind] ?? a.kind
              const tail = [a.body_md?.trim(), a.link_url].filter(Boolean).join(' ')
              return `- ${day(a.created_at)}: ${who} ${word}${tail ? `: ${tail}` : '.'}`
            })
            .join('\n')
        )
      }
    }
    parts.push(lines.join('\n\n') + '\n')
  }
  return parts.join('\n')
}

interface DeliverableRow {
  id: string
  title: string
  kind: string
  url: string | null
  note: string | null
  about_md: string | null
  delivered_on: string
  file_included: string | null
  versions: number
}

export function renderDeliverables(rows: DeliverableRow[]): string {
  if (rows.length === 0) return '# Deliverables\n\nNothing shipped yet.\n'
  const parts = ['# Deliverables\n']
  for (const d of rows) {
    const lines = [`## ${d.title} (delivered ${d.delivered_on})`]
    if (d.about_md) lines.push(d.about_md.trim())
    if (d.note) lines.push(d.note.trim())
    if (d.kind === 'link' && d.url) lines.push(`Link: ${d.url}`)
    if (d.file_included) lines.push(`File in this archive: deliverables/${d.file_included}`)
    if (d.versions > 0) {
      lines.push(
        `${d.versions} earlier version${d.versions === 1 ? '' : 's'} on the record; this archive carries the current one.`
      )
    }
    parts.push(lines.join('\n\n') + '\n')
  }
  return parts.join('\n')
}

interface DigestRow {
  week_of: string
  subject: string
  draft_md: string
  sent_at: string | null
}

export function renderDigests(rows: DigestRow[]): string {
  if (rows.length === 0) return '# Digests\n\nNo digests sent yet.\n'
  const parts = ['# Digests\n\nEvery digest that was sent, oldest first.\n']
  for (const g of rows) {
    parts.push(`## Week of ${g.week_of}: ${g.subject}\n\n${g.draft_md.trim()}\n`)
  }
  return parts.join('\n')
}

interface MessageRow {
  created_at: string
  author_side: string
  body: string
  anchor_label: string | null
}

export function renderMessages(
  rows: MessageRow[],
  meta: Pick<ExportMeta, 'clientName' | 'practiceName'>
): string {
  if (rows.length === 0) return '# Messages\n\nNo messages yet.\n'
  const parts = ['# Messages\n\nThe one thread, oldest first.\n']
  for (const m of rows) {
    const who = m.author_side === 'practice' ? meta.practiceName : meta.clientName
    parts.push(
      `**${who}, ${day(m.created_at)}**${m.anchor_label ? ` (about: ${m.anchor_label})` : ''}\n\n${m.body.trim()}\n`
    )
  }
  return parts.join('\n')
}

interface LibraryRow {
  title: string
  kind: string
  body_md: string | null
  file_included: string | null
}

export function renderLibrary(rows: LibraryRow[]): string {
  if (rows.length === 0) return '# The library\n\nNo resources shared.\n'
  const parts = [
    '# The library\n\nGuides and materials shared during the engagement, licensed for your internal use.\n',
  ]
  for (const r of rows) {
    const lines = [`## ${r.title} (${r.kind})`]
    if (r.body_md) lines.push(r.body_md.trim())
    if (r.file_included) lines.push(`Attachment in this archive: library/${r.file_included}`)
    parts.push(lines.join('\n\n') + '\n')
  }
  return parts.join('\n')
}

interface CloseoutRow {
  risks_md: string | null
  ownership_md: string | null
  maintenance_md: string | null
  training_md: string | null
  breaks_md: string | null
  next_md: string | null
  published_at: string | null
}

export function renderCloseout(row: CloseoutRow | null): string {
  if (!row) return '# The closeout\n\nNo closeout has been published yet.\n'
  const sections: Array<[string, string | null]> = [
    ['What to do if it breaks', row.breaks_md],
    ['Who owns what', row.ownership_md],
    ['The maintenance rhythm', row.maintenance_md],
    ['Training completed', row.training_md],
    ['Open risks', row.risks_md],
    ['What comes next', row.next_md],
  ]
  const parts = [
    `# The closeout${row.published_at ? `\n\nPublished ${day(row.published_at)}.` : ''}\n`,
  ]
  for (const [title, body] of sections) {
    if (body) parts.push(`## ${title}\n\n${body.trim()}\n`)
  }
  return parts.join('\n')
}

interface WorkstreamRow {
  title: string
  stage: string
  note_md: string | null
}

export function renderReadme(
  meta: ExportMeta,
  workstreams: WorkstreamRow[],
  counts: ExportCounts,
  missing: string[]
): string {
  const included: string[] = [
    `charter.md: the charter (${counts.charters} version${counts.charters === 1 ? '' : 's'})`,
    `decisions.md: the decision log (${counts.decisions})`,
    `outcomes.md: the success measures (${counts.outcomes})`,
    `sessions.md: sessions with shared notes (${counts.sessions})`,
    `homework.md: homework (${counts.homework})`,
    `deliverables.md and deliverables/: what shipped (${counts.deliverables})`,
    `digests.md: sent digests (${counts.digests})`,
    `messages.md: the message thread (${counts.messages})`,
    `closeout.md: the closeout${counts.closeout ? '' : ' (not yet published)'}`,
    `documents/: engagement documents (${counts.documents})`,
    `library.md and library/: shared resources (${counts.library})`,
  ]
  const lines = [
    `# The engagement record: ${meta.engagementTitle}`,
    '',
    `This archive is the record of the engagement between ${meta.practiceName} and ${meta.clientName}` +
      `${meta.startsOn ? `, ${meta.startsOn}` : ''}${meta.endsOn ? ` to ${meta.endsOn}` : ''}. ` +
      `Exported for ${meta.exportedFor} on ${meta.exportedOn}. It belongs to ${meta.clientName}.`,
    '',
    '## What is inside',
    '',
    ...included.map((s) => `- ${s}`),
    '',
    '## Where things stand',
    '',
    ...(workstreams.length > 0
      ? workstreams.map(
          (w) => `- ${w.title}: ${w.stage}${w.note_md ? `. ${w.note_md.trim()}` : ''}`
        )
      : ['- No workstreams on the record.']),
    '',
    '## What is never in an export',
    '',
    'Raw session transcripts, drafts, AI proposals awaiting review, and the',
    "practice's internal working notes. The archive holds the shared record:",
    'what both sides could already see in the room.',
  ]
  if (missing.length > 0) {
    lines.push(
      '',
      '## Not included this time',
      '',
      'These files could not be fetched when this archive was built. They remain',
      'available in the room, and a fresh export can pick them up:',
      '',
      ...missing.map((m) => `- ${m}`)
    )
  }
  return lines.join('\n') + '\n'
}

// Assembly. Every query is engagement-scoped and filtered to the
// shared shape; the caller's session is the wall that serves the rows.

export type ArchiveResult =
  | { ok: true; zip: Uint8Array; counts: ExportCounts; bytes: number }
  | { ok: false; error: 'too_large' | 'failed' }

export async function buildArchiveZip(
  supabase: SupabaseClient,
  engagementId: string,
  meta: ExportMeta
): Promise<ArchiveResult> {
  const [
    workstreams,
    charters,
    decisions,
    outcomes,
    evidence,
    sessions,
    notes,
    items,
    activity,
    deliverables,
    versions,
    digests,
    messages,
    documents,
    library,
    closeout,
  ] = await Promise.all([
    supabase
      .from('workstreams')
      .select('id, title, stage, note_md, sort')
      .eq('engagement_id', engagementId)
      .order('sort'),
    supabase
      .from('engagement_charters')
      .select('version, body_md, status, published_at')
      .eq('engagement_id', engagementId)
      .in('status', ['published', 'superseded'])
      .order('version', { ascending: false }),
    supabase
      .from('decisions')
      .select('id, decided_on, title, context_md, decided_by_label, revisit_on, supersedes')
      .eq('engagement_id', engagementId)
      .order('decided_on')
      .limit(500),
    supabase
      .from('outcomes')
      .select('id, title, baseline_md, target_md, standing_md, standing_updated_at, reached_on')
      .eq('engagement_id', engagementId)
      .order('sort')
      .limit(100),
    supabase
      .from('outcome_evidence')
      .select('outcome_id, kind, ref_id')
      .eq('engagement_id', engagementId)
      .limit(500),
    supabase
      .from('sessions')
      .select(
        'id, starts_at, kind, status, purpose, agenda_md, moves_to_stage, moves_workstream_id'
      )
      .eq('engagement_id', engagementId)
      .neq('status', 'canceled')
      .order('starts_at')
      .limit(500),
    // The notes select never touches raw_transcript or transcript_path,
    // and only shared notes ship, on either side (gate 5B-3).
    supabase
      .from('session_notes')
      .select('session_id, summary_md, decisions_md')
      .eq('engagement_id', engagementId)
      .eq('visibility', 'shared')
      .limit(500),
    // Client homework only; internal practice tasks never export.
    supabase
      .from('action_items')
      .select('id, title, body_md, status, due_on, done_at, review_requested, created_at')
      .eq('engagement_id', engagementId)
      .eq('audience', 'client')
      .order('created_at')
      .limit(1000),
    // Threads render for a client caller only; their RLS admits their
    // own rows alone (the 3C wall). The practice archive skips them.
    meta.side === 'client'
      ? supabase
          .from('homework_activity')
          .select(
            'action_item_id, kind, body_md, link_url, created_at, author_practice_member_id'
          )
          .eq('engagement_id', engagementId)
          .order('created_at')
          .limit(2000)
      : Promise.resolve({ data: [] as never[], error: null }),
    supabase
      .from('deliverables')
      .select('id, title, kind, url, note, about_md, delivered_on, storage_path')
      .eq('engagement_id', engagementId)
      .eq('status', 'shipped')
      .order('delivered_on')
      .limit(500),
    supabase
      .from('deliverable_versions')
      .select('deliverable_id')
      .eq('engagement_id', engagementId)
      .limit(2000),
    supabase
      .from('digests')
      .select('week_of, subject, draft_md, sent_at')
      .eq('engagement_id', engagementId)
      .eq('status', 'sent')
      .order('week_of')
      .limit(300),
    supabase
      .from('messages')
      .select('created_at, author_side, body, anchor_label')
      .eq('engagement_id', engagementId)
      .order('created_at')
      .limit(5000),
    supabase
      .from('engagement_documents')
      .select('title, file_name, storage_path, mime_type')
      .eq('engagement_id', engagementId)
      .eq('visible_to_client', true)
      .limit(100),
    supabase.from('resources').select('id, title, kind, body_md, storage_path').limit(300),
    // The published closeout only, on either side: drafts stay in the room.
    supabase
      .from('closeouts')
      .select('risks_md, ownership_md, maintenance_md, training_md, breaks_md, next_md, published_at')
      .eq('engagement_id', engagementId)
      .eq('status', 'published')
      .maybeSingle(),
  ])

  const queryFailed = [
    workstreams,
    charters,
    decisions,
    outcomes,
    evidence,
    sessions,
    notes,
    items,
    deliverables,
    versions,
    digests,
    messages,
    documents,
    library,
    closeout,
  ].some((r) => r.error)
  if (queryFailed) return { ok: false, error: 'failed' }

  // Resolve labels the renderers need.
  const wsById = new Map((workstreams.data ?? []).map((w) => [w.id, w.title]))
  const sessionRows = (sessions.data ?? []).map((s) => ({
    ...s,
    moves_label:
      s.moves_workstream_id && s.moves_to_stage
        ? `${wsById.get(s.moves_workstream_id) ?? 'a workstream'} to ${s.moves_to_stage}`
        : null,
  }))
  const labelByRef = new Map<string, string>()
  for (const d of deliverables.data ?? []) labelByRef.set(`deliverable:${d.id}`, `the deliverable "${d.title}"`)
  for (const s of sessions.data ?? []) labelByRef.set(`session:${s.id}`, `the session on ${day(s.starts_at)}`)
  for (const a of items.data ?? []) labelByRef.set(`action_item:${a.id}`, `the homework "${a.title}"`)
  for (const d of decisions.data ?? []) labelByRef.set(`decision:${d.id}`, `the decision "${d.title}"`)
  const evidenceRefs: EvidenceRef[] = (evidence.data ?? []).map((e) => ({
    outcome_id: e.outcome_id,
    kind: e.kind,
    label: labelByRef.get(`${e.kind}:${e.ref_id}`) ?? 'a linked artifact',
  }))
  const versionCounts = new Map<string, number>()
  for (const v of versions.data ?? []) {
    versionCounts.set(v.deliverable_id, (versionCounts.get(v.deliverable_id) ?? 0) + 1)
  }
  const activityRows: ActivityRow[] = (activity.data ?? []).map((a) => ({
    action_item_id: a.action_item_id,
    kind: a.kind,
    body_md: a.body_md,
    link_url: a.link_url,
    created_at: a.created_at,
    by: a.author_practice_member_id ? 'practice' : 'client',
  }))

  // Binary files, streamed through the caller's session so the storage
  // policies serve the bytes. A failed fetch is listed, never silent.
  const taken = new Set<string>()
  const binaries: Array<{ path: string; data: Uint8Array }> = []
  const missing: string[] = []
  let bytes = 0

  async function pull(bucket: string, storagePath: string, zipDir: string, label: string) {
    const fileName = storagePath.split('/').pop() || 'file'
    const { data: blob, error } = await supabase.storage.from(bucket).download(storagePath)
    if (error || !blob) {
      missing.push(`${zipDir}/${fileName} (${label})`)
      return null
    }
    const data = new Uint8Array(await blob.arrayBuffer())
    bytes += data.byteLength
    const path = dedupePath(`${zipDir}/${fileName}`, taken)
    binaries.push({ path, data })
    return path.split('/').pop() ?? fileName
  }

  const deliverableRows = []
  for (const d of deliverables.data ?? []) {
    let included: string | null = null
    if (d.kind === 'file' && d.storage_path) {
      included = await pull('deliverables', d.storage_path, 'deliverables', d.title)
    }
    deliverableRows.push({
      ...d,
      file_included: included,
      versions: versionCounts.get(d.id) ?? 0,
    })
  }
  for (const doc of documents.data ?? []) {
    await pull('engagement-documents', doc.storage_path, 'documents', doc.title)
  }
  const libraryRows = []
  for (const r of library.data ?? []) {
    let included: string | null = null
    if (r.storage_path) {
      included = await pull('resources', r.storage_path, 'library', r.title)
    }
    libraryRows.push({ ...r, file_included: included })
  }

  const counts: ExportCounts = {
    charters: (charters.data ?? []).length,
    decisions: (decisions.data ?? []).length,
    outcomes: (outcomes.data ?? []).length,
    sessions: sessionRows.length,
    homework: (items.data ?? []).length,
    deliverables: deliverableRows.length,
    digests: (digests.data ?? []).length,
    messages: (messages.data ?? []).length,
    documents: (documents.data ?? []).length,
    library: libraryRows.length,
    closeout: closeout.data ? 1 : 0,
    files: binaries.length,
  }

  const docs: ExportDoc[] = [
    {
      path: 'README.md',
      text: renderReadme(meta, workstreams.data ?? [], counts, missing),
    },
    { path: 'charter.md', text: renderCharter(charters.data ?? []) },
    { path: 'decisions.md', text: renderDecisions(decisions.data ?? []) },
    { path: 'outcomes.md', text: renderOutcomes(outcomes.data ?? [], evidenceRefs) },
    { path: 'sessions.md', text: renderSessions(sessionRows, notes.data ?? []) },
    { path: 'homework.md', text: renderHomework(items.data ?? [], activityRows, meta) },
    { path: 'deliverables.md', text: renderDeliverables(deliverableRows) },
    { path: 'digests.md', text: renderDigests(digests.data ?? []) },
    { path: 'messages.md', text: renderMessages(messages.data ?? [], meta) },
    { path: 'closeout.md', text: renderCloseout(closeout.data ?? null) },
    { path: 'library.md', text: renderLibrary(libraryRows) },
  ]

  const root = `${safeName(meta.clientName, 'client')}-engagement-record-${meta.exportedOn}`
  const entries: Record<string, Uint8Array> = {}
  for (const doc of docs) {
    const data = strToU8(doc.text)
    bytes += data.byteLength
    entries[`${root}/${doc.path}`] = data
  }
  for (const b of binaries) {
    entries[`${root}/${b.path}`] = b.data
  }

  if (bytes > EXPORT_BYTE_CEILING) return { ok: false, error: 'too_large' }

  const zip = zipSync(entries, { level: 6 })
  return { ok: true, zip, counts, bytes: zip.byteLength }
}

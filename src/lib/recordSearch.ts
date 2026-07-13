import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * lib/recordSearch.ts (V2 engagement search)
 *
 * Plain keyword search across the record, the mechanical sibling of
 * Q&A. Every query runs on the CALLER'S OWN SESSION under RLS (the 2E
 * pattern), so the search scope IS the caller's visibility and no
 * index copies anything. ILIKE over a small record; the notes query
 * never touches transcript columns (SECURITY.md 4.2), gate-checked.
 */

export type SearchKind =
  | 'charter'
  | 'decision'
  | 'note'
  | 'outcome'
  | 'homework'
  | 'deliverable'
  | 'workstream'
  | 'message'

export interface SearchHit {
  kind: SearchKind
  label: string
  snippet: string
}

export const SEARCH_MIN_CHARS = 2
const PER_KIND_CAP = 10
const SNIPPET_RADIUS = 80

/** Strip PostgREST-reserved and pattern characters, keep the words. Pure. */
export function cleanTerm(raw: string): string {
  return raw.replace(/["\\]/g, '').trim()
}

/** Escape ILIKE wildcards inside an already-clean term. Pure. */
export function likePattern(term: string): string {
  return `%${term.replace(/[%_]/g, (m) => '\\' + m)}%`
}

/** Cut a snippet around the first case-insensitive match. Pure. */
export function snippetAround(text: string, term: string): string {
  const at = text.toLowerCase().indexOf(term.toLowerCase())
  if (at < 0) return text.slice(0, SNIPPET_RADIUS * 2)
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(text.length, at + term.length + SNIPPET_RADIUS)
  return `${start > 0 ? '...' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '...' : ''}`
}

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

export async function searchRecord(
  supabase: SupabaseClient,
  engagementId: string,
  rawTerm: string
): Promise<SearchHit[]> {
  const term = cleanTerm(rawTerm)
  if (term.length < SEARCH_MIN_CHARS) return []
  const p = likePattern(term)
  const quoted = `"${p}"`

  const [charters, decisions, notes, outcomes, items, ships, workstreams, messages] =
    await Promise.all([
      supabase
        .from('engagement_charters')
        .select('version, body_md, status')
        .eq('engagement_id', engagementId)
        .ilike('body_md', p)
        .limit(PER_KIND_CAP),
      supabase
        .from('decisions')
        .select('title, context_md, decided_on')
        .eq('engagement_id', engagementId)
        .or(`title.ilike.${quoted},context_md.ilike.${quoted}`)
        .limit(PER_KIND_CAP),
      supabase
        .from('session_notes')
        .select('summary_md, decisions_md, created_at')
        .eq('engagement_id', engagementId)
        .or(`summary_md.ilike.${quoted},decisions_md.ilike.${quoted}`)
        .limit(PER_KIND_CAP),
      supabase
        .from('outcomes')
        .select('title, baseline_md, target_md, standing_md')
        .eq('engagement_id', engagementId)
        .or(
          `title.ilike.${quoted},baseline_md.ilike.${quoted},target_md.ilike.${quoted},standing_md.ilike.${quoted}`
        )
        .limit(PER_KIND_CAP),
      supabase
        .from('action_items')
        .select('title, status, due_on')
        .eq('engagement_id', engagementId)
        .ilike('title', p)
        .limit(PER_KIND_CAP),
      supabase
        .from('deliverables')
        .select('title, note, delivered_on')
        .eq('engagement_id', engagementId)
        .eq('status', 'shipped')
        .or(`title.ilike.${quoted},note.ilike.${quoted}`)
        .limit(PER_KIND_CAP),
      supabase
        .from('workstreams')
        .select('title, note_md, stage')
        .eq('engagement_id', engagementId)
        .or(`title.ilike.${quoted},note_md.ilike.${quoted}`)
        .limit(PER_KIND_CAP),
      supabase
        .from('messages')
        .select('body, author_side, created_at')
        .eq('engagement_id', engagementId)
        .ilike('body', p)
        .order('created_at', { ascending: false })
        .limit(PER_KIND_CAP),
    ])

  const hits: SearchHit[] = []
  for (const c of charters.data ?? []) {
    hits.push({
      kind: 'charter',
      label: `The charter, version ${c.version}${c.status === 'superseded' ? ' (superseded)' : ''}`,
      snippet: snippetAround(c.body_md, term),
    })
  }
  for (const d of decisions.data ?? []) {
    hits.push({
      kind: 'decision',
      label: `Decision, ${day(d.decided_on)}`,
      snippet: snippetAround([d.title, d.context_md].filter(Boolean).join(' '), term),
    })
  }
  for (const n of notes.data ?? []) {
    hits.push({
      kind: 'note',
      label: `Session notes, ${day(n.created_at)}`,
      snippet: snippetAround([n.summary_md, n.decisions_md].filter(Boolean).join(' '), term),
    })
  }
  for (const o of outcomes.data ?? []) {
    hits.push({
      kind: 'outcome',
      label: `Outcome: ${o.title.slice(0, 40)}`,
      snippet: snippetAround(
        [o.title, o.baseline_md, o.target_md, o.standing_md].filter(Boolean).join(' '),
        term
      ),
    })
  }
  for (const it of items.data ?? []) {
    hits.push({
      kind: 'homework',
      label: `Homework (${it.status})`,
      snippet: snippetAround(it.title, term),
    })
  }
  for (const d of ships.data ?? []) {
    hits.push({
      kind: 'deliverable',
      label: `Deliverable, ${day(d.delivered_on)}`,
      snippet: snippetAround([d.title, d.note].filter(Boolean).join(' '), term),
    })
  }
  for (const w of workstreams.data ?? []) {
    hits.push({
      kind: 'workstream',
      label: `Workstream: ${w.title.slice(0, 40)}`,
      snippet: snippetAround([w.title, w.note_md].filter(Boolean).join(' '), term),
    })
  }
  for (const m of messages.data ?? []) {
    hits.push({
      kind: 'message',
      label: `Message from the ${m.author_side === 'practice' ? 'practice' : 'client'}, ${day(m.created_at)}`,
      snippet: snippetAround(m.body, term),
    })
  }
  return hits
}

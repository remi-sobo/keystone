import type { SupabaseClient } from '@supabase/supabase-js'
import type { CorpusItem } from '@/lib/qa'

/**
 * lib/qaCorpus.ts
 *
 * The Q&A corpus, built on the CALLER'S OWN SESSION CLIENT under RLS
 * (specs/keystone-v2-qa.md section 2, gate 2E-1): the corpus is
 * definitionally what the asker may read. A client member's session
 * cannot select drafts, unshared notes, or readiness prose, so they
 * never enter the model's context; a practice member's session reads
 * the fuller record. There is no second permission system here.
 *
 * Raw transcripts are excluded BY QUERY on top of RLS (the notes
 * select never touches raw_transcript or transcript_path), honoring
 * SECURITY.md section 4 rule 2: only extraction ever sees transcript
 * text.
 */

function day(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

export async function buildQaCorpus(
  supabase: SupabaseClient,
  engagementId: string
): Promise<CorpusItem[]> {
  const [charters, decisions, notes, outcomes, items, ships, workstreams] = await Promise.all([
    supabase
      .from('engagement_charters')
      .select('version, body_md, status, published_at')
      .eq('engagement_id', engagementId)
      .eq('status', 'published')
      .limit(1),
    supabase
      .from('decisions')
      .select('title, context_md, decided_on, decided_by_label')
      .eq('engagement_id', engagementId)
      .order('decided_on', { ascending: false })
      .limit(100),
    supabase
      .from('session_notes')
      .select('summary_md, decisions_md, visibility, created_at')
      .eq('engagement_id', engagementId)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('outcomes')
      .select('title, baseline_md, target_md, standing_md, reached_on, sort')
      .eq('engagement_id', engagementId)
      .order('sort')
      .limit(30),
    supabase
      .from('action_items')
      .select('title, status, due_on, timing')
      .eq('engagement_id', engagementId)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('deliverables')
      .select('title, note, delivered_on')
      .eq('engagement_id', engagementId)
      .order('delivered_on', { ascending: false })
      .limit(40),
    supabase
      .from('workstreams')
      .select('title, stage, note_md, sort')
      .eq('engagement_id', engagementId)
      .order('sort'),
  ])

  const corpus: CorpusItem[] = []

  for (const c of charters.data ?? []) {
    corpus.push({
      id: `charter:v${c.version}`,
      label: `The charter, version ${c.version}`,
      href: '/charter',
      text: c.body_md,
    })
  }
  ;(workstreams.data ?? []).forEach((w, i) => {
    corpus.push({
      id: `workstream:${i + 1}`,
      label: `Workstream: ${w.title}`,
      href: '/home',
      text: `${w.title}. Stage: ${w.stage}.${w.note_md ? ` Why we are here: ${w.note_md}` : ''}`,
    })
  })
  ;(decisions.data ?? []).forEach((d, i) => {
    corpus.push({
      id: `decision:${i + 1}`,
      label: `Decision, ${day(d.decided_on)}`,
      href: '/decisions',
      text: `${d.title}${d.decided_by_label ? ` (${d.decided_by_label})` : ''}${d.context_md ? ` Context: ${d.context_md}` : ''}`,
    })
  })
  ;(outcomes.data ?? []).forEach((o, i) => {
    corpus.push({
      id: `outcome:${i + 1}`,
      label: `Outcome: ${o.title.slice(0, 40)}`,
      href: '/outcomes',
      text: `${o.title}. From: ${o.baseline_md ?? 'not recorded'}. To: ${o.target_md ?? 'not recorded'}.${o.standing_md ? ` Where it stands: ${o.standing_md}.` : ''}${o.reached_on ? ` Reached ${o.reached_on}.` : ''}`,
    })
  })
  ;(notes.data ?? []).forEach((n, i) => {
    const text = [n.summary_md, n.decisions_md].filter(Boolean).join('\n')
    if (!text) return
    corpus.push({
      id: `note:${i + 1}`,
      label: `Session notes, ${day(n.created_at)}`,
      href: '/sessions',
      text,
    })
  })
  ;(items.data ?? []).forEach((it, i) => {
    corpus.push({
      id: `homework:${i + 1}`,
      label: `Homework: ${it.title.slice(0, 40)}`,
      href: '/homework',
      text: `${it.title}. Status: ${it.status}.${it.due_on ? ` Due ${it.due_on}.` : ''}`,
    })
  })
  ;(ships.data ?? []).forEach((d, i) => {
    corpus.push({
      id: `deliverable:${i + 1}`,
      label: `Deliverable: ${d.title.slice(0, 40)}`,
      href: '/deliverables',
      text: `${d.title}, delivered ${d.delivered_on}.${d.note ? ` ${d.note}` : ''}`,
    })
  })

  return corpus
}

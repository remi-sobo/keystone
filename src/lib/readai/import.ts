import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'
import { logAuditAction } from '@/lib/audit'
import type { Extraction } from '@/lib/extract'
import { matchMeeting, type MatchClient, type MatchSession } from '@/lib/readai/match'
import { proposalFromMeeting, type ReadAiMeeting } from '@/lib/readai/payload'

/**
 * lib/readai/import.ts
 *
 * The one writer of Read AI content into Keystone (specs/keystone-readai.md).
 * SERVER-ONLY: it uses the service role, so every caller must already
 * have proved who it is. The webhook proves it with the URL secret; the
 * practice actions prove it with the membership check. Never import this
 * from the client surface.
 *
 * What lands where:
 *   - the transcript goes to session_transcripts (practice only)
 *   - Read AI's summary and action items become ONE inert ai_proposals
 *     row, reviewed and published through the existing workspace
 *   - nothing reaches a client until a consultant publishes
 *
 * Logs carry ids and outcomes only, never meeting content.
 */

export type ReceiveOutcome =
  | { outcome: 'attached'; meetingRowId: string; sessionId: string }
  | { outcome: 'needs_review'; meetingRowId: string; reason: string }
  | { outcome: 'skipped' }
  | { outcome: 'duplicate' }
  | { outcome: 'error' }

const LOOKAROUND_MS = 36 * 60 * 60 * 1000

/** Receive one meeting from the webhook for a practice already resolved from config. */
export async function receiveReadAiMeeting(
  practiceId: string,
  meeting: ReadAiMeeting
): Promise<ReceiveOutcome> {
  const { data: existing } = await supabaseAdmin
    .from('readai_meetings')
    .select('id')
    .eq('practice_id', practiceId)
    .eq('readai_id', meeting.readaiId)
    .maybeSingle()
  if (existing) return { outcome: 'duplicate' }

  const anchor = meeting.startedAt ?? new Date()
  const [{ data: clientRows }, { data: memberRows }, { data: practiceRows }, { data: sessionRows }] =
    await Promise.all([
      supabaseAdmin.from('clients').select('id').eq('practice_id', practiceId),
      supabaseAdmin.from('client_members').select('client_id, email').eq('practice_id', practiceId),
      supabaseAdmin.from('practice_members').select('email').eq('practice_id', practiceId),
      supabaseAdmin
        .from('sessions')
        .select('id, client_id, engagement_id, starts_at, ends_at')
        .eq('practice_id', practiceId)
        .in('status', ['booked', 'held'])
        .gte('starts_at', new Date(anchor.getTime() - LOOKAROUND_MS).toISOString())
        .lte('starts_at', new Date(anchor.getTime() + LOOKAROUND_MS).toISOString()),
    ])

  const clients: MatchClient[] = (clientRows ?? []).map((c) => ({
    id: c.id as string,
    emails: (memberRows ?? [])
      .filter((m) => m.client_id === c.id)
      .map((m) => String(m.email)),
  }))
  const sessions: MatchSession[] = (sessionRows ?? []).map((s) => ({
    id: s.id as string,
    clientId: s.client_id as string,
    engagementId: s.engagement_id as string,
    startsAt: new Date(s.starts_at as string),
    endsAt: new Date(s.ends_at as string),
  }))
  const practiceEmails = (practiceRows ?? []).map((p) => String(p.email))

  const match = matchMeeting(meeting, clients, sessions, practiceEmails)

  if (match.status === 'skipped') {
    // Not a client call. Keep the fact that it arrived (so a replay is a
    // no-op) and nothing else: no title, no people, no words.
    const { error } = await supabaseAdmin.from('readai_meetings').insert({
      practice_id: practiceId,
      readai_id: meeting.readaiId,
      status: 'skipped',
      match_reason: match.reason,
      started_at: meeting.startedAt?.toISOString() ?? null,
      ended_at: meeting.endedAt?.toISOString() ?? null,
    })
    if (error && error.code !== '23505') {
      console.error('[readai] skip ledger insert failed:', error.code)
      return { outcome: 'error' }
    }
    return error ? { outcome: 'duplicate' } : { outcome: 'skipped' }
  }

  // A client call. Park it first (this claims the readai_id, so a replay
  // cannot double-import), then attach when the match is certain. If
  // the attach fails partway, the meeting is still waiting for review
  // with its content intact; nothing is lost.
  const { data: row, error: insertError } = await supabaseAdmin
    .from('readai_meetings')
    .insert({
      practice_id: practiceId,
      readai_id: meeting.readaiId,
      status: 'needs_review',
      match_reason: match.reason,
      client_id: match.clientId,
      engagement_id: match.status === 'attached' ? match.session.engagementId : match.engagementId,
      started_at: meeting.startedAt?.toISOString() ?? null,
      ended_at: meeting.endedAt?.toISOString() ?? null,
      title: meeting.title,
      report_url: meeting.reportUrl,
      participant_emails: meeting.participantEmails,
      summary_md: meeting.summary || null,
      action_items: meeting.actionItems,
      transcript_text: meeting.transcript || null,
    })
    .select('id')
    .single()
  if (insertError || !row) {
    if (insertError?.code === '23505') return { outcome: 'duplicate' }
    console.error('[readai] intake insert failed:', insertError?.code ?? 'no row')
    return { outcome: 'error' }
  }

  if (match.status === 'needs_review') {
    return { outcome: 'needs_review', meetingRowId: row.id, reason: match.reason }
  }

  const attached = await attachReadAiMeeting({
    practiceId,
    meetingRowId: row.id,
    sessionId: match.session.id,
    actor: null,
  })
  if (!attached.ok) {
    return { outcome: 'needs_review', meetingRowId: row.id, reason: 'attach_failed' }
  }
  return { outcome: 'attached', meetingRowId: row.id, sessionId: match.session.id }
}

/** Sweep Read AI's prose through the voice gate, as every shipped string is. */
function sweepProposal(practiceId: string, p: Extraction): Extraction {
  const sweep = (text: string) => {
    const check = validateVoice(text)
    if (check.ok) return text
    void logVoiceViolation({
      practiceId,
      source: 'readai_import',
      violations: check.violations,
      rawExcerpt: text,
      cleanedExcerpt: check.cleaned,
    })
    return check.cleaned
  }
  return {
    summary_md: sweep(p.summary_md),
    decisions_md: p.decisions_md,
    action_items: p.action_items.map((it) => ({ ...it, title: sweep(it.title) })),
  }
}

/**
 * Attach a waiting meeting to a session: transcript in, an inert
 * proposal made, the waiting copy cleared. Used by the webhook on a
 * certain match and by the consultant's "attach" action otherwise.
 */
export async function attachReadAiMeeting(opts: {
  practiceId: string
  meetingRowId: string
  sessionId: string
  /** The consultant who chose the session, or null for the webhook. */
  actor: { userId: string; email: string } | null
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { practiceId, meetingRowId, sessionId, actor } = opts

  const [{ data: row }, { data: session }] = await Promise.all([
    supabaseAdmin
      .from('readai_meetings')
      .select('id, status, readai_id, summary_md, action_items, transcript_text')
      .eq('id', meetingRowId)
      .eq('practice_id', practiceId)
      .eq('status', 'needs_review')
      .maybeSingle(),
    supabaseAdmin
      .from('sessions')
      .select('id, engagement_id, practice_id, client_id')
      .eq('id', sessionId)
      .eq('practice_id', practiceId)
      .maybeSingle(),
  ])
  if (!row) return { ok: false, reason: 'meeting_gone' }
  if (!session) return { ok: false, reason: 'session_gone' }

  const transcript = (row.transcript_text as string | null) ?? ''
  if (transcript) {
    const { error } = await supabaseAdmin.from('session_transcripts').upsert(
      {
        session_id: session.id,
        engagement_id: session.engagement_id,
        practice_id: session.practice_id,
        client_id: session.client_id,
        body: transcript,
        source: 'readai',
        readai_meeting_id: row.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id' }
    )
    if (error) {
      console.error('[readai] transcript write failed:', error.code)
      return { ok: false, reason: 'transcript_failed' }
    }
  }

  // The review workspace publishes by updating the session's note row,
  // so one must exist. It starts practice-only and stays that way until
  // a consultant publishes.
  const { error: noteError } = await supabaseAdmin.from('session_notes').upsert(
    {
      session_id: session.id,
      engagement_id: session.engagement_id,
      practice_id: session.practice_id,
      client_id: session.client_id,
    },
    { onConflict: 'session_id', ignoreDuplicates: true }
  )
  if (noteError) {
    console.error('[readai] note row failed:', noteError.code)
    return { ok: false, reason: 'note_failed' }
  }

  const draft = proposalFromMeeting({
    readaiId: row.readai_id as string,
    title: null,
    startedAt: null,
    endedAt: null,
    participantEmails: [],
    summary: (row.summary_md as string | null) ?? '',
    actionItems: Array.isArray(row.action_items) ? (row.action_items as string[]) : [],
    transcript: '',
    reportUrl: null,
  })

  let proposalId: string | null = null
  if (draft) {
    const { data: proposal, error } = await supabaseAdmin
      .from('ai_proposals')
      .insert({
        kind: 'extraction',
        engagement_id: session.engagement_id,
        practice_id: session.practice_id,
        client_id: session.client_id,
        session_id: session.id,
        payload: sweepProposal(practiceId, draft),
        model_used: 'read.ai',
      })
      .select('id')
      .single()
    if (error || !proposal) {
      console.error('[readai] proposal insert failed:', error?.code ?? 'no row')
      return { ok: false, reason: 'proposal_failed' }
    }
    proposalId = proposal.id
  }

  const { error: doneError } = await supabaseAdmin
    .from('readai_meetings')
    .update({
      status: 'attached',
      session_id: session.id,
      client_id: session.client_id,
      engagement_id: session.engagement_id,
      proposal_id: proposalId,
      summary_md: null,
      action_items: null,
      transcript_text: null,
      decided_at: new Date().toISOString(),
      decided_by: actor?.userId ?? null,
    })
    .eq('id', row.id)
    .eq('status', 'needs_review')
  if (doneError) {
    console.error('[readai] ledger close failed:', doneError.code)
    return { ok: false, reason: 'ledger_failed' }
  }

  await logAuditAction({
    actorEmail: actor?.email ?? 'readai-webhook',
    practiceId: session.practice_id,
    engagementId: session.engagement_id,
    action: 'readai.attach',
    target: session.id,
    detail: {
      transcript: transcript.length > 0,
      proposal: proposalId !== null,
      items: draft?.action_items.length ?? 0,
    },
  })
  return { ok: true }
}

/** Throw a waiting meeting away: the content is wiped, the id stays so a replay is a no-op. */
export async function discardReadAiMeeting(opts: {
  practiceId: string
  meetingRowId: string
  actor: { userId: string; email: string }
}): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from('readai_meetings')
    .update(
      {
        status: 'discarded',
        title: null,
        report_url: null,
        participant_emails: [],
        summary_md: null,
        action_items: null,
        transcript_text: null,
        decided_at: new Date().toISOString(),
        decided_by: opts.actor.userId,
      },
      { count: 'exact' }
    )
    .eq('id', opts.meetingRowId)
    .eq('practice_id', opts.practiceId)
    .eq('status', 'needs_review')
  if (error) {
    console.error('[readai] discard failed:', error.code)
    return false
  }
  if (count) {
    await logAuditAction({
      actorEmail: opts.actor.email,
      practiceId: opts.practiceId,
      action: 'readai.discard',
      target: opts.meetingRowId,
    })
  }
  return (count ?? 0) > 0
}

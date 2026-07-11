import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * lib/notify.ts (V2 4F)
 *
 * SERVER-ONLY. The one writer of notifications (the qaExchange.ts
 * precedent: service role inside the lib so pure-RLS client actions
 * can emit too; callers verify membership BEFORE the call). Best
 * effort like the audit log: a failed notification must never fail or
 * slow the action it describes. Titles are short facts about the
 * record, composed here or by the caller, never content from walled
 * surfaces (no trail notes, no message bodies, no transcript text).
 */

export type NotificationKind =
  | 'homework_submitted'
  | 'homework_feedback'
  | 'homework_due'
  | 'homework_overdue'
  | 'poll_opened'
  | 'poll_booked'
  | 'deliverable_shipped'
  | 'approval_waiting'
  | 'message_reply'

export interface NotifyRecipient {
  clientMemberId?: string
  practiceMemberId?: string
}

export interface NotifyEvent {
  practiceId: string
  clientId?: string
  engagementId?: string
  kind: NotificationKind
  title: string
  href: string
  dedupeKey?: string
}

/** Emit one event to many recipients; one row each, all best-effort. */
export async function notify(event: NotifyEvent, recipients: NotifyRecipient[]): Promise<void> {
  const rows = recipients
    .filter((r) => Boolean(r.clientMemberId) !== Boolean(r.practiceMemberId))
    .map((r) => ({
      practice_id: event.practiceId,
      client_id: event.clientId ?? null,
      engagement_id: event.engagementId ?? null,
      recipient_client_member_id: r.clientMemberId ?? null,
      recipient_practice_member_id: r.practiceMemberId ?? null,
      kind: event.kind,
      title: event.title.slice(0, 200),
      href: event.href.slice(0, 300),
      // The dedupe key is per recipient, so a reminder lands once per
      // person however many cron runs see the same fact.
      dedupe_key: event.dedupeKey
        ? `${event.dedupeKey}:${r.clientMemberId ?? r.practiceMemberId}`
        : null,
    }))
  if (rows.length === 0) return
  try {
    const { error } = await supabaseAdmin
      .from('notifications')
      .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    if (error) console.error('[notify] emit failed:', error.message)
  } catch (e) {
    console.error('[notify] emit threw:', e instanceof Error ? e.message : 'unknown')
  }
}

/** Every live client member of a client, as recipients. */
export async function clientTeamRecipients(clientId: string): Promise<NotifyRecipient[]> {
  const { data } = await supabaseAdmin
    .from('client_members')
    .select('id')
    .eq('client_id', clientId)
    .is('revoked_at', null)
    .not('user_id', 'is', null)
  return (data ?? []).map((m) => ({ clientMemberId: m.id }))
}

/** Every live practice member of a practice, as recipients. */
export async function practiceTeamRecipients(practiceId: string): Promise<NotifyRecipient[]> {
  const { data } = await supabaseAdmin
    .from('practice_members')
    .select('id')
    .eq('practice_id', practiceId)
    .is('revoked_at', null)
    .not('user_id', 'is', null)
  return (data ?? []).map((m) => ({ practiceMemberId: m.id }))
}

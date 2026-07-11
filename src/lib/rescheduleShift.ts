import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { logAuditAction } from '@/lib/audit'

/**
 * lib/rescheduleShift.ts (V2 3B, gate 3B-2)
 *
 * SERVER-ONLY, the notify.ts precedent: called strictly AFTER the
 * caller's reschedule already succeeded under RLS, which is the proof
 * of scope. A session's before/after homework dates meant "relative to
 * the session"; when the session moves, they move by the same day
 * delta, and the audit log records counts, never titles.
 */
export async function shiftSessionHomework(opts: {
  sessionId: string
  deltaDays: number
  actorEmail: string
}): Promise<void> {
  if (!Number.isInteger(opts.deltaDays) || opts.deltaDays === 0) return
  try {
    const { data: items } = await supabaseAdmin
      .from('action_items')
      .select('id, due_on')
      .eq('session_id', opts.sessionId)
      .in('timing', ['before_session', 'after_session'])
      .eq('status', 'open')
      .not('due_on', 'is', null)
    if (!items || items.length === 0) return

    for (const it of items) {
      const d = new Date(`${it.due_on}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + opts.deltaDays)
      const { error } = await supabaseAdmin
        .from('action_items')
        .update({ due_on: d.toISOString().slice(0, 10) })
        .eq('id', it.id)
      if (error) console.error('[reschedule] due shift failed:', error.message)
    }
    await logAuditAction({
      actorEmail: opts.actorEmail,
      action: 'session.homework_shifted',
      target: opts.sessionId,
      detail: { items: items.length, days: opts.deltaDays },
    })
  } catch (e) {
    console.error('[reschedule] shift threw:', e instanceof Error ? e.message : 'unknown')
  }
}

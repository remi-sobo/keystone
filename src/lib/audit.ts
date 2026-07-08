import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * lib/audit.ts
 *
 * The append-only audit log, copied from Trellis lib/admin/audit.ts.
 * One helper, called from practice-surface routes AFTER the auth gate
 * passes. Best-effort by design: an audit insert must never fail or slow
 * the action it records, so errors are swallowed after a console line
 * with no PII.
 *
 * Discipline for callers (SECURITY.md): `target` is an identifier (an
 * engagement id, a session id, the email of a member row being changed).
 * `detail` is small metadata, WHICH fields changed and the action's
 * parameters. NEVER values: no session notes, no transcript text, no
 * message bodies, no readiness prose.
 *
 * The `audit_log` table ships in the Ring 1 migration: RLS on, zero
 * policies, service role is the only reader and writer.
 */

export interface AuditEntry {
  id: string
  actor_email: string
  action: string
  target: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export async function logAuditAction(opts: {
  actorEmail: string
  action: string
  target?: string | null
  detail?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('audit_log').insert({
      actor_email: opts.actorEmail.toLowerCase(),
      action: opts.action,
      target: opts.target ?? null,
      detail: opts.detail ?? null,
    })
    if (error) console.error('[audit] insert failed:', error.message)
  } catch (e) {
    console.error('[audit] insert threw:', e instanceof Error ? e.message : 'unknown')
  }
}

/** Read the most recent audit entries for a read-only feed. */
export async function listAuditEntries(
  limit = 200
): Promise<{ entries: AuditEntry[]; error: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) return { entries: [], error: error.message }
    return { entries: (data ?? []) as AuditEntry[], error: '' }
  } catch (e) {
    return { entries: [], error: e instanceof Error ? e.message : 'Audit read failed' }
  }
}

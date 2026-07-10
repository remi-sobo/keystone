import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmail } from '@/lib/email'
import { buildInviteEmail } from '@/lib/inviteEmail'
import { logAuditAction } from '@/lib/audit'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'

/**
 * lib/inviteSend.ts
 *
 * The one rate-limited path that turns a pending membership row into a
 * sent invite email. Used by the members page (1A) and the builder's
 * publish (1B) so both surfaces share the limits, the designed
 * artifact, the honest failure contract, and the audit line.
 *
 * SERVER-ONLY: touches the service role. Callers verify membership
 * BEFORE calling (service-role-after-check); this helper only stamps
 * last_invite_sent_at on a row inside the caller's own practice.
 */

export type InviteSendResult = 'sent' | 'slow' | 'failed'

export async function sendMembershipInvite(opts: {
  side: 'practice' | 'client'
  rowId: string
  email: string
  practiceId: string
  practiceName: string
  clientName?: string
  /** The inviter: reply-to on the email and the audit actor. */
  actorEmail: string
}): Promise<InviteSendResult> {
  const limited = await checkRateLimits([
    { config: LIMITS.INVITE_SEND_PER_TARGET, key: opts.rowId },
    { config: LIMITS.INVITE_SEND_PER_HOUR, key: opts.practiceId },
  ])
  if (!limited.ok) return 'slow'

  const mail = buildInviteEmail({
    side: opts.side,
    email: opts.email,
    practiceName: opts.practiceName,
    clientName: opts.clientName,
  })
  // Reply-to the inviter (CONFIRM 1A-3): a confused invitee lands with
  // a person, never a noreply void.
  const result = await sendEmail({
    to: opts.email,
    subject: mail.subject,
    html: mail.html,
    replyTo: opts.actorEmail || undefined,
  })
  if (!result.ok) return 'failed'

  const table = opts.side === 'practice' ? 'practice_members' : 'client_members'
  await supabaseAdmin
    .from(table)
    .update({ last_invite_sent_at: new Date().toISOString() })
    .eq('id', opts.rowId)
    .eq('practice_id', opts.practiceId)
  await logAuditAction({
    actorEmail: opts.actorEmail,
    action: 'members.invite_sent',
    target: opts.email,
    detail: { side: opts.side, row: opts.rowId },
  })
  return 'sent'
}

'use server'

import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { appBaseUrl, emailShell, escapeHtml, sendEmail } from '@/lib/email'

/**
 * The help FAB, report half (specs/keystone-v2-help-fab.md). Pure RLS
 * end to end, mirroring the Ring 5 client message send: resolve the
 * viewer and the active engagement on the session, rate-limit, insert on
 * the session client (the issue_reports insert policy is the wall,
 * demanding self-authorship on the client side inside the caller's own
 * scope), then email the practice owners with targets from
 * keystone_message_notify_targets, the minimal-disclosure RPC, because
 * this surface cannot and must not read practice_members. A failed email
 * is said out loud; the report itself still stands. No supabaseAdmin in
 * this file, enforced by the no-service-role gate.
 */

export type ReportKind = 'bug' | 'confusing' | 'idea'

export type ReportResult =
  | { ok: true; emailed: boolean }
  | { ok: false; error: 'invalid' | 'slow' | 'no_engagement' | 'error' }

const KIND_LABEL: Record<ReportKind, string> = {
  bug: 'Something is broken',
  confusing: 'Something is confusing',
  idea: 'An idea',
}

const ReportShape = z.object({
  kind: z.enum(['bug', 'confusing', 'idea']),
  body: z.string().trim().min(1).max(4000),
})

export async function reportIssue(input: { kind: string; body: string }): Promise<ReportResult> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) return { ok: false, error: 'error' }

  const parsed = ReportShape.safeParse({ kind: input.kind, body: input.body })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const limited = await checkRateLimits([
    { config: LIMITS.ISSUE_REPORTS_PER_MIN, key: viewer.user.id },
    { config: LIMITS.ISSUE_REPORTS_PER_HOUR, key: viewer.user.id },
  ])
  if (!limited.ok) return { ok: false, error: 'slow' }

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, practice_id, client_id')
    .eq('client_id', viewer.client.clientId)
    .in('status', ['active', 'proposed', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!engagement) return { ok: false, error: 'no_engagement' }

  const { error } = await supabase.from('issue_reports').insert({
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    kind: parsed.data.kind,
    body: parsed.data.body,
    reported_side: 'client',
    created_by: viewer.user.id,
  })
  if (error) {
    console.error('[report] file failed:', error.message)
    return { ok: false, error: 'error' }
  }

  // Email the practice owners. The report stands either way; a failed
  // email is reported, never papered over. Targets come from the RPC,
  // not a table read, so this surface never touches practice_members.
  const { data: targets } = await supabase.rpc('keystone_message_notify_targets', {
    p_engagement: engagement.id,
  })
  const link = `${appBaseUrl()}/engagements/${engagement.id}`
  const excerpt = parsed.data.body.slice(0, 400)
  const html = emailShell({
    eyebrow: `${viewer.client.clientName} reported an issue`,
    bodyHtml: [
      `<p style="margin:0 0 12px 0;">${escapeHtml(KIND_LABEL[parsed.data.kind])}, on ${escapeHtml(engagement.title)}:</p>`,
      `<blockquote style="margin:0;padding:0 0 0 12px;border-left:2px solid #8A6A26;color:#1C1914;">${escapeHtml(excerpt)}</blockquote>`,
    ].join('\n'),
    cta: { href: link, label: 'Open the engagement in Keystone' },
  })

  let emailed = (targets ?? []).length > 0
  for (const t of (targets ?? []) as Array<{ email: string }>) {
    const result = await sendEmail({
      to: t.email,
      subject: `${viewer.client.clientName} reported an issue`,
      html,
      replyTo: viewer.user.email ?? undefined,
    })
    if (!result.ok) {
      emailed = false
      console.error('[report] notify failed:', result.status, result.detail)
    }
  }

  return { ok: true, emailed }
}

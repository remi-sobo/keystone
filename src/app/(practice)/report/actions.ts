'use server'

import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { appBaseUrl, emailShell, escapeHtml, sendEmail } from '@/lib/email'

/**
 * The practice-side report (specs/keystone-v2-help-fab.md, owner-only
 * follow-up). A consultant (or the owner) files a system issue that has
 * no client and no engagement; it comes to the owner. Resolve the
 * practice member on the session, rate-limit, insert on the session
 * client (the issue_reports insert policy admits a practice member on
 * the practice wall, as themselves), then email the owners with targets
 * from keystone_issue_notify_targets, the practice-caller twin of the
 * message notify RPC. The report reaches the owner; the consultant
 * cannot read the list back (issue.read is the owner's alone). The
 * honest email degrade is preserved.
 */

export type ReportKind = 'bug' | 'confusing' | 'idea'

export type ReportResult =
  | { ok: true; emailed: boolean }
  | { ok: false; error: 'invalid' | 'slow' | 'error' }

const KIND_LABEL: Record<ReportKind, string> = {
  bug: 'Something is broken',
  confusing: 'Something is confusing',
  idea: 'An idea',
}

const ReportShape = z.object({
  kind: z.enum(['bug', 'confusing', 'idea']),
  body: z.string().trim().min(1).max(4000),
})

export async function reportPracticeIssue(input: {
  kind: string
  body: string
}): Promise<ReportResult> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) return { ok: false, error: 'error' }

  const parsed = ReportShape.safeParse({ kind: input.kind, body: input.body })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const limited = await checkRateLimits([
    { config: LIMITS.ISSUE_REPORTS_PER_MIN, key: viewer.user.id },
    { config: LIMITS.ISSUE_REPORTS_PER_HOUR, key: viewer.user.id },
  ])
  if (!limited.ok) return { ok: false, error: 'slow' }

  const practiceId = viewer.practice.practiceId
  const supabase = await createServerSupabase()

  // No client, no engagement: a practice-authored report carries
  // practice_id alone (the scope-shape check allows it).
  const { error } = await supabase.from('issue_reports').insert({
    practice_id: practiceId,
    engagement_id: null,
    client_id: null,
    kind: parsed.data.kind,
    body: parsed.data.body,
    reported_side: 'practice',
    created_by: viewer.user.id,
  })
  if (error) {
    console.error('[report] practice file failed:', error.message)
    return { ok: false, error: 'error' }
  }

  const { data: targets } = await supabase.rpc('keystone_issue_notify_targets', {
    p_practice: practiceId,
  })
  const reporter = viewer.user.email?.split('@')[0] ?? 'a teammate'
  const excerpt = parsed.data.body.slice(0, 400)
  const html = emailShell({
    eyebrow: `${reporter} reported an issue`,
    bodyHtml: [
      `<p style="margin:0 0 12px 0;">${escapeHtml(KIND_LABEL[parsed.data.kind])}, from your team:</p>`,
      `<blockquote style="margin:0;padding:0 0 0 12px;border-left:2px solid #8A6A26;color:#1C1914;">${escapeHtml(excerpt)}</blockquote>`,
    ].join('\n'),
    cta: { href: `${appBaseUrl()}/issues`, label: 'Open Reported issues in Keystone' },
  })

  let emailed = (targets ?? []).length > 0
  for (const t of (targets ?? []) as Array<{ email: string }>) {
    const result = await sendEmail({
      to: t.email,
      subject: `${reporter} reported an issue`,
      html,
      replyTo: viewer.user.email ?? undefined,
    })
    if (!result.ok) {
      emailed = false
      console.error('[report] practice notify failed:', result.status, result.detail)
    }
  }

  return { ok: true, emailed }
}

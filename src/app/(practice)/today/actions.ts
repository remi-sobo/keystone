'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
import { appBaseUrl, sendEmail } from '@/lib/email'
import { logAuditAction } from '@/lib/audit'

/**
 * The digest decision (Ring 6): the single human path from an inert
 * digest proposal to a digests row and an email. Approve writes the
 * record through the service role strictly after the membership check,
 * then sends the branded email to every client member, one recipient
 * per call, and reports a failed send honestly (the digest stays
 * 'approved', never falsely 'sent').
 */

const DecideShape = z.object({
  proposalId: z.string().uuid(),
  decision: z.enum(['approve', 'dismiss']),
})

function digestHtml(draft: string, clientName: string): string {
  const paragraphs = draft
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${p.replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`)
    .join('\n')
  return [
    `<div style="max-width:560px;margin:0 auto;padding:24px;background:#FBF4EA;color:#2A2620;font-family:Georgia,serif;">`,
    `<p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6E675C;margin:0 0 18px 0;">Keystone / weekly digest / ${clientName}</p>`,
    paragraphs,
    `<p style="margin:18px 0 0 0;"><a href="${appBaseUrl()}/home" style="color:#33503C;">See the full picture in Keystone</a></p>`,
    `</div>`,
  ].join('\n')
}

export async function decideDigest(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')

  const parsed = DecideShape.safeParse({
    proposalId: formData.get('proposalId'),
    decision: formData.get('decision'),
  })
  if (!parsed.success) redirect('/today?state=digest_invalid')
  const practiceId = viewer.practice!.practiceId

  const { data: proposal } = await supabaseAdmin
    .from('ai_proposals')
    .select('id, kind, payload, status, engagement_id, practice_id, client_id')
    .eq('id', parsed.data.proposalId)
    .eq('practice_id', practiceId)
    .eq('kind', 'digest')
    .eq('status', 'proposed')
    .maybeSingle()
  if (!proposal) redirect('/today?state=digest_gone')

  if (parsed.data.decision === 'dismiss') {
    await supabaseAdmin
      .from('ai_proposals')
      .update({ status: 'dismissed', decided_at: new Date().toISOString(), decided_by: viewer.user!.id })
      .eq('id', proposal.id)
    await logAuditAction({
      actorEmail: viewer.user!.email ?? '',
      action: 'digest.dismiss',
      target: proposal.id,
    })
    revalidatePath('/today')
    redirect('/today?state=digest_dismissed')
  }

  const payload = proposal.payload as { week_of: string; subject: string; draft_md: string }
  const supabase = await createServerSupabase()
  const [{ data: client }, { data: roster }] = await Promise.all([
    supabase.from('clients').select('name').eq('id', proposal.client_id).maybeSingle(),
    supabase.from('client_members').select('email').eq('client_id', proposal.client_id),
  ])

  // The record first (unique per engagement and week), then the sends.
  const { data: digestRow, error: digestError } = await supabaseAdmin
    .from('digests')
    .insert({
      engagement_id: proposal.engagement_id,
      practice_id: proposal.practice_id,
      client_id: proposal.client_id,
      week_of: payload.week_of,
      subject: payload.subject,
      draft_md: payload.draft_md,
      status: 'approved',
      proposal_id: proposal.id,
      approved_by: viewer.user!.id,
    })
    .select('id')
    .maybeSingle()
  if (digestError || !digestRow) {
    console.error('[digest] record insert failed:', digestError?.message)
    redirect('/today?state=digest_failed')
  }

  await supabaseAdmin
    .from('ai_proposals')
    .update({ status: 'accepted', decided_at: new Date().toISOString(), decided_by: viewer.user!.id })
    .eq('id', proposal.id)

  // One recipient per call, per the platform email contract.
  const html = digestHtml(payload.draft_md, client?.name ?? 'your team')
  let allSent = (roster ?? []).length > 0
  for (const m of roster ?? []) {
    const result = await sendEmail({
      to: m.email,
      subject: payload.subject,
      html,
      replyTo: viewer.user!.email ?? undefined,
    })
    if (!result.ok) {
      allSent = false
      console.error('[digest] send failed:', result.status, result.detail)
    }
  }
  if (allSent) {
    await supabaseAdmin
      .from('digests')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', digestRow.id)
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'digest.approve',
    target: proposal.id,
    detail: { week_of: payload.week_of, recipients: (roster ?? []).length, sent: allSent },
  })

  revalidatePath('/today')
  redirect(allSent ? '/today?state=digest_sent' : '/today?state=digest_no_email')
}

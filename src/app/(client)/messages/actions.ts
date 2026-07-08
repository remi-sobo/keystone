'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { appBaseUrl, sendEmail } from '@/lib/email'

/**
 * Client message send (Ring 5). Pure RLS end to end: the thread and the
 * message ride the session client (the insert policy demands the author
 * be the caller, on the client side of the wall, inside their own
 * scope). The notification email to the practice owners gets its
 * targets from keystone_message_notify_targets, the minimal-disclosure
 * RPC, because this surface cannot read practice_members and must not.
 * A failed email is said out loud; the message itself still stands.
 */

const SendShape = z.object({ body: z.string().min(1).max(8000) })

export async function sendMessage(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const parsed = SendShape.safeParse({ body: formData.get('body') })
  if (!parsed.success) redirect('/messages?state=invalid')

  const limited = await checkRateLimits([
    { config: LIMITS.MESSAGES_PER_MIN, key: viewer.user!.id },
    { config: LIMITS.MESSAGES_PER_HOUR, key: viewer.user!.id },
  ])
  if (!limited.ok) redirect('/messages?state=slow')

  const supabase = await createServerSupabase()
  const { data: engagement } = await supabase
    .from('engagements')
    .select('id, title, practice_id, client_id')
    .eq('client_id', viewer.client!.clientId)
    .in('status', ['active', 'proposed', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!engagement) redirect('/messages?state=no_engagement')

  // One thread per engagement: open it if this is the first word.
  let { data: thread } = await supabase
    .from('message_threads')
    .select('id')
    .eq('engagement_id', engagement.id)
    .maybeSingle()
  if (!thread) {
    const { data: created, error: threadError } = await supabase
      .from('message_threads')
      .insert({
        engagement_id: engagement.id,
        practice_id: engagement.practice_id,
        client_id: engagement.client_id,
      })
      .select('id')
      .maybeSingle()
    if (threadError && threadError.code !== '23505') {
      console.error('[messages] thread open failed:', threadError.message)
      redirect('/messages?state=error')
    }
    thread =
      created ??
      (await supabase.from('message_threads').select('id').eq('engagement_id', engagement.id).maybeSingle())
        .data
  }
  if (!thread) redirect('/messages?state=error')

  const { error } = await supabase.from('messages').insert({
    thread_id: thread.id,
    engagement_id: engagement.id,
    practice_id: engagement.practice_id,
    client_id: engagement.client_id,
    author_user_id: viewer.user!.id,
    author_side: 'client',
    body: parsed.data.body,
  })
  if (error) {
    console.error('[messages] send failed:', error.message)
    redirect('/messages?state=error')
  }
  await supabase
    .from('message_threads')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', thread.id)

  // Notify the practice owners. The message stands either way; a failed
  // email is reported, never papered over.
  const { data: targets } = await supabase.rpc('keystone_message_notify_targets', {
    p_engagement: engagement.id,
  })
  const senderName = viewer.user!.email?.split('@')[0] ?? 'your client'
  const link = `${appBaseUrl()}/engagements/${engagement.id}#messages`
  const excerpt = parsed.data.body.slice(0, 200)
  let allSent = (targets ?? []).length > 0
  for (const t of (targets ?? []) as Array<{ email: string }>) {
    const result = await sendEmail({
      to: t.email,
      subject: `New message from ${viewer.client!.clientName}`,
      html: [
        `<p><strong>${senderName}</strong> wrote on ${engagement.title}:</p>`,
        `<blockquote>${excerpt.replace(/</g, '&lt;')}</blockquote>`,
        `<p><a href="${link}">Read and reply in Keystone</a></p>`,
      ].join('\n'),
      replyTo: viewer.user!.email ?? undefined,
    })
    if (!result.ok) {
      allSent = false
      console.error('[messages] notify failed:', result.status, result.detail)
    }
  }

  revalidatePath('/messages')
  redirect(allSent ? '/messages?state=sent' : '/messages?state=sent_no_email')
}

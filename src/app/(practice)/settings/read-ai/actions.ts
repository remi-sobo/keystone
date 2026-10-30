'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getViewer } from '@/lib/membership'
import { attachReadAiMeeting, discardReadAiMeeting } from '@/lib/readai/import'

/**
 * Read AI inbox actions (specs/keystone-readai.md). Practice surface,
 * service-role-after-check: the viewer must be a practice member, and
 * the practice id comes from the viewer, never the form. Both the
 * meeting row and the chosen session are re-loaded scoped to that
 * practice inside lib/readai/import.ts before anything is written.
 */

const PAGE = '/settings/read-ai'

const AttachShape = z.object({
  meetingId: z.string().uuid(),
  sessionId: z.string().uuid(),
})
const DiscardShape = z.object({ meetingId: z.string().uuid() })

async function guard() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  return {
    practiceId: viewer.practice.practiceId,
    actor: { userId: viewer.user.id, email: viewer.user.email ?? '' },
  }
}

export async function attachMeeting(formData: FormData): Promise<void> {
  const { practiceId, actor } = await guard()
  const parsed = AttachShape.safeParse({
    meetingId: formData.get('meetingId'),
    sessionId: formData.get('sessionId'),
  })
  if (!parsed.success) redirect(`${PAGE}?state=pick_session`)

  const result = await attachReadAiMeeting({
    practiceId,
    meetingRowId: parsed.data.meetingId,
    sessionId: parsed.data.sessionId,
    actor,
  })
  if (!result.ok) redirect(`${PAGE}?state=attach_failed`)
  revalidatePath(PAGE)
  redirect(`/sessions/${parsed.data.sessionId}/notes?state=readai_attached`)
}

export async function discardMeeting(formData: FormData): Promise<void> {
  const { practiceId, actor } = await guard()
  const parsed = DiscardShape.safeParse({ meetingId: formData.get('meetingId') })
  if (!parsed.success) redirect(PAGE)

  const ok = await discardReadAiMeeting({ practiceId, meetingRowId: parsed.data.meetingId, actor })
  revalidatePath(PAGE)
  redirect(`${PAGE}?state=${ok ? 'discarded' : 'gone'}`)
}

'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { assembleSlots } from '@/lib/slotAssembly'
import { isOfferedSlot } from '@/lib/scheduling'
import { shiftSessionHomework } from '@/lib/rescheduleShift'

/**
 * Booking actions (client surface, PURE RLS). Every write goes through
 * the session client: the sessions insert/update policies plus the
 * session.book permission are the wall, and the sessions_no_overlap
 * exclusion constraint is the hard backstop against a just-taken slot.
 * A hand-crafted POST cannot book outside availability because the
 * requested start must match a server-recomputed offered slot.
 */

const BookShape = z.object({ start: z.string().datetime() })
const SessionRef = z.object({ id: z.string().uuid() })

async function guard() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')
  const limited = await checkRateLimits([
    { config: LIMITS.BOOKING_PER_MIN, key: viewer.user.id },
    { config: LIMITS.BOOKING_PER_HOUR, key: viewer.user.id },
  ])
  if (!limited.ok) redirect('/sessions?state=slow')
  return viewer
}

export async function bookSession(formData: FormData): Promise<void> {
  const viewer = await guard()
  const parsed = BookShape.safeParse({ start: formData.get('start') })
  if (!parsed.success) redirect('/sessions?state=invalid')

  const supabase = await createServerSupabase()
  const client = viewer.client!

  const { data: engagement } = await supabase
    .from('engagements')
    .select('id')
    .eq('client_id', client.clientId)
    .in('status', ['active', 'proposed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!engagement) redirect('/sessions?state=no_engagement')

  const slots = await assembleSlots(supabase, client, new Date())
  const slot = isOfferedSlot(slots, new Date(parsed.data.start))
  if (!slot) redirect('/sessions?state=slot_gone')

  const { error } = await supabase.from('sessions').insert({
    engagement_id: engagement.id,
    practice_id: client.practiceId,
    client_id: client.clientId,
    starts_at: slot.startsAt.toISOString(),
    ends_at: slot.endsAt.toISOString(),
    tz: slot.tz,
    kind: 'working',
    status: 'booked',
    created_by: viewer.user!.id,
  })
  if (error) {
    // 23P01: the exclusion constraint caught a race on a taken slot.
    const gone = error.code === '23P01'
    console.error('[sessions] booking failed:', error.code)
    redirect(gone ? '/sessions?state=slot_gone' : '/sessions?state=error')
  }
  revalidatePath('/sessions')
  revalidatePath('/home')
  redirect('/sessions?state=booked')
}

export async function rescheduleSession(formData: FormData): Promise<void> {
  const viewer = await guard()
  const ref = SessionRef.safeParse({ id: formData.get('id') })
  const parsed = BookShape.safeParse({ start: formData.get('start') })
  if (!ref.success || !parsed.success) redirect('/sessions?state=invalid')

  const note = String(formData.get('note') ?? '').trim().slice(0, 300) || null

  const supabase = await createServerSupabase()
  const client = viewer.client!

  // The old date first, so the homework delta is honest (gate 3B-2).
  const { data: before } = await supabase
    .from('sessions')
    .select('starts_at')
    .eq('id', ref.data.id)
    .eq('client_id', client.clientId)
    .eq('status', 'booked')
    .maybeSingle()
  if (!before) redirect('/sessions?state=invalid')

  const slots = await assembleSlots(supabase, client, new Date())
  const slot = isOfferedSlot(slots, new Date(parsed.data.start))
  if (!slot) redirect('/sessions?state=slot_gone')

  // RLS scopes the update; the client filter is belt and suspenders.
  // The column grant (0021) admits exactly these reschedule verbs.
  const { error } = await supabase
    .from('sessions')
    .update({
      starts_at: slot.startsAt.toISOString(),
      ends_at: slot.endsAt.toISOString(),
      tz: slot.tz,
      reschedule_note: note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ref.data.id)
    .eq('client_id', client.clientId)
    .eq('status', 'booked')
  if (error) {
    const gone = error.code === '23P01'
    console.error('[sessions] reschedule failed:', error.code)
    redirect(gone ? '/sessions?state=slot_gone' : '/sessions?state=error')
  }

  // The session moved and RLS proved the scope; its relative homework
  // dates move by the same day delta (the lib audits counts only).
  const deltaDays = Math.round(
    (Date.parse(slot.startsAt.toISOString().slice(0, 10)) -
      Date.parse(before.starts_at.slice(0, 10))) /
      86400000
  )
  await shiftSessionHomework({
    sessionId: ref.data.id,
    deltaDays,
    actorEmail: viewer.user!.email ?? '',
  })

  revalidatePath('/sessions')
  revalidatePath('/home')
  revalidatePath('/homework')
  redirect('/sessions?state=rescheduled')
}

export async function cancelSession(formData: FormData): Promise<void> {
  const viewer = await guard()
  const ref = SessionRef.safeParse({ id: formData.get('id') })
  if (!ref.success) redirect('/sessions?state=invalid')

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('sessions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('id', ref.data.id)
    .eq('client_id', viewer.client!.clientId)
    .eq('status', 'booked')
  if (error) {
    console.error('[sessions] cancel failed:', error.code)
    redirect('/sessions?state=error')
  }
  revalidatePath('/sessions')
  revalidatePath('/home')
  redirect('/sessions?state=canceled')
}

// ── The date poll (V2 3H): mark and unmark, pure RLS ─────────────────
// The one client write on polls. The insert policy demands your own
// membership, your own client's open poll, and scope columns matching
// the parent option; the delete policy admits only your own mark while
// the poll is open. Toggling is honest here: this is coordination, not
// a record.

const MarkShape = z.object({ optionId: z.string().uuid() })

export async function togglePollMark(formData: FormData): Promise<void> {
  const viewer = await guard()
  const parsed = MarkShape.safeParse({ optionId: formData.get('optionId') })
  if (!parsed.success) redirect('/sessions')
  const { optionId } = parsed.data
  const client = viewer.client!

  const supabase = await createServerSupabase()
  const [{ data: option }, { data: me }] = await Promise.all([
    supabase
      .from('session_poll_options')
      .select('id, poll_id, engagement_id, practice_id, client_id')
      .eq('id', optionId)
      .eq('client_id', client.clientId)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('id')
      .eq('user_id', viewer.user!.id)
      .eq('client_id', client.clientId)
      .maybeSingle(),
  ])
  if (!option || !me) redirect('/sessions')

  const { data: existing } = await supabase
    .from('session_poll_marks')
    .select('id')
    .eq('option_id', option.id)
    .eq('client_member_id', me.id)
    .maybeSingle()

  const { error } = existing
    ? await supabase.from('session_poll_marks').delete().eq('id', existing.id)
    : await supabase.from('session_poll_marks').insert({
        option_id: option.id,
        poll_id: option.poll_id,
        engagement_id: option.engagement_id,
        practice_id: option.practice_id,
        client_id: option.client_id,
        client_member_id: me.id,
      })
  if (error) {
    console.error('[polls] mark toggle failed:', error.code)
    redirect('/sessions?state=error')
  }
  revalidatePath('/sessions')
  redirect('/sessions')
}

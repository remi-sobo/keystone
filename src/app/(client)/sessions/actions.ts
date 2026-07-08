'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { assembleSlots } from './slots'
import { isOfferedSlot } from '@/lib/scheduling'

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

  const supabase = await createServerSupabase()
  const client = viewer.client!

  const slots = await assembleSlots(supabase, client, new Date())
  const slot = isOfferedSlot(slots, new Date(parsed.data.start))
  if (!slot) redirect('/sessions?state=slot_gone')

  // RLS scopes the update; the client filter is belt and suspenders.
  const { error } = await supabase
    .from('sessions')
    .update({
      starts_at: slot.startsAt.toISOString(),
      ends_at: slot.endsAt.toISOString(),
      tz: slot.tz,
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
  revalidatePath('/sessions')
  revalidatePath('/home')
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

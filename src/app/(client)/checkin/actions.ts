'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'

/**
 * The confidence check-in submit (PURE RLS). One write: every answer
 * for the check-in in a single insert, so the submission is atomic.
 * The walls live in the database, not here: the insert policy demands
 * self-authorship, named participation, an open check-in, and the
 * right answer shape per item; the unique key blocks resubmission.
 * A founder or teammate reaches this action and writes zero rows.
 */

const Shape = z.object({ checkinId: z.string().uuid() })

export async function submitCheckin(formData: FormData): Promise<void> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const parsed = Shape.safeParse({ checkinId: formData.get('checkinId') })
  if (!parsed.success) redirect('/home')
  const { checkinId } = parsed.data

  const supabase = await createServerSupabase()

  // The check-in is readable only by a participant of its engagement
  // (or the practice); an invisible row ends the flow right here.
  const [{ data: checkin }, { data: me }] = await Promise.all([
    supabase
      .from('confidence_checkins')
      .select('id, engagement_id, practice_id, client_id, label, opens_at')
      .eq('id', checkinId)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('id')
      .eq('user_id', viewer.user.id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
  ])
  if (!checkin || !me) redirect('/home')
  if (checkin.opens_at > new Date().toISOString().slice(0, 10)) redirect('/home')

  const { data: items } = await supabase
    .from('confidence_items')
    .select('id, kind')
    .eq('engagement_id', checkin.engagement_id)
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (!items || items.length === 0) redirect('/home')

  // Already submitted: the quiet done state, never a double write.
  const { count: existing } = await supabase
    .from('confidence_responses')
    .select('id', { count: 'exact', head: true })
    .eq('checkin_id', checkin.id)
    .eq('client_member_id', me.id)
  if ((existing ?? 0) > 0) redirect(`/checkin/${checkin.id}?state=done`)

  const rows: Array<{
    checkin_id: string
    item_id: string
    engagement_id: string
    practice_id: string
    client_id: string
    client_member_id: string
    score: number | null
    text_answer: string | null
  }> = []

  for (const item of items) {
    const scope = {
      checkin_id: checkin.id,
      item_id: item.id,
      engagement_id: checkin.engagement_id,
      practice_id: checkin.practice_id,
      client_id: checkin.client_id,
      client_member_id: me.id,
    }
    if (item.kind === 'scale') {
      const raw = String(formData.get(`score_${item.id}`) ?? '')
      const score = Number.parseInt(raw, 10)
      // Every scale item wants an honest answer; a hole means go back.
      if (!Number.isInteger(score) || score < 0 || score > 10) {
        redirect(`/checkin/${checkin.id}?state=incomplete`)
      }
      rows.push({ ...scope, score, text_answer: null })
    } else {
      const text = String(formData.get(`text_${item.id}`) ?? '')
        .trim()
        .slice(0, 4000)
      // The open questions are optional; an empty box writes nothing.
      if (text) rows.push({ ...scope, score: null, text_answer: text })
    }
  }

  // One insert, one transaction: all answers land together or not at
  // all. A concurrent double submit loses to the unique key.
  const { error } = await supabase.from('confidence_responses').insert(rows)
  if (error) {
    if (error.code === '23505') redirect(`/checkin/${checkin.id}?state=done`)
    console.error('[checkin] submit failed:', error.code)
    redirect(`/checkin/${checkin.id}?state=error`)
  }

  revalidatePath('/home')
  revalidatePath(`/checkin/${checkin.id}`)
  redirect(`/checkin/${checkin.id}?state=saved`)
}

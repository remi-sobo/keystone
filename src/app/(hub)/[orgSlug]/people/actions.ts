'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { checkRateLimits } from '@/lib/rateLimit'
import { fiscalYearOf } from '@/lib/hubFigures'

/**
 * PEOPLE's server actions (specs/epayl-fundraising-hub.md, phase two).
 * Pure RLS end to end: every read and write here runs on the caller's
 * own session, so the member's rights ARE the parser's rights and a
 * bug in this file cannot reach another org's rows. No service role
 * exists anywhere beneath the hub surface (CI-guarded).
 *
 * The upload and import actions live in ../uploads.ts, the org's one
 * upload path; these are the people-side writes.
 */

const WRITE_PER_MIN = { kind: 'hub:write:min', windowMs: 60 * 1000, max: 30 }


function peoplePath(orgSlug: string): string {
  return `/${orgSlug}/people`
}






const HouseholdShape = z.object({
  household: z.string().trim().min(1).max(200),
  greeting: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(200).optional().or(z.literal('')),
  phone: z.string().trim().max(60).optional(),
  city: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
})

export async function addHousehold(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const limited = await checkRateLimits([{ config: WRITE_PER_MIN, key: hub.orgId }])
  if (!limited.ok) redirect(`${peoplePath(orgSlug)}?state=slow`)
  const parsed = HouseholdShape.safeParse({
    household: formData.get('household'),
    greeting: formData.get('greeting') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    city: formData.get('city') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  })
  if (!parsed.success) redirect(`${peoplePath(orgSlug)}?state=invalid`)
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('hub_donors')
    .insert({
      org_id: hub.orgId,
      practice_id: hub.practiceId,
      household: parsed.data.household,
      greeting: parsed.data.greeting || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      city: parsed.data.city || null,
      notes: parsed.data.notes || null,
      status: 'prospect',
      source: 'manual',
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[hub people] add failed:', error?.message)
    redirect(`${peoplePath(orgSlug)}?state=error`)
  }
  revalidatePath(peoplePath(orgSlug))
  redirect(`${peoplePath(orgSlug)}/${data.id}`)
}

export async function saveNotes(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const donorId = z.string().uuid().safeParse(formData.get('donor_id'))
  const notes = z.string().max(8000).safeParse(formData.get('notes') ?? '')
  if (!donorId.success || !notes.success) redirect(peoplePath(orgSlug))
  const supabase = await createServerSupabase()
  await supabase
    .from('hub_donors')
    .update({ notes: notes.data.trim() || null })
    .eq('org_id', hub.orgId)
    .eq('id', donorId.data)
  revalidatePath(`${peoplePath(orgSlug)}/${donorId.data}`)
  redirect(`${peoplePath(orgSlug)}/${donorId.data}?state=saved`)
}

export async function addNextMove(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const donorId = z.string().uuid().safeParse(formData.get('donor_id'))
  const title = z.string().trim().min(1).max(300).safeParse(formData.get('title'))
  const why = z.string().trim().max(1000).safeParse(formData.get('why') ?? '')
  if (!donorId.success || !title.success || !why.success) redirect(peoplePath(orgSlug))
  const supabase = await createServerSupabase()
  // The do-not-contact trigger refuses this at the database for a
  // flagged household; the surface hides the form too, but the wall
  // is the trigger, not the hiding.
  const { error } = await supabase.from('hub_tasks').insert({
    org_id: hub.orgId,
    practice_id: hub.practiceId,
    donor_id: donorId.data,
    title: title.data,
    why: why.data || null,
    source: 'manual',
  })
  revalidatePath(`${peoplePath(orgSlug)}/${donorId.data}`)
  redirect(
    `${peoplePath(orgSlug)}/${donorId.data}${error ? '?state=refused' : '?state=saved'}`
  )
}

export async function completeTask(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const taskId = z.string().uuid().safeParse(formData.get('task_id'))
  const donorId = z.string().uuid().safeParse(formData.get('donor_id'))
  if (!taskId.success) redirect(peoplePath(orgSlug))
  const supabase = await createServerSupabase()
  await supabase
    .from('hub_tasks')
    .update({ done_at: new Date().toISOString() })
    .eq('org_id', hub.orgId)
    .eq('id', taskId.data)
    .is('done_at', null)
  const back = donorId.success
    ? `${peoplePath(orgSlug)}/${donorId.data}`
    : peoplePath(orgSlug)
  revalidatePath(back)
  redirect(back)
}

const GiftShape = z.object({
  donor_id: z.string().uuid(),
  amount: z.coerce.number().positive().max(100_000_000),
  gift_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(['cash', 'pledged']),
  designation: z.string().trim().max(200).optional(),
})

export async function logGift(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const limited = await checkRateLimits([{ config: WRITE_PER_MIN, key: hub.orgId }])
  if (!limited.ok) redirect(`${peoplePath(orgSlug)}?state=slow`)
  const parsed = GiftShape.safeParse({
    donor_id: formData.get('donor_id'),
    amount: formData.get('amount'),
    gift_date: formData.get('gift_date'),
    kind: formData.get('kind'),
    designation: formData.get('designation') ?? undefined,
  })
  if (!parsed.success) redirect(`${peoplePath(orgSlug)}?state=invalid`)
  const fy = fiscalYearOf(parsed.data.gift_date, hub.fiscalYearStart)
  if (fy === null) {
    // No fiscal year settled means no honest year to file this under.
    redirect(`${peoplePath(orgSlug)}?state=no_fiscal_year`)
  }
  const supabase = await createServerSupabase()
  const { error } = await supabase.from('hub_gifts').insert({
    org_id: hub.orgId,
    practice_id: hub.practiceId,
    donor_id: parsed.data.donor_id,
    fiscal_year: fy,
    amount_cents: Math.round(parsed.data.amount * 100),
    gift_date: parsed.data.gift_date,
    kind: parsed.data.kind,
    designation: parsed.data.designation || null,
    source: 'manual',
  })
  if (error) {
    console.error('[hub gift] insert failed:', error.message)
    redirect(`${peoplePath(orgSlug)}?state=error`)
  }
  revalidatePath(`${peoplePath(orgSlug)}/${parsed.data.donor_id}`)
  redirect(`${peoplePath(orgSlug)}/${parsed.data.donor_id}?state=saved`)
}

const TouchShape = z.object({
  donor_id: z.string().uuid(),
  kind: z.enum(['thank_you', 'call', 'meeting', 'report', 'note', 'event']),
  occurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(2000).optional(),
})

/** Record what a household heard. Touches are what make the
 *  stewardship rules honest, and what clears them. */
export async function addTouch(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const limited = await checkRateLimits([{ config: WRITE_PER_MIN, key: hub.orgId }])
  if (!limited.ok) redirect(`${peoplePath(orgSlug)}?state=slow`)
  const parsed = TouchShape.safeParse({
    donor_id: formData.get('donor_id'),
    kind: formData.get('kind'),
    occurred_on: formData.get('occurred_on'),
    note: formData.get('note') ?? undefined,
  })
  if (!parsed.success) redirect(`${peoplePath(orgSlug)}?state=invalid`)
  const supabase = await createServerSupabase()
  const { error } = await supabase.from('hub_touches').insert({
    org_id: hub.orgId,
    practice_id: hub.practiceId,
    donor_id: parsed.data.donor_id,
    kind: parsed.data.kind,
    occurred_on: parsed.data.occurred_on,
    note: parsed.data.note || null,
  })
  if (error) {
    console.error('[hub touch] insert failed:', error.message)
    redirect(`${peoplePath(orgSlug)}?state=error`)
  }
  revalidatePath(`${peoplePath(orgSlug)}/${parsed.data.donor_id}`)
  redirect(`${peoplePath(orgSlug)}/${parsed.data.donor_id}?state=saved`)
}

const StewardTaskShape = z.object({
  donor_id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  why: z.string().trim().min(1).max(1000),
  rule_key: z.string().trim().min(1).max(120),
})

/** Turn a stewardship finding into a task. The rule key and the
 *  unique index make it fire once per donor per rule per cycle; the
 *  do-not-contact trigger stands behind this like every insert. */
export async function makeStewardshipTask(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const parsed = StewardTaskShape.safeParse({
    donor_id: formData.get('donor_id'),
    title: formData.get('title'),
    why: formData.get('why'),
    rule_key: formData.get('rule_key'),
  })
  if (!parsed.success) redirect(peoplePath(orgSlug))
  const supabase = await createServerSupabase()
  await supabase.from('hub_tasks').insert({
    org_id: hub.orgId,
    practice_id: hub.practiceId,
    donor_id: parsed.data.donor_id,
    title: parsed.data.title,
    why: parsed.data.why,
    area: 'Stewardship',
    source: 'stewardship_rule',
    rule_key: parsed.data.rule_key,
  })
  // A duplicate rule key means it already fired this cycle; that is
  // the contract working, not an error worth surfacing.
  revalidatePath(`${peoplePath(orgSlug)}/${parsed.data.donor_id}`)
  redirect(`${peoplePath(orgSlug)}/${parsed.data.donor_id}?state=saved`)
}

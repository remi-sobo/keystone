'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer, type HubMembership } from '@/lib/membership'
import { checkRateLimits } from '@/lib/rateLimit'
import { parseYlExport, buildApplyPlan } from '@/lib/hubYlExport'
import { fiscalYearOf } from '@/lib/hubFigures'

/**
 * PEOPLE's server actions (specs/epayl-fundraising-hub.md, phase two).
 * Pure RLS end to end: every read and write here runs on the caller's
 * own session, so the member's rights ARE the parser's rights and a
 * bug in this file cannot reach another org's rows. No service role
 * exists anywhere beneath the hub surface (CI-guarded).
 *
 * Upload contract: the file lands in storage and hub_documents FIRST,
 * with parsed_at null, so a failed parse never loses the file. A
 * recognized Young Life export gets a diff preview in parse_result;
 * NOTHING changes a donor row until the person confirms the diff
 * (a silent parse that changes giving history is worse than no
 * parse). Kendra never sees the word parser and never picks a type.
 */

const UPLOAD_PER_HOUR = { kind: 'hub:upload:hour', windowMs: 60 * 60 * 1000, max: 20 }
const WRITE_PER_MIN = { kind: 'hub:write:min', windowMs: 60 * 1000, max: 30 }
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

async function requireHub(orgSlug: string): Promise<HubMembership | null> {
  const viewer = await getViewer()
  if (!viewer.hub || viewer.hub.orgSlug !== orgSlug) return null
  return viewer.hub
}

function peoplePath(orgSlug: string): string {
  return `/${orgSlug}/people`
}

const safeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'upload'

/** Detect what a file is from its content and name, never a picker. */
function detectKind(
  filename: string,
  parsedOk: boolean
): 'yl_export' | 'budget' | 'financial' | 'research' | 'notes' | 'grant' {
  if (parsedOk) return 'yl_export'
  const lower = filename.toLowerCase()
  if (lower.includes('budget')) return 'budget'
  if (/\.(xlsx|xlsm|csv)$/.test(lower)) return 'financial'
  if (lower.includes('grant')) return 'grant'
  if (lower.includes('profile') || lower.includes('research')) return 'research'
  return 'notes'
}

export async function uploadHubDocument(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await requireHub(orgSlug)
  if (!hub) redirect('/')
  const limited = await checkRateLimits([{ config: UPLOAD_PER_HOUR, key: hub.orgId }])
  if (!limited.ok) redirect(`${peoplePath(orgSlug)}?state=slow`)

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${peoplePath(orgSlug)}?state=no_file`)
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(`${peoplePath(orgSlug)}?state=too_large`)
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const supabase = await createServerSupabase()

  // The file lands first, whatever it turns out to be.
  const storagePath = `${hub.orgId}/${crypto.randomUUID()}-${safeFilename(file.name)}`
  const uploaded = await supabase.storage.from('hub-documents').upload(storagePath, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploaded.error) {
    console.error('[hub upload] storage failed:', uploaded.error.message)
    redirect(`${peoplePath(orgSlug)}?state=error`)
  }

  let kind: ReturnType<typeof detectKind>
  let parseResult: Record<string, unknown> | null = null
  let parseError: string | null = null
  try {
    const parsed = parseYlExport(bytes)
    const { data: existing } = await supabase
      .from('hub_donors')
      .select('id, yl_account_number, status')
      .eq('org_id', hub.orgId)
    const plan = buildApplyPlan(parsed, existing ?? [])
    kind = 'yl_export'
    parseResult = { status: 'preview', ...plan.summary }
  } catch (e) {
    kind = detectKind(file.name, false)
    // Only a recognized export gets a parse verdict; anything else is
    // simply stored, and an xlsx that ALMOST matched keeps the honest
    // reason it did not.
    if (kind === 'financial' || kind === 'budget') {
      parseError = e instanceof Error ? e.message : 'unreadable workbook'
    }
  }

  const { error } = await supabase.from('hub_documents').insert({
    org_id: hub.orgId,
    practice_id: hub.practiceId,
    storage_path: storagePath,
    filename: file.name,
    kind,
    parse_result: parseResult,
    parse_error: parseError,
  })
  if (error) {
    console.error('[hub upload] document row failed:', error.message)
    redirect(`${peoplePath(orgSlug)}?state=error`)
  }
  revalidatePath(peoplePath(orgSlug))
  redirect(`${peoplePath(orgSlug)}?state=${kind === 'yl_export' ? 'preview' : 'stored'}`)
}

export async function confirmYlImport(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await requireHub(orgSlug)
  if (!hub) redirect('/')
  const documentId = z.string().uuid().safeParse(formData.get('document_id'))
  if (!documentId.success) redirect(peoplePath(orgSlug))
  const limited = await checkRateLimits([{ config: UPLOAD_PER_HOUR, key: hub.orgId }])
  if (!limited.ok) redirect(`${peoplePath(orgSlug)}?state=slow`)

  const supabase = await createServerSupabase()
  const { data: doc } = await supabase
    .from('hub_documents')
    .select('id, storage_path, kind, parsed_at')
    .eq('org_id', hub.orgId)
    .eq('id', documentId.data)
    .maybeSingle()
  if (!doc || doc.kind !== 'yl_export' || doc.parsed_at) redirect(peoplePath(orgSlug))

  const download = await supabase.storage.from('hub-documents').download(doc.storage_path)
  if (download.error || !download.data) {
    console.error('[hub import] download failed:', download.error?.message)
    redirect(`${peoplePath(orgSlug)}?state=error`)
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer())

  try {
    const parsed = parseYlExport(bytes)
    const { data: existing } = await supabase
      .from('hub_donors')
      .select('id, yl_account_number, status')
      .eq('org_id', hub.orgId)
    const plan = buildApplyPlan(parsed, existing ?? [])

    // Donors first, so the gift rows have households to hang on.
    if (plan.inserts.length > 0) {
      const { error } = await supabase.from('hub_donors').insert(
        plan.inserts.map((h) => {
          const { gifts, ...fields } = h
          void gifts // the plan's gift rows land below, never on the donor
          return {
            ...fields,
            org_id: hub.orgId,
            practice_id: hub.practiceId,
            source: 'yl_export',
          }
        })
      )
      if (error) throw new Error(`donor insert failed: ${error.message}`)
    }
    for (const u of plan.updates) {
      const { error } = await supabase
        .from('hub_donors')
        .update({ ...u.fields, source: 'yl_export' })
        .eq('org_id', hub.orgId)
        .eq('id', u.id)
      if (error) throw new Error(`donor update failed: ${error.message}`)
    }

    // The replacement whose scope IS the feature (correction 2):
    // delete the parser's own rows and nothing else, then re-insert.
    const { data: donorRows } = await supabase
      .from('hub_donors')
      .select('id, yl_account_number')
      .eq('org_id', hub.orgId)
      .not('yl_account_number', 'is', null)
    const idByAccount = new Map(
      (donorRows ?? []).map((d) => [d.yl_account_number as string, d.id as string])
    )
    const del = await supabase
      .from('hub_gifts')
      .delete()
      .eq('org_id', hub.orgId)
      .eq('source', plan.giftSourceToReplace)
    if (del.error) throw new Error(`gift replace failed: ${del.error.message}`)
    const giftRows = plan.gifts
      .map((g) => {
        const donorId = idByAccount.get(g.yl_account_number)
        if (!donorId) return null
        return {
          org_id: hub.orgId,
          practice_id: hub.practiceId,
          donor_id: donorId,
          fiscal_year: g.fiscal_year,
          amount_cents: g.amount_cents,
          source: 'yl_export',
        }
      })
      .filter((g) => g !== null)
    if (giftRows.length > 0) {
      const { error } = await supabase.from('hub_gifts').insert(giftRows)
      if (error) throw new Error(`gift insert failed: ${error.message}`)
    }

    await supabase
      .from('hub_documents')
      .update({
        parsed_at: new Date().toISOString(),
        parse_result: { status: 'applied', ...plan.summary },
        parse_error: null,
      })
      .eq('org_id', hub.orgId)
      .eq('id', doc.id)
  } catch (e) {
    // The file is safe in storage; the failure is written down, never
    // silent, and nothing marks the import applied.
    const message = e instanceof Error ? e.message : 'import failed'
    console.error('[hub import]', message)
    await supabase
      .from('hub_documents')
      .update({ parse_error: message })
      .eq('org_id', hub.orgId)
      .eq('id', doc.id)
    redirect(`${peoplePath(orgSlug)}?state=error`)
  }
  revalidatePath(peoplePath(orgSlug))
  redirect(`${peoplePath(orgSlug)}?state=imported`)
}

export async function dismissImport(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await requireHub(orgSlug)
  if (!hub) redirect('/')
  const documentId = z.string().uuid().safeParse(formData.get('document_id'))
  if (!documentId.success) redirect(peoplePath(orgSlug))
  const supabase = await createServerSupabase()
  // The file stays (a failed parse never loses the file); only the
  // pending preview is set aside.
  await supabase
    .from('hub_documents')
    .update({ parse_result: { status: 'dismissed' } })
    .eq('org_id', hub.orgId)
    .eq('id', documentId.data)
    .is('parsed_at', null)
  revalidatePath(peoplePath(orgSlug))
  redirect(peoplePath(orgSlug))
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
  const hub = await requireHub(orgSlug)
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
  const hub = await requireHub(orgSlug)
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
  const hub = await requireHub(orgSlug)
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
  const hub = await requireHub(orgSlug)
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
  const hub = await requireHub(orgSlug)
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

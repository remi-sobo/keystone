'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { checkRateLimits } from '@/lib/rateLimit'
import { parseYlExport, buildApplyPlan } from '@/lib/hubYlExport'
import { parseBudgetWorkbook, BUDGET_SECTIONS } from '@/lib/hubBudget'
import { hubMoney } from '@/lib/hubTheme'

/**
 * The org's one upload path (specs/epayl-fundraising-hub.md). Kendra
 * never sees the word parser and never chooses a file type: the file
 * says what it is. A recognized Young Life report previews on PEOPLE;
 * a recognized budget workbook previews on MONEY; anything else is
 * simply stored. The file lands in storage and hub_documents FIRST
 * with parsed_at null, so a failed parse never loses it, and NOTHING
 * changes a row until the person confirms the diff.
 *
 * Pure RLS end to end, like everything beneath the hub surface.
 */

const UPLOAD_PER_HOUR = { kind: 'hub:upload:hour', windowMs: 60 * 60 * 1000, max: 20 }
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const safeFilename = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'upload'

function fallbackKind(filename: string): 'budget' | 'financial' | 'research' | 'notes' | 'grant' {
  const lower = filename.toLowerCase()
  if (lower.includes('budget')) return 'budget'
  if (/\.(xlsx|xlsm|csv)$/.test(lower)) return 'financial'
  if (lower.includes('grant')) return 'grant'
  if (lower.includes('profile') || lower.includes('research')) return 'research'
  return 'notes'
}

export async function uploadHubDocument(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const back = (formData.get('back') === 'money' ? `/${orgSlug}/money` : `/${orgSlug}/people`)
  const limited = await checkRateLimits([{ config: UPLOAD_PER_HOUR, key: hub.orgId }])
  if (!limited.ok) redirect(`${back}?state=slow`)

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) redirect(`${back}?state=no_file`)
  if (file.size > MAX_UPLOAD_BYTES) redirect(`${back}?state=too_large`)

  const bytes = new Uint8Array(await file.arrayBuffer())
  const supabase = await createServerSupabase()

  const storagePath = `${hub.orgId}/${crypto.randomUUID()}-${safeFilename(file.name)}`
  const uploaded = await supabase.storage.from('hub-documents').upload(storagePath, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploaded.error) {
    console.error('[hub upload] storage failed:', uploaded.error.message)
    redirect(`${back}?state=error`)
  }

  let kind: string
  let parseResult: Record<string, unknown> | null = null
  let parseError: string | null = null
  let landing = back

  // The file says what it is: first the donor report, then the budget.
  try {
    const parsed = parseYlExport(bytes)
    const { data: existing } = await supabase
      .from('hub_donors')
      .select('id, yl_account_number, status')
      .eq('org_id', hub.orgId)
    const plan = buildApplyPlan(parsed, existing ?? [])
    kind = 'yl_export'
    parseResult = { status: 'preview', ...plan.summary }
    landing = `/${orgSlug}/people?state=preview`
  } catch {
    try {
      const budget = parseBudgetWorkbook(bytes)
      kind = 'budget'
      const fy = Math.min(...budget.summary.fiscalYears)
      parseResult = {
        status: 'preview',
        lines: budget.lines.length,
        fiscalYears: budget.summary.fiscalYears,
        firstYearCost: hubMoney(budget.summary.operatingExpenseCents[fy] ?? 0),
        firstYearToRaise: hubMoney(budget.summary.toRaiseCents[fy] ?? 0),
        warnings: budget.warnings,
      }
      landing = `/${orgSlug}/money?state=preview`
    } catch (e) {
      kind = fallbackKind(file.name)
      if (kind === 'financial' || kind === 'budget') {
        parseError = e instanceof Error ? e.message : 'unreadable workbook'
      }
      landing = `${back}?state=stored`
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
    redirect(`${back}?state=error`)
  }
  revalidatePath(`/${orgSlug}/people`)
  revalidatePath(`/${orgSlug}/money`)
  redirect(landing)
}

export async function confirmYlImport(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const back = `/${orgSlug}/people`
  const documentId = z.string().uuid().safeParse(formData.get('document_id'))
  if (!documentId.success) redirect(back)
  const limited = await checkRateLimits([{ config: UPLOAD_PER_HOUR, key: hub.orgId }])
  if (!limited.ok) redirect(`${back}?state=slow`)

  const supabase = await createServerSupabase()
  const { data: doc } = await supabase
    .from('hub_documents')
    .select('id, storage_path, kind, parsed_at')
    .eq('org_id', hub.orgId)
    .eq('id', documentId.data)
    .maybeSingle()
  if (!doc || doc.kind !== 'yl_export' || doc.parsed_at) redirect(back)

  const download = await supabase.storage.from('hub-documents').download(doc.storage_path)
  if (download.error || !download.data) {
    console.error('[hub import] download failed:', download.error?.message)
    redirect(`${back}?state=error`)
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer())

  try {
    const parsed = parseYlExport(bytes)
    const { data: existing } = await supabase
      .from('hub_donors')
      .select('id, yl_account_number, status')
      .eq('org_id', hub.orgId)
    const plan = buildApplyPlan(parsed, existing ?? [])

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
    const message = e instanceof Error ? e.message : 'import failed'
    console.error('[hub import]', message)
    await supabase
      .from('hub_documents')
      .update({ parse_error: message })
      .eq('org_id', hub.orgId)
      .eq('id', doc.id)
    redirect(`${back}?state=error`)
  }
  revalidatePath(back)
  redirect(`${back}?state=imported`)
}

export async function confirmBudgetImport(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const back = `/${orgSlug}/money`
  const documentId = z.string().uuid().safeParse(formData.get('document_id'))
  if (!documentId.success) redirect(back)
  const limited = await checkRateLimits([{ config: UPLOAD_PER_HOUR, key: hub.orgId }])
  if (!limited.ok) redirect(`${back}?state=slow`)

  const supabase = await createServerSupabase()
  const { data: doc } = await supabase
    .from('hub_documents')
    .select('id, storage_path, kind, parsed_at')
    .eq('org_id', hub.orgId)
    .eq('id', documentId.data)
    .maybeSingle()
  if (!doc || doc.kind !== 'budget' || doc.parsed_at) redirect(back)

  const download = await supabase.storage.from('hub-documents').download(doc.storage_path)
  if (download.error || !download.data) {
    console.error('[hub budget] download failed:', download.error?.message)
    redirect(`${back}?state=error`)
  }
  const bytes = new Uint8Array(await download.data.arrayBuffer())

  try {
    const budget = parseBudgetWorkbook(bytes)
    // The parser owns its sections and replaces exactly those; a
    // figure someone lands in another section is not this import's to
    // touch.
    const del = await supabase
      .from('hub_budget_lines')
      .delete()
      .eq('org_id', hub.orgId)
      .in('section', [...BUDGET_SECTIONS])
    if (del.error) throw new Error(`budget replace failed: ${del.error.message}`)
    const { error } = await supabase.from('hub_budget_lines').insert(
      budget.lines.map((l) => ({
        ...l,
        org_id: hub.orgId,
        practice_id: hub.practiceId,
      }))
    )
    if (error) throw new Error(`budget insert failed: ${error.message}`)
    await supabase
      .from('hub_documents')
      .update({
        parsed_at: new Date().toISOString(),
        parse_result: {
          status: 'applied',
          lines: budget.lines.length,
          fiscalYears: budget.summary.fiscalYears,
          warnings: budget.warnings,
        },
        parse_error: null,
      })
      .eq('org_id', hub.orgId)
      .eq('id', doc.id)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'budget import failed'
    console.error('[hub budget]', message)
    await supabase
      .from('hub_documents')
      .update({ parse_error: message })
      .eq('org_id', hub.orgId)
      .eq('id', doc.id)
    redirect(`${back}?state=error`)
  }
  revalidatePath(back)
  revalidatePath(`/${orgSlug}`)
  redirect(`${back}?state=imported`)
}

export async function dismissImport(orgSlug: string, formData: FormData): Promise<void> {
  const hub = await hubContext(orgSlug)
  if (!hub) redirect('/')
  const documentId = z.string().uuid().safeParse(formData.get('document_id'))
  if (!documentId.success) redirect(`/${orgSlug}/people`)
  const supabase = await createServerSupabase()
  // The file stays (a failed parse never loses the file); only the
  // pending preview is set aside.
  await supabase
    .from('hub_documents')
    .update({ parse_result: { status: 'dismissed' } })
    .eq('org_id', hub.orgId)
    .eq('id', documentId.data)
    .is('parsed_at', null)
  revalidatePath(`/${orgSlug}/people`)
  revalidatePath(`/${orgSlug}/money`)
  redirect(formData.get('back') === 'money' ? `/${orgSlug}/money` : `/${orgSlug}/people`)
}

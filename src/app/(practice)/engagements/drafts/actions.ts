'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer, type Viewer } from '@/lib/membership'
import { sendMembershipInvite } from '@/lib/inviteSend'
import { logAuditAction } from '@/lib/audit'

/**
 * Engagement Builder actions (V2 1B,
 * specs/keystone-v2-engagement-builder.md). Section saves ride the
 * SESSION client under RLS (engagement.write is the policy authority,
 * so owner and consultant both draft). Publish is the one
 * service-role-after-check transaction: it validates the full shape,
 * births the engagement, workstreams, and pending invites, optionally
 * sends the invite emails through the shared 1A path, and marks the
 * draft published. Discard is a status; nothing here deletes.
 */

const IdShape = z.string().uuid()
const StageShape = z.enum(['diagnose', 'design', 'build', 'train', 'stabilize'])
const EmailShape = z.string().trim().toLowerCase().email().max(320)
const DateShape = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export interface DraftWorkstream {
  title: string
  stage: string
}

export interface DraftShape {
  starts_on?: string
  length_months?: number
  fee_display?: string
  cadence_md?: string
  workstreams?: DraftWorkstream[]
  invites?: string[]
  notes_md?: string
}

interface DraftRow {
  id: string
  practice_id: string
  client_id: string | null
  title: string
  shape: DraftShape
  status: string
  published_engagement_id: string | null
}

function draftPath(id: string): string {
  return `/engagements/drafts/${id}`
}

async function requireDrafter(): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  return viewer
}

/** Load an editable draft under RLS; any row returned proves membership. */
async function loadDraft(id: string): Promise<DraftRow | null> {
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('engagement_drafts')
    .select('id, practice_id, client_id, title, shape, status, published_engagement_id')
    .eq('id', id)
    .maybeSingle()
  return (data as DraftRow | null) ?? null
}

/** Merge a shape change into the draft through the session client. */
async function saveShape(
  draft: DraftRow,
  mutate: (shape: DraftShape) => DraftShape,
  extra?: { title?: string; client_id?: string | null }
): Promise<boolean> {
  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('engagement_drafts')
    .update({
      shape: mutate(draft.shape ?? {}),
      ...(extra?.title !== undefined ? { title: extra.title } : {}),
      ...(extra?.client_id !== undefined ? { client_id: extra.client_id } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.id)
    .eq('status', 'draft')
  if (error) console.error('[builder] draft save failed:', error.message)
  return !error
}

/** Parse, load, and gate one editable draft or leave with a note. */
async function editableDraft(formData: FormData): Promise<DraftRow> {
  await requireDrafter()
  const id = IdShape.safeParse(formData.get('draftId'))
  if (!id.success) redirect('/engagements')
  const draft = await loadDraft(id.data)
  if (!draft) redirect('/engagements')
  if (draft.status !== 'draft') redirect(`${draftPath(draft.id)}?note=not_editable`)
  return draft
}

export async function newDraft(): Promise<void> {
  const viewer = await requireDrafter()
  const supabase = await createServerSupabase()
  const { data, error } = await supabase
    .from('engagement_drafts')
    .insert({
      practice_id: viewer.practice!.practiceId,
      created_by: viewer.user!.id,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[builder] draft create failed:', error?.message)
    redirect('/engagements?note=draft_error')
  }
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'builder.draft_created',
    target: data.id,
  })
  redirect(draftPath(data.id))
}

export async function saveClient(formData: FormData): Promise<void> {
  const viewer = await requireDrafter()
  const draft = await editableDraft(formData)
  const clientId = formData.get('clientId')
  const newName = z.string().trim().min(1).max(120).safeParse(formData.get('newClientName'))

  let chosen: string | null = null
  if (newName.success) {
    // Inline client add (CONFIRM 1B-2): the exact same row the members
    // page writes. clients_write RLS demands practice.manage, so this
    // stays owner-only with RLS as the wall, not an app check.
    const supabase = await createServerSupabase()
    const { data, error } = await supabase
      .from('clients')
      .insert({ practice_id: draft.practice_id, name: newName.data })
      .select('id')
      .single()
    if (error || !data) redirect(`${draftPath(draft.id)}?note=client_owner_only`)
    chosen = data.id
    await logAuditAction({
      actorEmail: viewer.user!.email ?? '',
      action: 'members.client_added',
      target: newName.data,
      detail: { via: 'builder' },
    })
  } else {
    const parsed = IdShape.safeParse(clientId)
    if (!parsed.success) redirect(`${draftPath(draft.id)}?note=invalid`)
    chosen = parsed.data
  }

  const ok = await saveShape(draft, (s) => s, { client_id: chosen })
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function saveBasics(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const title = z.string().trim().min(1).max(160).safeParse(formData.get('title'))
  const startsOn = DateShape.safeParse(formData.get('startsOn'))
  const months = z.coerce.number().int().min(1).max(24).safeParse(formData.get('lengthMonths'))
  const fee = z.string().trim().max(120).safeParse(formData.get('feeDisplay'))
  if (!title.success) redirect(`${draftPath(draft.id)}?note=invalid`)

  const ok = await saveShape(
    draft,
    (s) => ({
      ...s,
      starts_on: startsOn.success ? startsOn.data : undefined,
      length_months: months.success ? months.data : undefined,
      fee_display: fee.success && fee.data ? fee.data : undefined,
    }),
    { title: title.data }
  )
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function addWorkstream(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const title = z.string().trim().min(1).max(120).safeParse(formData.get('title'))
  const stage = StageShape.safeParse(formData.get('stage'))
  if (!title.success || !stage.success) redirect(`${draftPath(draft.id)}?note=invalid`)
  if ((draft.shape.workstreams ?? []).length >= 12)
    redirect(`${draftPath(draft.id)}?note=too_many`)

  const ok = await saveShape(draft, (s) => ({
    ...s,
    workstreams: [...(s.workstreams ?? []), { title: title.data, stage: stage.data }],
  }))
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function updateWorkstream(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const index = z.coerce.number().int().min(0).safeParse(formData.get('index'))
  const title = z.string().trim().min(1).max(120).safeParse(formData.get('title'))
  const stage = StageShape.safeParse(formData.get('stage'))
  if (!index.success || !title.success || !stage.success)
    redirect(`${draftPath(draft.id)}?note=invalid`)

  const ok = await saveShape(draft, (s) => {
    const list = [...(s.workstreams ?? [])]
    if (index.data < list.length) list[index.data] = { title: title.data, stage: stage.data }
    return { ...s, workstreams: list }
  })
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function removeWorkstream(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const index = z.coerce.number().int().min(0).safeParse(formData.get('index'))
  if (!index.success) redirect(`${draftPath(draft.id)}?note=invalid`)

  const ok = await saveShape(draft, (s) => ({
    ...s,
    workstreams: (s.workstreams ?? []).filter((_, i) => i !== index.data),
  }))
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function moveWorkstream(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const index = z.coerce.number().int().min(0).safeParse(formData.get('index'))
  const dir = z.enum(['up', 'down']).safeParse(formData.get('dir'))
  if (!index.success || !dir.success) redirect(`${draftPath(draft.id)}?note=invalid`)

  const ok = await saveShape(draft, (s) => {
    const list = [...(s.workstreams ?? [])]
    const i = index.data
    const j = dir.data === 'up' ? i - 1 : i + 1
    if (i < list.length && j >= 0 && j < list.length) {
      ;[list[i], list[j]] = [list[j], list[i]]
    }
    return { ...s, workstreams: list }
  })
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function saveCadence(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const cadence = z.string().max(2000).safeParse(formData.get('cadence'))
  if (!cadence.success) redirect(`${draftPath(draft.id)}?note=invalid`)
  const ok = await saveShape(draft, (s) => ({
    ...s,
    cadence_md: cadence.data.trim() || undefined,
  }))
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function saveNotes(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const notes = z.string().max(8000).safeParse(formData.get('notes'))
  if (!notes.success) redirect(`${draftPath(draft.id)}?note=invalid`)
  const ok = await saveShape(draft, (s) => ({
    ...s,
    notes_md: notes.data.trim() || undefined,
  }))
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function addInvite(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const email = EmailShape.safeParse(formData.get('email'))
  if (!email.success) redirect(`${draftPath(draft.id)}?note=invalid`)
  if ((draft.shape.invites ?? []).length >= 24) redirect(`${draftPath(draft.id)}?note=too_many`)

  const ok = await saveShape(draft, (s) => ({
    ...s,
    invites: [...new Set([...(s.invites ?? []), email.data])],
  }))
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function removeInvite(formData: FormData): Promise<void> {
  const draft = await editableDraft(formData)
  const email = EmailShape.safeParse(formData.get('email'))
  if (!email.success) redirect(`${draftPath(draft.id)}?note=invalid`)
  const ok = await saveShape(draft, (s) => ({
    ...s,
    invites: (s.invites ?? []).filter((e) => e !== email.data),
  }))
  redirect(`${draftPath(draft.id)}?note=${ok ? 'saved' : 'error'}`)
}

export async function discardDraft(formData: FormData): Promise<void> {
  const viewer = await requireDrafter()
  const draft = await editableDraft(formData)
  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('engagement_drafts')
    .update({ status: 'discarded', updated_at: new Date().toISOString() })
    .eq('id', draft.id)
    .eq('status', 'draft')
  if (error) redirect(`${draftPath(draft.id)}?note=error`)
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'builder.draft_discarded',
    target: draft.id,
  })
  revalidatePath('/engagements')
  redirect('/engagements?note=draft_discarded')
}

export async function restoreDraft(formData: FormData): Promise<void> {
  const viewer = await requireDrafter()
  const id = IdShape.safeParse(formData.get('draftId'))
  if (!id.success) redirect('/engagements')
  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('engagement_drafts')
    .update({ status: 'draft', updated_at: new Date().toISOString() })
    .eq('id', id.data)
    .eq('status', 'discarded')
  if (error) redirect('/engagements?note=draft_error')
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'builder.draft_restored',
    target: id.data,
  })
  redirect(draftPath(id.data))
}

/** Add a date an integer number of months, ISO in and out. */
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, d))
  return date.toISOString().slice(0, 10)
}

export async function publishDraft(formData: FormData): Promise<void> {
  const viewer = await requireDrafter()
  const draft = await editableDraft(formData)
  const sendInvites = formData.get('sendInvites') === 'on'

  // Full validation happens here, not while drafting (the draft is
  // allowed to have holes; the engagement is not).
  const shape = draft.shape ?? {}
  const workstreams = (shape.workstreams ?? []).filter((w) => w.title?.trim())
  if (!draft.client_id) redirect(`${draftPath(draft.id)}?note=needs_client`)
  if (!draft.title.trim() || draft.title === 'Untitled engagement')
    redirect(`${draftPath(draft.id)}?note=needs_title`)
  if (workstreams.length === 0) redirect(`${draftPath(draft.id)}?note=needs_workstreams`)

  const startsOn = DateShape.safeParse(shape.starts_on).success
    ? (shape.starts_on as string)
    : new Date().toISOString().slice(0, 10)
  const months = shape.length_months && shape.length_months >= 1 ? shape.length_months : 6

  // The client must still belong to this practice (it was chosen under
  // RLS, but never trust a stored id across time either).
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name')
    .eq('id', draft.client_id)
    .eq('practice_id', draft.practice_id)
    .maybeSingle()
  if (!client) redirect(`${draftPath(draft.id)}?note=needs_client`)

  // 1. The engagement, born active (CONFIRM 1B-3).
  const { data: engagement, error: engError } = await supabaseAdmin
    .from('engagements')
    .insert({
      practice_id: draft.practice_id,
      client_id: client.id,
      title: draft.title.trim(),
      starts_on: startsOn,
      ends_on: addMonths(startsOn, months),
      fee_display: shape.fee_display ?? null,
      status: 'active',
    })
    .select('id')
    .single()
  if (engError || !engagement) {
    console.error('[builder] publish engagement insert failed:', engError?.message)
    redirect(`${draftPath(draft.id)}?note=error`)
  }

  // 2. The workstreams, in draft order.
  const { error: wsError } = await supabaseAdmin.from('workstreams').insert(
    workstreams.map((w, i) => ({
      engagement_id: engagement.id,
      practice_id: draft.practice_id,
      client_id: client.id,
      title: w.title.trim(),
      stage: StageShape.safeParse(w.stage).success ? w.stage : 'diagnose',
      sort: i,
    }))
  )
  if (wsError) {
    // The engagement exists; the page will show it without arcs rather
    // than pretending nothing happened.
    console.error('[builder] publish workstream insert failed:', wsError.message)
  }

  // 3. Pending invites: rows first (the row IS the invite), skipping
  // emails already on the roster.
  const invites = [...new Set((shape.invites ?? []).map((e) => e.toLowerCase()))]
  let sendFailures = 0
  if (invites.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from('client_members')
      .select('email')
      .eq('client_id', client.id)
    const known = new Set((existing ?? []).map((r) => r.email.toLowerCase()))
    const fresh = invites.filter((e) => !known.has(e))
    const rows: { id: string; email: string }[] = []
    if (fresh.length > 0) {
      const { data: inserted, error: cmError } = await supabaseAdmin
        .from('client_members')
        .insert(
          fresh.map((email) => ({
            client_id: client.id,
            practice_id: draft.practice_id,
            email,
            invited_by: viewer.user!.id,
          }))
        )
        .select('id, email')
      if (cmError) console.error('[builder] publish invites insert failed:', cmError.message)
      rows.push(...(inserted ?? []))
    }

    // 4. The emails, only if asked (CONFIRM 1B-1), through the shared
    // rate-limited path. A failed send leaves an honest pending row.
    if (sendInvites) {
      for (const row of rows) {
        const sent = await sendMembershipInvite({
          side: 'client',
          rowId: row.id,
          email: row.email,
          practiceId: draft.practice_id,
          practiceName: viewer.practice?.practiceName ?? 'your practice',
          clientName: client.name,
          actorEmail: viewer.user!.email ?? '',
        })
        if (sent !== 'sent') sendFailures++
      }
    }
  }

  // 5. The draft becomes the scoping record (CONFIRM 1B-4).
  await supabaseAdmin
    .from('engagement_drafts')
    .update({
      status: 'published',
      published_engagement_id: engagement.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.id)

  // 6. One audit line, metadata only.
  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'engagements.published',
    target: engagement.id,
    detail: {
      draft: draft.id,
      workstreams: workstreams.length,
      invites: invites.length,
      invites_sent: sendInvites,
      send_failures: sendFailures,
    },
  })

  revalidatePath('/engagements')
  redirect(
    sendFailures > 0
      ? `${draftPath(draft.id)}?note=published_sendfail`
      : `/engagements/${engagement.id}`
  )
}

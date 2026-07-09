'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getViewer, type Viewer } from '@/lib/membership'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmail } from '@/lib/email'
import { buildInviteEmail } from '@/lib/inviteEmail'
import { logAuditAction } from '@/lib/audit'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'

/**
 * Members and access actions (V2 1A, specs/keystone-v2-admin-ui.md).
 * Practice surface, owner only: every action re-resolves the viewer,
 * verifies the owner role, then acts through the service role
 * (service-role-after-check). Every mutation audits metadata only.
 *
 * Standing rules enforced here, not just in the UI:
 *   - Deactivation is soft (revoked_at); there is no delete path.
 *   - The last active owner can be neither demoted nor deactivated.
 *   - Invite emails carry no credential and are rate-limited.
 */

const PAGE = '/settings/members'

const EmailShape = z.string().trim().toLowerCase().email().max(320)
const SideShape = z.enum(['practice', 'client'])
const RoleShape = z.enum(['owner', 'consultant'])
const IdShape = z.string().uuid()

type Owner = { viewer: Viewer; practiceId: string; userId: string; email: string }

/** Resolve the caller and require the owner role, or leave via redirect. */
async function requireOwner(): Promise<Owner> {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  if (viewer.practice.role !== 'owner') redirect(`${PAGE}?note=owners_room`)
  return {
    viewer,
    practiceId: viewer.practice.practiceId,
    userId: viewer.user.id,
    email: viewer.user.email ?? '',
  }
}

function leave(note: string): never {
  redirect(`${PAGE}?note=${note}`)
}

/** Count of live owners, the number that must never reach zero. */
async function activeOwnerCount(practiceId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('practice_members')
    .select('id', { count: 'exact', head: true })
    .eq('practice_id', practiceId)
    .eq('role', 'owner')
    .is('revoked_at', null)
  return count ?? 0
}

/** Send the invite email for a pending row and stamp last_invite_sent_at. */
async function sendInvite(opts: {
  ctx: Owner
  side: 'practice' | 'client'
  rowId: string
  email: string
  clientName?: string
}): Promise<'sent' | 'slow' | 'failed'> {
  const limited = await checkRateLimits([
    { config: LIMITS.INVITE_SEND_PER_TARGET, key: opts.rowId },
    { config: LIMITS.INVITE_SEND_PER_HOUR, key: opts.ctx.practiceId },
  ])
  if (!limited.ok) return 'slow'

  const mail = buildInviteEmail({
    side: opts.side,
    email: opts.email,
    practiceName: opts.ctx.viewer.practice?.practiceName ?? 'your practice',
    clientName: opts.clientName,
  })
  // Reply-to the inviter (CONFIRM 1A-3): a confused invitee lands with
  // a person, never a noreply void.
  const result = await sendEmail({
    to: opts.email,
    subject: mail.subject,
    html: mail.html,
    replyTo: opts.ctx.email || undefined,
  })
  if (!result.ok) return 'failed'

  const table = opts.side === 'practice' ? 'practice_members' : 'client_members'
  await supabaseAdmin
    .from(table)
    .update({ last_invite_sent_at: new Date().toISOString() })
    .eq('id', opts.rowId)
    .eq('practice_id', opts.ctx.practiceId)
  await logAuditAction({
    actorEmail: opts.ctx.email,
    action: 'members.invite_sent',
    target: opts.email,
    detail: { side: opts.side, row: opts.rowId },
  })
  return 'sent'
}

export async function addPracticeMember(formData: FormData): Promise<void> {
  const ctx = await requireOwner()
  const email = EmailShape.safeParse(formData.get('email'))
  const role = RoleShape.safeParse(formData.get('role'))
  if (!email.success || !role.success) leave('invalid')

  const { data: row, error } = await supabaseAdmin
    .from('practice_members')
    .insert({
      practice_id: ctx.practiceId,
      email: email.data,
      role: role.data,
      invited_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error || !row) {
    if (error?.code === '23505') leave('exists')
    console.error('[members] practice insert failed:', error?.message)
    leave('error')
  }
  await logAuditAction({
    actorEmail: ctx.email,
    action: 'members.practice_member_added',
    target: email.data,
    detail: { role: role.data },
  })

  const sent = await sendInvite({
    ctx,
    side: 'practice',
    rowId: row.id,
    email: email.data,
  })
  revalidatePath(PAGE)
  leave(sent === 'sent' ? 'added_sent' : `added_${sent}`)
}

export async function addClient(formData: FormData): Promise<void> {
  const ctx = await requireOwner()
  const name = z.string().trim().min(1).max(120).safeParse(formData.get('name'))
  if (!name.success) leave('invalid')

  const { error } = await supabaseAdmin
    .from('clients')
    .insert({ practice_id: ctx.practiceId, name: name.data })
  if (error) {
    console.error('[members] client insert failed:', error.message)
    leave('error')
  }
  await logAuditAction({
    actorEmail: ctx.email,
    action: 'members.client_added',
    target: name.data,
  })
  revalidatePath(PAGE)
  leave('client_added')
}

export async function inviteClientMember(formData: FormData): Promise<void> {
  const ctx = await requireOwner()
  const clientId = IdShape.safeParse(formData.get('clientId'))
  const email = EmailShape.safeParse(formData.get('email'))
  if (!clientId.success || !email.success) leave('invalid')

  // The client must belong to the caller's practice; never trust ids
  // from the browser.
  const { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name')
    .eq('id', clientId.data)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!client) leave('invalid')

  const { data: row, error } = await supabaseAdmin
    .from('client_members')
    .insert({
      client_id: client.id,
      practice_id: ctx.practiceId,
      email: email.data,
      invited_by: ctx.userId,
    })
    .select('id')
    .single()
  if (error || !row) {
    if (error?.code === '23505') leave('exists')
    console.error('[members] client member insert failed:', error?.message)
    leave('error')
  }
  await logAuditAction({
    actorEmail: ctx.email,
    action: 'members.client_member_invited',
    target: email.data,
    detail: { client_id: client.id },
  })

  const sent = await sendInvite({
    ctx,
    side: 'client',
    rowId: row.id,
    email: email.data,
    clientName: client.name,
  })
  revalidatePath(PAGE)
  leave(sent === 'sent' ? 'added_sent' : `added_${sent}`)
}

export async function resendInvite(formData: FormData): Promise<void> {
  const ctx = await requireOwner()
  const side = SideShape.safeParse(formData.get('side'))
  const id = IdShape.safeParse(formData.get('id'))
  if (!side.success || !id.success) leave('invalid')

  const table = side.data === 'practice' ? 'practice_members' : 'client_members'
  const { data: row } = await supabaseAdmin
    .from(table)
    .select('id, email, claimed_at, revoked_at, client_id')
    .eq('id', id.data)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!row) leave('invalid')
  if (row.claimed_at || row.revoked_at) leave('invalid')

  let clientName: string | undefined
  if (side.data === 'client') {
    const { data: client } = await supabaseAdmin
      .from('clients')
      .select('name')
      .eq('id', row.client_id as string)
      .maybeSingle()
    clientName = client?.name
  }

  const sent = await sendInvite({
    ctx,
    side: side.data,
    rowId: row.id,
    email: row.email,
    clientName,
  })
  revalidatePath(PAGE)
  leave(sent === 'sent' ? 'invite_sent' : `invite_${sent}`)
}

export async function changeRole(formData: FormData): Promise<void> {
  const ctx = await requireOwner()
  const id = IdShape.safeParse(formData.get('id'))
  const role = RoleShape.safeParse(formData.get('role'))
  if (!id.success || !role.success) leave('invalid')

  const { data: target } = await supabaseAdmin
    .from('practice_members')
    .select('id, email, role, revoked_at')
    .eq('id', id.data)
    .eq('practice_id', ctx.practiceId)
    .maybeSingle()
  if (!target) leave('invalid')
  if (target.role === role.data) leave('no_change')

  if (target.role === 'owner' && role.data === 'consultant') {
    if ((await activeOwnerCount(ctx.practiceId)) <= 1) leave('last_owner')
  }

  const { error } = await supabaseAdmin
    .from('practice_members')
    .update({ role: role.data })
    .eq('id', id.data)
    .eq('practice_id', ctx.practiceId)
  if (error) leave('error')

  // The count check above runs before the write, so two owners demoting
  // each other at once could both pass it. Re-check after and restore:
  // the safe terminal state is two owners, never zero.
  if (role.data === 'consultant' && (await activeOwnerCount(ctx.practiceId)) === 0) {
    await supabaseAdmin
      .from('practice_members')
      .update({ role: 'owner' })
      .eq('id', id.data)
    leave('last_owner')
  }

  await logAuditAction({
    actorEmail: ctx.email,
    action: 'members.role_changed',
    target: target.email,
    detail: { from: target.role, to: role.data },
  })
  revalidatePath(PAGE)
  leave('role_changed')
}

export async function setMemberAccess(formData: FormData): Promise<void> {
  const ctx = await requireOwner()
  const side = SideShape.safeParse(formData.get('side'))
  const id = IdShape.safeParse(formData.get('id'))
  const to = z.enum(['deactivate', 'reactivate']).safeParse(formData.get('to'))
  if (!side.success || !id.success || !to.success) leave('invalid')

  const table = side.data === 'practice' ? 'practice_members' : 'client_members'
  let target: { id: string; email: string; revoked_at: string | null; role?: string } | null
  if (side.data === 'practice') {
    ;({ data: target } = await supabaseAdmin
      .from('practice_members')
      .select('id, email, revoked_at, role')
      .eq('id', id.data)
      .eq('practice_id', ctx.practiceId)
      .maybeSingle())
  } else {
    ;({ data: target } = await supabaseAdmin
      .from('client_members')
      .select('id, email, revoked_at')
      .eq('id', id.data)
      .eq('practice_id', ctx.practiceId)
      .maybeSingle())
  }
  if (!target) leave('invalid')

  if (to.data === 'deactivate') {
    if (target.revoked_at) leave('no_change')
    if (
      side.data === 'practice' &&
      (target as { role?: string }).role === 'owner' &&
      (await activeOwnerCount(ctx.practiceId)) <= 1
    ) {
      leave('last_owner')
    }
    const { error } = await supabaseAdmin
      .from(table)
      .update({ revoked_at: new Date().toISOString(), revoked_by: ctx.userId })
      .eq('id', id.data)
      .eq('practice_id', ctx.practiceId)
    if (error) leave('error')

    // Same restore rule as changeRole: never end at zero owners.
    if (side.data === 'practice' && (await activeOwnerCount(ctx.practiceId)) === 0) {
      await supabaseAdmin
        .from(table)
        .update({ revoked_at: null, revoked_by: null })
        .eq('id', id.data)
      leave('last_owner')
    }
  } else {
    if (!target.revoked_at) leave('no_change')
    const { error } = await supabaseAdmin
      .from(table)
      .update({ revoked_at: null, revoked_by: null })
      .eq('id', id.data)
      .eq('practice_id', ctx.practiceId)
    if (error) leave('error')
  }

  await logAuditAction({
    actorEmail: ctx.email,
    action: to.data === 'deactivate' ? 'members.deactivated' : 'members.reactivated',
    target: target.email,
    detail: { side: side.data, row: id.data },
  })
  revalidatePath(PAGE)
  leave(to.data === 'deactivate' ? 'deactivated' : 'reactivated')
}

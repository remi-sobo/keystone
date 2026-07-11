'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { logAuditAction } from '@/lib/audit'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'

/**
 * Client-profile actions (specs/keystone-v2-client-profiles.md, CP-3).
 * The four org-level facts are edited in place on the clients row. The
 * write rides the SESSION client, so the clients_update policy is the
 * wall: keystone_can(practice_id, null, 'practice.manage'), which only
 * an owner holds. The action verifies the client is the caller's own
 * and that a chosen primary contact belongs to that client before the
 * write, so a forged id refuses rather than no-opping. The relationship
 * note is practice-authored prose, voice-swept like every note we save;
 * it is practice-only and never crosses the wall to a client.
 */

const ProfileShape = z.object({
  clientId: z.string().uuid(),
  relationshipNote: z.string().max(2000),
  website: z.string().max(500),
  relationshipStartedOn: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  primaryContactMemberId: z.union([z.literal(''), z.string().uuid()]),
})

async function guardOwner() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')
  return viewer
}

export async function saveClientProfile(formData: FormData): Promise<void> {
  const viewer = await guardOwner()
  // Only an owner can manage the client record; a consultant's write
  // would fail the clients_update policy, so we refuse cleanly here too.
  if (viewer.practice!.role !== 'owner') redirect('/clients')

  const parsed = ProfileShape.safeParse({
    clientId: formData.get('clientId'),
    relationshipNote: formData.get('relationshipNote') ?? '',
    website: formData.get('website') ?? '',
    relationshipStartedOn: formData.get('relationshipStartedOn') ?? '',
    primaryContactMemberId: formData.get('primaryContactMemberId') ?? '',
  })
  if (!parsed.success) redirect('/clients')
  const input = parsed.data

  const supabase = await createServerSupabase()
  const { data: client } = await supabase
    .from('clients')
    .select('id, practice_id')
    .eq('id', input.clientId)
    .eq('practice_id', viewer.practice!.practiceId)
    .maybeSingle()
  if (!client) redirect('/clients')

  // A chosen primary contact must be a live member of THIS client.
  const primaryContactId = input.primaryContactMemberId || null
  if (primaryContactId) {
    const { data: member } = await supabase
      .from('client_members')
      .select('id')
      .eq('id', primaryContactId)
      .eq('client_id', client.id)
      .is('revoked_at', null)
      .maybeSingle()
    if (!member) redirect(`/clients/${client.id}?state=profile_error`)
  }

  let note: string | null = input.relationshipNote.trim() || null
  if (note) {
    const check = validateVoice(note)
    if (!check.ok) {
      void logVoiceViolation({
        practiceId: client.practice_id,
        source: 'client_relationship_note',
        violations: check.violations,
        rawExcerpt: note.slice(0, 400),
        cleanedExcerpt: check.cleaned.slice(0, 400),
      })
      note = check.cleaned
    }
  }

  const { error } = await supabase
    .from('clients')
    .update({
      relationship_note: note,
      website: input.website.trim() || null,
      relationship_started_on: input.relationshipStartedOn || null,
      primary_contact_member_id: primaryContactId,
    })
    .eq('id', client.id)
  if (error) {
    console.error('[clients] profile save failed:', error.message)
    redirect(`/clients/${client.id}?state=profile_error`)
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    practiceId: client.practice_id,
    action: 'clients.profile_saved',
    target: client.id,
    detail: {
      note_cleared: note === null,
      website_set: Boolean(input.website.trim()),
      since_set: Boolean(input.relationshipStartedOn),
      primary_contact_set: Boolean(primaryContactId),
    },
  })
  revalidatePath(`/clients/${client.id}`)
  revalidatePath('/clients')
  redirect(`/clients/${client.id}?state=profile_saved`)
}

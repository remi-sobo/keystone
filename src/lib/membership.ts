import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * lib/membership.ts
 *
 * The viewer resolver for pages and layouts (the route-handler
 * equivalents live in lib/auth.ts). Reads under RLS with the session
 * client, so any membership row that comes back proves membership.
 *
 * First sign-in: a brand-new user has a session but an unclaimed
 * (user_id null) membership row. The resolver calls the email-keyed
 * claim RPC once and re-reads, so the invite path needs no extra step
 * anywhere else in the app.
 */

export interface PracticeMembership {
  practiceId: string
  practiceName: string
  role: 'owner' | 'consultant'
}

export interface ClientMembership {
  practiceId: string
  practiceName: string
  clientId: string
  clientName: string
}

export interface Viewer {
  user: User | null
  practice: PracticeMembership | null
  client: ClientMembership | null
}

async function readMemberships(
  supabase: SupabaseClient,
  userId: string
): Promise<{ practice: PracticeMembership | null; client: ClientMembership | null }> {
  const [pm, cm] = await Promise.all([
    supabase
      .from('practice_members')
      .select('practice_id, role, practices(name)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('practice_id, client_id, clients(name), practices(name)')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
  ])

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const practice = pm.data
    ? {
        practiceId: pm.data.practice_id as string,
        practiceName: ((pm.data.practices as any)?.name as string) ?? '',
        role: pm.data.role as 'owner' | 'consultant',
      }
    : null
  const client = cm.data
    ? {
        practiceId: cm.data.practice_id as string,
        practiceName: ((cm.data.practices as any)?.name as string) ?? '',
        clientId: cm.data.client_id as string,
        clientName: ((cm.data.clients as any)?.name as string) ?? '',
      }
    : null
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { practice, client }
}

/** Resolve the signed-in viewer and their memberships (claiming a
 *  pending email-keyed invite on first contact). */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, practice: null, client: null }

  let m = await readMemberships(supabase, user.id)
  if (!m.practice && !m.client) {
    // First sign-in on an invite: claim, then re-read once.
    await supabase.rpc('keystone_claim_membership')
    m = await readMemberships(supabase, user.id)
  }
  return { user, ...m }
}

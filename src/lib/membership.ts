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

/**
 * The sales lead (specs/keystone-sales.md). A practice_members row like
 * any other, and deliberately NOT surfaced as `practice`: the practice
 * layout and every practice route admit on `viewer.practice`, so
 * keeping the two populations in separate fields means the sales lead
 * cannot reach the delivery surface by a resolver oversight. The wall
 * itself is the RLS predicate in migration 0044; this is the app-layer
 * mirror of it.
 */
export interface SalesMembership {
  practiceId: string
  practiceName: string
  practiceMemberId: string
}

/**
 * The client hub member (specs/epayl-fundraising-hub.md): Keystone's
 * first stranger-facing population outside the delivery walls. Its own
 * field for the same reason the sales lead has one: the practice and
 * client layouts admit on their own fields, so a hub member cannot
 * reach any other surface by a resolver oversight. The wall itself is
 * the RLS predicate private.is_hub_member (migration 0046); this is
 * the app-layer mirror.
 */
export interface HubMembership {
  orgId: string
  orgSlug: string
  orgName: string
  practiceId: string
  fiscalYearStart: string | null
  theme: Record<string, unknown>
  vocabulary: Record<string, unknown>
}

export interface Viewer {
  user: User | null
  practice: PracticeMembership | null
  client: ClientMembership | null
  sales: SalesMembership | null
  hub: HubMembership | null
}

async function readMemberships(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  practice: PracticeMembership | null
  client: ClientMembership | null
  sales: SalesMembership | null
  hub: HubMembership | null
}> {
  const [pm, cm, hm] = await Promise.all([
    supabase
      .from('practice_members')
      .select('id, practice_id, role, practices(name)')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('practice_id, client_id, clients(name), practices(name)')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('hub_members')
      .select('org_id, practice_id, hub_orgs(slug, name, theme, vocabulary, fiscal_year_start)')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .limit(1)
      .maybeSingle(),
  ])

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const isSales = pm.data?.role === 'sales_lead'
  const practice =
    pm.data && !isSales
      ? {
          practiceId: pm.data.practice_id as string,
          practiceName: ((pm.data.practices as any)?.name as string) ?? '',
          role: pm.data.role as 'owner' | 'consultant',
        }
      : null
  const sales =
    pm.data && isSales
      ? {
          practiceId: pm.data.practice_id as string,
          practiceName: ((pm.data.practices as any)?.name as string) ?? '',
          practiceMemberId: pm.data.id as string,
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
  const hub = hm.data
    ? {
        orgId: hm.data.org_id as string,
        practiceId: hm.data.practice_id as string,
        orgSlug: ((hm.data.hub_orgs as any)?.slug as string) ?? '',
        orgName: ((hm.data.hub_orgs as any)?.name as string) ?? '',
        fiscalYearStart: ((hm.data.hub_orgs as any)?.fiscal_year_start as string | null) ?? null,
        theme: ((hm.data.hub_orgs as any)?.theme as Record<string, unknown>) ?? {},
        vocabulary: ((hm.data.hub_orgs as any)?.vocabulary as Record<string, unknown>) ?? {},
      }
    : null
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { practice, client, sales, hub }
}

/** Resolve the signed-in viewer and their memberships (claiming a
 *  pending email-keyed invite on first contact). */
export async function getViewer(): Promise<Viewer> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { user: null, practice: null, client: null, sales: null, hub: null }

  let m = await readMemberships(supabase, user.id)
  if (!m.practice && !m.client && !m.sales && !m.hub) {
    // First sign-in on an invite: claim, then re-read once.
    await supabase.rpc('keystone_claim_membership')
    m = await readMemberships(supabase, user.id)
  }
  return { user, ...m }
}

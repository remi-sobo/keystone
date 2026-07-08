import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Keystone auth resolvers. Assembled from two quarry patterns:
 *
 *   - BloomOS getOrgContext (ambition-angels lib/admin/auth.ts):
 *     cookie session plus a membership read under RLS, so any row that
 *     comes back proves membership.
 *   - Pathway requirePathwayOwner / requirePathwayMember (trellis
 *     lib/pathway/api.ts): the ctx-or-NextResponse return shape for
 *     App Router route handlers.
 *
 * Scope nouns are Keystone's two-level tenancy (specs/keystone.md
 * section 3): practice_id is the top tenant, client_id nests under it.
 * Both are ALWAYS resolved server-side from the authenticated user.
 * Never trust a practiceId or clientId the browser sends.
 *
 * The tables these resolvers read (practice_members, client_members)
 * land in Ring 1 with membership RLS and the seeded isolation matrix.
 */

export type PracticeRole = 'owner' | 'consultant'

export interface PracticeCtx {
  userId: string
  email: string
  practiceId: string
  role: PracticeRole
}

export interface ClientCtx {
  userId: string
  email: string
  practiceId: string
  clientId: string
}

/**
 * Admit a practice member (consultant surface). Pass role 'owner' to
 * gate owner-only writes. RLS on practice_members lets a user read only
 * rows for practices they belong to, so any row returned proves
 * membership. Returns the resolved context or a NextResponse error to
 * return as-is.
 */
export async function requirePracticeMember(
  role?: PracticeRole
): Promise<PracticeCtx | NextResponse> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let { data: membership } = await supabase
    .from('practice_members')
    .select('practice_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!membership) {
    // First contact on an email-keyed invite: claim once, re-read.
    await supabase.rpc('keystone_claim_membership')
    ;({ data: membership } = await supabase
      .from('practice_members')
      .select('practice_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle())
  }
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  if (role === 'owner' && membership.role !== 'owner') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  return {
    userId: user.id,
    email: user.email ?? '',
    practiceId: membership.practice_id,
    role: membership.role as PracticeRole,
  }
}

/**
 * Admit a client member (client surface). Resolves BOTH scope ids from
 * the membership row: the client dimension must never drop, or a future
 * client of the same practice could read SafeSpace's engagement (the
 * catastrophic leak named in specs/keystone.md section 9).
 *
 * The client surface is pure-RLS: routes that use this resolver lean on
 * the keystone RLS policies as the real wall and never touch the
 * service role.
 */
export async function requireClientMember(): Promise<ClientCtx | NextResponse> {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let { data: membership } = await supabase
    .from('client_members')
    .select('practice_id, client_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!membership) {
    // First contact on an email-keyed invite: claim once, re-read.
    await supabase.rpc('keystone_claim_membership')
    ;({ data: membership } = await supabase
      .from('client_members')
      .select('practice_id, client_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle())
  }
  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  return {
    userId: user.id,
    email: user.email ?? '',
    practiceId: membership.practice_id,
    clientId: membership.client_id,
  }
}

export function isErrorResponse<T>(v: T | NextResponse): v is NextResponse {
  return v instanceof NextResponse
}

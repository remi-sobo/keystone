import { NextResponse } from 'next/server'
import { requireSalesLead, isErrorResponse } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The live registration check (specs/keystone-sales.md, Ring 1). The
 * form calls this as the org name is typed, so a collision is refused
 * at the moment it costs nothing rather than three months later in an
 * argument.
 *
 * PURE RLS, like the client surface: no service role beneath this route
 * group. The verdict comes from keystone_sales_registration_check, a
 * SECURITY DEFINER function that checks the caller's membership itself
 * and returns ONE WORD about the org the caller typed. It never returns
 * the house-account list and it never returns the client list, so this
 * endpoint cannot be walked to learn who the practice works with beyond
 * the name already in the caller's hand.
 *
 * The real wall is the insert trigger in migration 0044. This route is
 * the courtesy; the database is the enforcement.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await requireSalesLead()
  if (isErrorResponse(ctx)) return ctx

  let org = ''
  try {
    const body = (await req.json()) as { org?: unknown }
    org = typeof body.org === 'string' ? body.org.trim().slice(0, 200) : ''
  } catch {
    return NextResponse.json({ verdict: 'empty' })
  }
  if (!org) return NextResponse.json({ verdict: 'empty' })

  const supabase = await createServerSupabase()
  // The practice id is resolved server-side from the membership row,
  // never read off the request.
  const { data, error } = await supabase.rpc('keystone_sales_registration_check', {
    p_practice: ctx.practiceId,
    p_org: org,
  })
  if (error) {
    console.error('[sales] registration check failed:', error.message)
    return NextResponse.json({ verdict: 'forbidden' }, { status: 500 })
  }
  return NextResponse.json({ verdict: data ?? 'forbidden' })
}

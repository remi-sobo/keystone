import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The sign-in landing. Handles both Supabase link shapes:
 *   - ?code=            PKCE code exchange (magic link and Google OAuth)
 *   - ?token_hash=&type= OTP verification (the magic-link email)
 * Then claims any pending email-keyed membership (the RPC is a no-op
 * when there is nothing to claim) and routes the viewer to their
 * surface. A session with no membership goes back to /login with an
 * honest message; it reads nothing anywhere (RLS).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')

  // An OAuth bounce (cancelled at Google's consent screen, or a
  // provider error) arrives with error params instead of a code.
  // Honest state: "did not finish", not "expired".
  if (url.searchParams.get('error')) {
    return NextResponse.redirect(new URL('/login?state=cancelled', url.origin))
  }

  const supabase = await createServerSupabase()

  let authed = false
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authed = !error
  } else if (tokenHash && type === 'email') {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    authed = !error
  }

  if (!authed) {
    return NextResponse.redirect(new URL('/login?state=expired', url.origin))
  }

  // First sign-in on an invite: link the pending membership row.
  await supabase.rpc('keystone_claim_membership')

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login?state=expired', url.origin))

  const [pm, cm] = await Promise.all([
    supabase.from('practice_members').select('id').eq('user_id', user.id).limit(1).maybeSingle(),
    supabase.from('client_members').select('id').eq('user_id', user.id).limit(1).maybeSingle(),
  ])

  if (cm.data) return NextResponse.redirect(new URL('/home', url.origin))
  if (pm.data) return NextResponse.redirect(new URL('/today', url.origin))
  return NextResponse.redirect(new URL('/login?state=no_access', url.origin))
}

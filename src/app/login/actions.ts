'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkRateLimits } from '@/lib/rateLimit'
import { headers } from 'next/headers'

/**
 * The two sign-in doors (spec 6.4, amended 2026-07-09).
 *
 * 1. The magic link, first and the fail-safe. The invite model is
 *    email-keyed: the verified JWT email is the credential, and a
 *    pending membership row is claimed on first sign-in. Works for
 *    every invited email, Google-hosted or not.
 * 2. Google OAuth, the no-inbox-roundtrip door. Google also presents a
 *    verified email, so the same claim path runs unchanged, and
 *    Supabase links the identity to any existing account with that
 *    verified email. Nothing about membership or scope differs by door.
 *
 * No passwords, by decision: setting one and resetting one each need an
 * email link anyway, so a password removes no email dependency and only
 * adds a credential that can be stuffed on the stranger-facing surface.
 *
 * Auth-flow shape quarried from the Team Esface login actions; the
 * mechanisms differ because Keystone members are invited by email,
 * never self-registered.
 */

const EmailShape = z.object({ email: z.string().email().max(200) })

// Sign-in attempts are auth surface: rate limit per IP. The Google door
// gets its own buckets (an OAuth start sends no email, and a burst on
// one door should never lock the other).
const LOGIN_IP_PER_MIN = { kind: 'login:ip:min', windowMs: 60 * 1000, max: 5 }
const LOGIN_IP_PER_HOUR = { kind: 'login:ip:hour', windowMs: 60 * 60 * 1000, max: 20 }
const GOOGLE_IP_PER_MIN = { kind: 'login:google:ip:min', windowMs: 60 * 1000, max: 10 }
const GOOGLE_IP_PER_HOUR = { kind: 'login:google:ip:hour', windowMs: 60 * 60 * 1000, max: 40 }

async function requestContext(): Promise<{ ip: string; origin: string }> {
  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim()
  // The redirect targets THIS deployment (production or preview), so
  // the sign-in lands where the person started. Supabase only honors it
  // when the origin is on the auth redirect allow-list.
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return { ip, origin: `${proto}://${host}` }
}

export async function signInWithEmail(formData: FormData): Promise<void> {
  const parsed = EmailShape.safeParse({ email: formData.get('email') })
  if (!parsed.success) redirect('/login?state=invalid')

  const { ip, origin } = await requestContext()
  const limited = await checkRateLimits([
    { config: LOGIN_IP_PER_MIN, key: ip },
    { config: LOGIN_IP_PER_HOUR, key: ip },
  ])
  if (!limited.ok) redirect('/login?state=slow')

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      // The account is created on first sign-in; membership (or the
      // lack of it) is what gates every read, so a stranger's account
      // holds nothing.
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  // Honest states only: a failed send never reads as sent.
  if (error) {
    console.error('[login] otp send failed:', error.message)
    redirect('/login?state=error')
  }
  redirect(`/login?state=sent&email=${encodeURIComponent(parsed.data.email)}`)
}

export async function signInWithGoogle(): Promise<void> {
  const { ip, origin } = await requestContext()
  const limited = await checkRateLimits([
    { config: GOOGLE_IP_PER_MIN, key: ip },
    { config: GOOGLE_IP_PER_HOUR, key: ip },
  ])
  if (!limited.ok) redirect('/login?state=slow')

  const supabase = await createServerSupabase()
  // Server-side start: the SSR client stores the PKCE verifier in a
  // cookie and hands back Google's authorize URL for us to redirect to.
  // Google returns to Supabase, Supabase returns to /auth/callback with
  // a ?code= the existing exchange already handles.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  })

  // Honest states only: a start that failed (provider disabled, config
  // missing) says so instead of bouncing silently.
  if (error || !data.url) {
    console.error('[login] google sign-in could not start:', error?.message ?? 'no url returned')
    redirect('/login?state=google_error')
  }
  redirect(data.url)
}

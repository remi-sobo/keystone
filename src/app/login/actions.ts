'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkRateLimits } from '@/lib/rateLimit'
import { headers } from 'next/headers'

/**
 * The email-first sign-in (spec 6.4). A magic link, because the invite
 * model is email-keyed: the verified JWT email is the credential, and a
 * pending membership row is claimed on first sign-in. No passwords to
 * provision, no bearer invite links.
 *
 * Auth-flow shape quarried from the Team Esface login actions; the
 * mechanism differs (OTP link, not password) because Keystone members
 * are invited by email, never self-registered with a password.
 */

const EmailShape = z.object({ email: z.string().email().max(200) })

// Sign-in attempts are auth surface: rate limit per IP.
const LOGIN_IP_PER_MIN = { kind: 'login:ip:min', windowMs: 60 * 1000, max: 5 }
const LOGIN_IP_PER_HOUR = { kind: 'login:ip:hour', windowMs: 60 * 60 * 1000, max: 20 }

export async function signInWithEmail(formData: FormData): Promise<void> {
  const parsed = EmailShape.safeParse({ email: formData.get('email') })
  if (!parsed.success) redirect('/login?state=invalid')

  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim()
  // The redirect targets THIS deployment (production or preview), so
  // the link lands where the person started. Supabase only honors it
  // when the origin is on the auth redirect allow-list.
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const origin = `${proto}://${host}`
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

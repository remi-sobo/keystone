'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { headers } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'
import { checkRateLimits } from '@/lib/rateLimit'

/**
 * The hub door's sign-in action. NOT a second auth path: the same
 * signInWithOtp, the same callback, the same email-keyed claim, the
 * same rate-limit buckets as /login. Only the copy and the redirect
 * differ, because the door wears the org's own system.
 *
 * Enumeration-safe by construction: every valid submission lands on
 * the same sent state whether or not the address holds a membership,
 * and an address without one signs into an account that reads zero
 * rows anywhere.
 */

const EmailShape = z.object({ email: z.string().email().max(200) })

const LOGIN_IP_PER_MIN = { kind: 'login:ip:min', windowMs: 60 * 1000, max: 5 }
const LOGIN_IP_PER_HOUR = { kind: 'login:ip:hour', windowMs: 60 * 60 * 1000, max: 20 }

export async function signInToHub(orgSlug: string, formData: FormData): Promise<void> {
  const slug = encodeURIComponent(orgSlug)
  const parsed = EmailShape.safeParse({ email: formData.get('email') })
  if (!parsed.success) redirect(`/${slug}?state=invalid`)

  const h = await headers()
  const ip = (h.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? 'https'

  const limited = await checkRateLimits([
    { config: LOGIN_IP_PER_MIN, key: ip },
    { config: LOGIN_IP_PER_HOUR, key: ip },
  ])
  if (!limited.ok) redirect(`/${slug}?state=slow`)

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${proto}://${host}/auth/callback`,
    },
  })

  // Honest states only: a failed send never reads as sent.
  if (error) {
    console.error('[hub door] otp send failed:', error.message)
    redirect(`/${slug}?state=error`)
  }
  redirect(`/${slug}?state=sent&email=${encodeURIComponent(parsed.data.email)}`)
}

export async function signOutOfHub(): Promise<void> {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  redirect('/login')
}

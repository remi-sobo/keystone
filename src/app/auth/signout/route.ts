import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { env } from '@/lib/env'

/**
 * Sign out, both surfaces. POST only (a GET must never end a session;
 * prefetchers and link previews issue GETs). Clears the Supabase
 * session cookies and lands on the login page.
 */
export async function POST() {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', env.NEXT_PUBLIC_APP_URL), { status: 303 })
}

export async function GET() {
  return NextResponse.redirect(new URL('/login', env.NEXT_PUBLIC_APP_URL), { status: 303 })
}

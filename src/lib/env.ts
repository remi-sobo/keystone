import { z } from 'zod'

/**
 * Environment configuration for Keystone.
 * Adapted from the Trellis platform layer (lib/env.ts).
 *
 * CRITICAL CONTRACT FOR NEXT.JS BUILDS: read this before refactoring.
 *
 * Next.js only inlines client-side env vars via DIRECT property access,
 * as in `process.env.NEXT_PUBLIC_X`. It does NOT inject the entire
 * `process.env` object into the browser bundle. So:
 *
 *   process.env.NEXT_PUBLIC_SUPABASE_URL    // inlined at build
 *   const all = process.env                 // {} in the browser
 *   schema.parse(process.env)               // parses {} in the browser
 *
 * Every NEXT_PUBLIC_* var below MUST be read as a direct property
 * reference. Values are then funnel-checked with zod for shape, but
 * never via `parse(process.env)`.
 *
 * History (Trellis): a previous version used schema.parse(process.env),
 * which silently fell back to placeholder values in production because
 * the parse received an empty object client-side. Site went down. Do
 * not reintroduce.
 */

// The only place a Keystone domain literal may live outside .env.example.
// The config-integrity gate enforces this (e2e/config-integrity.spec.ts).
// CONFIRM 1 in specs/keystone.md: the production domain is not final.
const APP_URL_FALLBACK = 'https://app.soboconsulting.com'
const SUPABASE_URL_FALLBACK = 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY_FALLBACK = 'placeholder-anon-key'

const isServer = typeof window === 'undefined'

// Direct property access, required for Next.js inlining.
const _NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const _NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const _NEXT_PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL

// Server-only values. In the browser they are undefined; we expose ''
// so the type stays string and browser code that touches them fails at
// the call site instead of getting `undefined.method()`.
const _SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const _ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const _RESEND_API_KEY = process.env.RESEND_API_KEY
const _KEYSTONE_FROM_EMAIL = process.env.KEYSTONE_FROM_EMAIL
const _GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const _GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const _CRON_SECRET = process.env.CRON_SECRET
const _CLAUDE_MODEL_EXTRACT = process.env.CLAUDE_MODEL_EXTRACT
const _CLAUDE_MODEL_DEFAULT = process.env.CLAUDE_MODEL_DEFAULT
const _CLAUDE_MODEL_FAST = process.env.CLAUDE_MODEL_FAST
const _CLAUDE_MODEL_FRONTIER = process.env.CLAUDE_MODEL_FRONTIER
const _AI_SPEND_HARD_USD_MONTH = process.env.AI_SPEND_HARD_USD_MONTH
const _AI_SPEND_WARN_USD_MONTH = process.env.AI_SPEND_WARN_USD_MONTH

// Schemas validate shape only; never used to read process.env.
const PublicShape = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
})

// Soft fallbacks: Supabase URL/key get placeholders so createClient does
// not throw at module load when an operator forgets to set them. The
// placeholder URL parses as a valid URL; an actual query against it
// fails with a network error at the call site, which is the failure we
// want: loud at the operation, not a whole-app crash at boot.
const NEXT_PUBLIC_SUPABASE_URL =
  _NEXT_PUBLIC_SUPABASE_URL && _NEXT_PUBLIC_SUPABASE_URL.length > 0
    ? _NEXT_PUBLIC_SUPABASE_URL
    : SUPABASE_URL_FALLBACK
const NEXT_PUBLIC_SUPABASE_ANON_KEY =
  _NEXT_PUBLIC_SUPABASE_ANON_KEY && _NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0
    ? _NEXT_PUBLIC_SUPABASE_ANON_KEY
    : SUPABASE_ANON_KEY_FALLBACK
const NEXT_PUBLIC_APP_URL =
  _NEXT_PUBLIC_APP_URL && _NEXT_PUBLIC_APP_URL.length > 0
    ? _NEXT_PUBLIC_APP_URL
    : APP_URL_FALLBACK

// One-time server warns when a load-bearing public var falls back.
// Visible in deploy logs; never visible to users.
if (isServer) {
  if (!_NEXT_PUBLIC_SUPABASE_URL) {
    console.warn('[env] NEXT_PUBLIC_SUPABASE_URL not set; Supabase calls will fail')
  }
  if (!_NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.warn('[env] NEXT_PUBLIC_SUPABASE_ANON_KEY not set; Supabase calls will fail')
  }
  if (!_NEXT_PUBLIC_APP_URL) {
    console.warn(`[env] NEXT_PUBLIC_APP_URL not set; using fallback ${APP_URL_FALLBACK}`)
  }
}

// Server-only shape diagnostic. The browser bundle skips this since it
// cannot meaningfully read process.env beyond the inlined accesses above.
if (isServer) {
  const result = PublicShape.safeParse({
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL,
  })
  if (!result.success) {
    for (const issue of result.error.issues) {
      console.warn(`[env] ${issue.path.join('.')}: ${issue.message}`)
    }
  }
}

export const env = {
  NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL,
  SUPABASE_SERVICE_ROLE_KEY: _SUPABASE_SERVICE_ROLE_KEY || '',
  ANTHROPIC_API_KEY: _ANTHROPIC_API_KEY || '',
  RESEND_API_KEY: _RESEND_API_KEY,
  KEYSTONE_FROM_EMAIL: _KEYSTONE_FROM_EMAIL,
  GOOGLE_CLIENT_ID: _GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: _GOOGLE_CLIENT_SECRET,
  CRON_SECRET: _CRON_SECRET,
  CLAUDE_MODEL_EXTRACT: _CLAUDE_MODEL_EXTRACT,
  CLAUDE_MODEL_DEFAULT: _CLAUDE_MODEL_DEFAULT,
  CLAUDE_MODEL_FAST: _CLAUDE_MODEL_FAST,
  CLAUDE_MODEL_FRONTIER: _CLAUDE_MODEL_FRONTIER,
  AI_SPEND_HARD_USD_MONTH: _AI_SPEND_HARD_USD_MONTH,
  AI_SPEND_WARN_USD_MONTH: _AI_SPEND_WARN_USD_MONTH,
} as const

/**
 * Lazy server-side accessor. Throws when called for a missing var, but
 * only at the call site, never at module load.
 */
export function requireServerEnv<K extends keyof typeof env>(name: K): string {
  const v = env[name]
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`[env] ${String(name)} is not set`)
  }
  return v
}

import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * Sliding-window rate limiter. Copied from Trellis lib/rateLimit.ts with
 * the Pages Router surface dropped (Keystone is App Router only) and the
 * limit table rewritten for Keystone's endpoints.
 *
 * Backing store: Supabase Postgres (shared across all serverless
 * instances) when the service-role key is configured; otherwise an
 * in-process Map (per-instance, soft) as a fallback.
 *
 * With the DB configured the limits are durable: a single caller cannot
 * multiply a window cap by fanning out across cold instances. All limits
 * for one request are evaluated in a SINGLE atomic RPC
 * (`rate_limit_check`), which serializes per bucket with an advisory
 * lock and records hits in `rate_limit_hits`. Both ship in the Ring 1
 * migration. If the service-role key is absent (local dev, preview
 * without secrets) the limiter degrades to the in-memory store.
 *
 * The DB path fails OPEN to the in-memory store: the RPC runs in one
 * transaction, so an error rolls back cleanly with nothing consumed.
 */

export interface RateLimitConfig {
  // Logical name, used as the bucket key prefix.
  kind: string
  // Window length in milliseconds.
  windowMs: number
  // Max events allowed inside the window.
  max: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

function bucketKey(kind: string, key: string): string {
  return `${kind}:${key}`
}

// In-memory fallback store.

interface Bucket {
  // Timestamps (ms) of recent hits, trimmed to the current window.
  hits: number[]
}

const stores = new Map<string, Bucket>()

function tryConsumeMemory(
  config: RateLimitConfig,
  key: string,
  now: number
): RateLimitResult {
  const bk = bucketKey(config.kind, key)
  const cutoff = now - config.windowMs
  const bucket = stores.get(bk) || { hits: [] }
  bucket.hits = bucket.hits.filter((t) => t > cutoff)

  if (bucket.hits.length >= config.max) {
    const earliest = bucket.hits[0]
    const retryAfterSec = Math.max(1, Math.ceil((earliest + config.windowMs - now) / 1000))
    stores.set(bk, bucket)
    return { allowed: false, remaining: 0, retryAfterSec }
  }

  bucket.hits.push(now)
  stores.set(bk, bucket)
  return {
    allowed: true,
    remaining: config.max - bucket.hits.length,
    retryAfterSec: 0,
  }
}

/**
 * Evaluate the limits in order against the in-memory store, consuming a
 * slot from each until one blocks. Returns the 0-based index of the
 * first blocked limit (or -1 if all pass) plus its retry-after.
 */
function checkBatchMemory(
  limits: Array<{ config: RateLimitConfig; key: string }>
): { blockedIndex: number; retryAfterSec: number } {
  const now = Date.now()
  for (let i = 0; i < limits.length; i++) {
    const r = tryConsumeMemory(limits[i].config, limits[i].key, now)
    if (!r.allowed) return { blockedIndex: i, retryAfterSec: r.retryAfterSec }
  }
  return { blockedIndex: -1, retryAfterSec: 0 }
}

// Supabase (shared Postgres) store.

const dbEnabled = Boolean(
  process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL
)

/**
 * Evaluate all limits for a request in one atomic RPC. The DB function
 * loops the limits in order, locks each bucket, trims expired hits,
 * counts, and either records the hit or returns the blocking index, so
 * this is a single round trip regardless of how many limits the route
 * applies. Throws on any DB error (caller falls back to memory).
 */
async function checkBatchDb(
  limits: Array<{ config: RateLimitConfig; key: string }>
): Promise<{ blockedIndex: number; retryAfterSec: number }> {
  const { data, error } = await supabaseAdmin.rpc('rate_limit_check', {
    p_keys: limits.map((l) => bucketKey(l.config.kind, l.key)),
    p_windows_ms: limits.map((l) => l.config.windowMs),
    p_maxes: limits.map((l) => l.config.max),
  })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row.blocked_index !== 'number') {
    throw new Error('rate_limit_check returned an unexpected shape')
  }
  return { blockedIndex: row.blocked_index, retryAfterSec: row.retry_after_sec ?? 0 }
}

/**
 * Framework-agnostic limit check. Evaluates the limits in order and
 * returns the first one that blocks. Uses the shared Postgres store when
 * configured, falling back to the in-memory store on absence or error.
 */
export async function checkRateLimits(
  limits: Array<{ config: RateLimitConfig; key: string }>
): Promise<{ ok: boolean; kind: string; retryAfterSec: number }> {
  if (limits.length === 0) return { ok: true, kind: '', retryAfterSec: 0 }

  let result: { blockedIndex: number; retryAfterSec: number }
  if (dbEnabled) {
    try {
      result = await checkBatchDb(limits)
    } catch {
      // Fail open to the in-memory store: the RPC is one transaction, so
      // an error consumed nothing in the DB and falling back is clean.
      result = checkBatchMemory(limits)
    }
  } else {
    result = checkBatchMemory(limits)
  }

  if (result.blockedIndex >= 0) {
    return {
      ok: false,
      kind: limits[result.blockedIndex].config.kind,
      retryAfterSec: result.retryAfterSec,
    }
  }
  return { ok: true, kind: '', retryAfterSec: 0 }
}

/**
 * Try to consume one slot for a single (kind, key). Thin wrapper over
 * `checkRateLimits`, kept for callers/tests that want a one-shot check.
 */
export async function tryConsume(
  config: RateLimitConfig,
  key: string
): Promise<RateLimitResult> {
  const r = await checkRateLimits([{ config, key }])
  return {
    allowed: r.ok,
    remaining: 0, // not tracked by the shared store
    retryAfterSec: r.retryAfterSec,
  }
}

/**
 * App Router helper: apply one or more rate limits to a route handler.
 * Returns null when the request may proceed, or a ready-to-return 429
 * Response with a Retry-After header when a limit is hit.
 */
export async function enforceRateLimits(
  limits: Array<{ config: RateLimitConfig; key: string }>
): Promise<Response | null> {
  const result = await checkRateLimits(limits)
  if (!result.ok) {
    return new Response(
      JSON.stringify({
        error: 'Too many requests',
        kind: result.kind,
        retryAfterSec: result.retryAfterSec,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfterSec),
        },
      }
    )
  }
  return null
}

/** Best-effort client IP extraction from the proxy chain (App Router). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  const first = fwd?.split(',')[0]
  return (first || 'unknown').trim()
}

// Active limits. Starting guardrails, not tight quotas: a normal
// engagement never hits them. Each ring tunes its own entries and the
// values are mirrored in SECURITY.md when they change.

export const LIMITS = {
  // Transcript extraction (Ring 3). The heaviest single call in the app
  // (top tier model, long transcript input), so the caps are tight.
  AI_EXTRACT_PER_MIN: { kind: 'ai-extract:user:min', windowMs: 60 * 1000, max: 3 },
  AI_EXTRACT_PER_HOUR: { kind: 'ai-extract:user:hour', windowMs: 60 * 60 * 1000, max: 12 },

  // Engagement Q&A (Ring 3+). Interactive, so per-minute plus hourly.
  AI_QA_PER_MIN: { kind: 'ai-qa:user:min', windowMs: 60 * 1000, max: 10 },
  AI_QA_PER_HOUR: { kind: 'ai-qa:user:hour', windowMs: 60 * 60 * 1000, max: 60 },

  // Digest drafting (Ring 6). Cron plus a manual re-draft button.
  AI_DIGEST_PER_HOUR: { kind: 'ai-digest:practice:hour', windowMs: 60 * 60 * 1000, max: 10 },

  // Resource suggestion (Ring 4). Fast tier, still capped.
  AI_SUGGEST_PER_MIN: { kind: 'ai-suggest:user:min', windowMs: 60 * 1000, max: 10 },
  AI_SUGGEST_PER_HOUR: { kind: 'ai-suggest:user:hour', windowMs: 60 * 60 * 1000, max: 60 },

  // Messages (Ring 5): every client message triggers a Resend email, so
  // this bounds email spend as well as noise.
  MESSAGES_PER_MIN: { kind: 'messages:user:min', windowMs: 60 * 1000, max: 10 },
  MESSAGES_PER_HOUR: { kind: 'messages:user:hour', windowMs: 60 * 60 * 1000, max: 100 },

  // Session booking (Ring 2). Deliberate, infrequent actions.
  BOOKING_PER_MIN: { kind: 'booking:user:min', windowMs: 60 * 1000, max: 5 },
  BOOKING_PER_HOUR: { kind: 'booking:user:hour', windowMs: 60 * 60 * 1000, max: 20 },

  // Calendar sync (Ring 2): each run fans out Google API calls.
  CALENDAR_SYNC_PER_HOUR: {
    kind: 'calendar-sync:user:hour',
    windowMs: 60 * 60 * 1000,
    max: 30,
  },

  // The per-practice model-spend ceiling: a call-count proxy for spend,
  // consumed by lib/spend.ts before every AI call. Every Keystone AI
  // call is max_tokens-bounded, so capping calls per practice per day
  // and per month bounds the bill by construction. The month-to-date
  // dollar cap in lib/spend.ts is the real ceiling; these are the cheap
  // fast-path backstop.
  AI_PRACTICE_PER_DAY: { kind: 'ai-spend:practice:day', windowMs: 24 * 60 * 60 * 1000, max: 200 },
  AI_PRACTICE_PER_MONTH: {
    kind: 'ai-spend:practice:month',
    windowMs: 30 * 24 * 60 * 60 * 1000,
    max: 2000,
  },
} as const

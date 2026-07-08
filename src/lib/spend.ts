import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { env } from '@/lib/env'

/**
 * lib/spend.ts
 *
 * The per-practice model-spend ceiling and the cost ledger. Merged from
 * Trellis lib/cy/spend.ts (call-count caps plus month-to-date dollar
 * gate) and lib/cy/spendLedger.ts (per-call dollar pricing), with the
 * scope renamed from household to practice and the ledger keyed by
 * engagement so the spec's "spend ledger shows per-engagement cost"
 * line (specs/keystone.md section 8) is satisfiable.
 *
 * checkPracticeSpend CONSUMES a slot when it passes; that is the
 * accounting: one model call, one slot. Over budget, callers degrade
 * gracefully (skip the suggestion, tell the consultant plainly) rather
 * than failing.
 */

interface SpendLimit {
  kind: string
  windowMs: number
  max: number
}

/** The default per-practice ceilings: a daily and a monthly cap. */
export const DEFAULT_SPEND_LIMITS: SpendLimit[] = [
  LIMITS.AI_PRACTICE_PER_DAY,
  LIMITS.AI_PRACTICE_PER_MONTH,
]

/**
 * The model tier a call resolved to, for per-tier accounting. Mirrors
 * modelForTask in lib/claudeModel.ts.
 */
export type SpendTier = 'fast' | 'default' | 'extract' | 'frontier' | 'explicit'

const MONTH_MS = 30 * 24 * 60 * 60 * 1000

/**
 * A per-tier counter rides in the same atomic limiter batch as the
 * ceiling. max is effectively unbounded: these buckets COUNT permitted
 * calls per tier per practice (visible in rate_limit_hits), they never
 * block. The ceiling rows above are the only enforcers.
 */
function tierCounter(tier: SpendTier): SpendLimit {
  return { kind: `ai-spend:tier:${tier}:month`, windowMs: MONTH_MS, max: 1_000_000 }
}

/** Raised by the shared client when a practice is over its spend
 *  ceiling. The caller catches this and degrades gracefully instead of
 *  treating it as a failure. */
export class AiBudgetExceededError extends Error {
  retryAfterSec: number
  constructor(retryAfterSec: number) {
    super('ai_budget_exceeded')
    this.name = 'AiBudgetExceededError'
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * The per-practice monthly DOLLAR ceiling, the real cap that the
 * call-count proxy only approximates. Env-overridable; set the hard cap
 * to 0 to disable the dollar gate.
 */
export const AI_SPEND_HARD_USD_MONTH = Number(env.AI_SPEND_HARD_USD_MONTH ?? '50')
export const AI_SPEND_WARN_USD_MONTH = Number(env.AI_SPEND_WARN_USD_MONTH ?? '40')

/** Pure verdict for a month-to-date dollar figure against a warn/hard pair. */
export function dollarVerdict(
  spentUsd: number,
  warnUsd: number,
  hardUsd: number
): 'ok' | 'warn' | 'stop' {
  if (hardUsd > 0 && spentUsd >= hardUsd) return 'stop'
  if (warnUsd > 0 && spentUsd >= warnUsd) return 'warn'
  return 'ok'
}

/** Seconds until the start of next month (the dollar cap's reset). */
function secondsUntilNextMonth(): number {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return Math.max(60, Math.round((next.getTime() - now.getTime()) / 1000))
}

/**
 * The month-to-date dollar gate. FAIL-OPEN by construction: if the
 * ledger sum is unavailable (no key, query error), the AI feature is not
 * blocked; the call-count caps stay the backstop. A ledger hiccup must
 * never take a feature down. The `keystone_ai_spend_mtd` RPC ships in
 * the Ring 1 migration alongside the ledger table.
 */
async function checkPracticeDollars(
  practiceId: string
): Promise<{ ok: boolean; retryAfterSec: number }> {
  if (!(AI_SPEND_HARD_USD_MONTH > 0)) return { ok: true, retryAfterSec: 0 }
  try {
    const { data, error } = await supabaseAdmin.rpc('keystone_ai_spend_mtd', {
      p_practice_id: practiceId,
    })
    if (error) {
      console.error('[ai-spend] mtd query failed (fail-open):', error.message)
      return { ok: true, retryAfterSec: 0 }
    }
    const spent = typeof data === 'number' ? data : Number(data ?? 0)
    const verdict = dollarVerdict(spent, AI_SPEND_WARN_USD_MONTH, AI_SPEND_HARD_USD_MONTH)
    if (verdict === 'stop') return { ok: false, retryAfterSec: secondsUntilNextMonth() }
    if (verdict === 'warn') {
      console.warn(
        `[ai-spend] practice ${practiceId} at $${spent.toFixed(2)} of ` +
          `$${AI_SPEND_HARD_USD_MONTH} monthly AI ceiling`
      )
    }
    return { ok: true, retryAfterSec: 0 }
  } catch (e) {
    console.error('[ai-spend] mtd threw (fail-open):', e instanceof Error ? e.message : 'unknown')
    return { ok: true, retryAfterSec: 0 }
  }
}

/**
 * Check (and consume) one unit of the practice's model-spend budget.
 * Returns ok=false with a retry-after when the practice is over budget.
 * Limits are injectable so the ceiling logic is unit-testable without
 * exhausting the real caps; production passes the defaults.
 */
export async function checkPracticeSpend(
  practiceId: string,
  limits: SpendLimit[] = DEFAULT_SPEND_LIMITS,
  tier?: SpendTier
): Promise<{ ok: boolean; retryAfterSec: number }> {
  if (!practiceId) return { ok: true, retryAfterSec: 0 }
  const batch = tier ? [...limits, tierCounter(tier)] : limits
  const r = await checkRateLimits(batch.map((config) => ({ config, key: practiceId })))
  if (!r.ok) return { ok: r.ok, retryAfterSec: r.retryAfterSec }
  return checkPracticeDollars(practiceId)
}

// The cost ledger.

/** The Anthropic Messages response `usage` block (the fields we price). */
export interface ClaudeUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/**
 * Per-million-token input/output prices, verified against the Anthropic
 * model catalog on 2026-07-08. Sonnet 5 carries an introductory price
 * ($2/$10) through 2026-08-31; the sticker price is recorded here so the
 * ledger never under-counts.
 */
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-fable-5': { input: 10, output: 50 },
}

/** When the resolved model id is not in the table (an env override),
 *  fall back to the tier's representative model. */
const TIER_MODEL: Record<SpendTier, string> = {
  fast: 'claude-haiku-4-5-20251001',
  default: 'claude-sonnet-5',
  extract: 'claude-opus-4-8',
  frontier: 'claude-fable-5',
  explicit: 'claude-sonnet-5',
}

/** Cache reads are ~0.1x input; 5-minute cache writes ~1.25x input. */
const CACHE_READ_MULTIPLIER = 0.1
const CACHE_WRITE_MULTIPLIER = 1.25

/**
 * The dollar cost of one model call. Prices by the response's model id,
 * falling back to the tier's representative model for unknown ids.
 * Cache tokens are priced separately so cached input is not over-billed.
 * Pure: no I/O, unit-testable without a network or DB.
 */
export function priceCall(model: string, tier: SpendTier, usage: ClaudeUsage): number {
  const price = PRICING_PER_MTOK[model] ?? PRICING_PER_MTOK[TIER_MODEL[tier]]
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheCreate = usage.cache_creation_input_tokens ?? 0
  const cost =
    input * price.input +
    output * price.output +
    cacheRead * price.input * CACHE_READ_MULTIPLIER +
    cacheCreate * price.input * CACHE_WRITE_MULTIPLIER
  return cost / 1_000_000
}

/**
 * Record one model call's real cost for a practice, keyed by engagement
 * where the call has one. Best-effort: a missing practice or usage is a
 * silent no-op, and any insert failure is logged and swallowed so it can
 * never delay or fail the response it is accounting for.
 * METADATA ONLY: never stores prompt or response text.
 * The `ai_spend_ledger` table ships in the Ring 1 migration.
 */
export async function logAiSpend(opts: {
  practiceId: string
  engagementId?: string | null
  model: string
  tier: SpendTier
  usage: ClaudeUsage | undefined
  task?: string
}): Promise<void> {
  if (!opts.practiceId || !opts.usage) return
  try {
    const { error } = await supabaseAdmin.from('ai_spend_ledger').insert({
      practice_id: opts.practiceId,
      engagement_id: opts.engagementId ?? null,
      model: opts.model,
      tier: opts.tier,
      task: opts.task ?? null,
      input_tokens: opts.usage.input_tokens ?? 0,
      output_tokens: opts.usage.output_tokens ?? 0,
      cache_read_tokens: opts.usage.cache_read_input_tokens ?? 0,
      cache_creation_tokens: opts.usage.cache_creation_input_tokens ?? 0,
      cost_usd: priceCall(opts.model, opts.tier, opts.usage),
    })
    if (error) console.error('[ai-spend-ledger] insert failed:', error.message)
  } catch (e) {
    console.error('[ai-spend-ledger] insert threw:', e instanceof Error ? e.message : 'unknown')
  }
}

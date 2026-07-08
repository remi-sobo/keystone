import {
  ANTHROPIC_VERSION,
  CLAUDE_MODEL_DEFAULT,
  FALLBACK_MODEL,
  modelForTask,
  type ModelTask,
} from '@/lib/claudeModel'
import {
  AiBudgetExceededError,
  checkPracticeSpend,
  logAiSpend,
  type SpendTier,
} from '@/lib/spend'
import { env } from '@/lib/env'

/**
 * lib/anthropicClient.ts
 *
 * The single shared client for Keystone's calls to the Anthropic
 * Messages API. Copied from Trellis lib/cy/anthropicClient.ts with the
 * spend scope renamed to practice/engagement and one addition: the
 * fallback contract required by the Ring 0 prompt.
 *
 * The fallback contract (see FALLBACK_MODEL in lib/claudeModel.ts):
 *   1. Every model declares a fallback model.
 *   2. A response with stop_reason "refusal" (an HTTP 200; the safety
 *      classifiers on newer models decline the request rather than
 *      erroring) is retried ONCE on the declared fallback.
 *   3. Which model actually answered is logged and returned to the
 *      caller, so extraction quality is attributable.
 *
 * Keystone AI writes NOTHING directly: every call site parses the
 * response, validates it with Zod, and writes an ai_proposals row. The
 * accept route is the only path into live tables (spec section 5).
 */

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'

// Prompt-caching beta flag. Sent only when a call opts into cacheSystem,
// so the header surface for non-caching callers is unchanged.
const PROMPT_CACHING_BETA = 'prompt-caching-2024-07-31'

export interface CallClaudeOptions {
  /** The system prompt. Optional, matching the API. */
  system?: string
  /** The messages array, passed through to the API untouched. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages: any[]
  /** Output cap. Required: every call site sets its own, so there is no default. */
  maxTokens: number
  /** Model id. Defaults to the `task` tier, or CLAUDE_MODEL_DEFAULT when
   *  neither is set. An explicit model always wins over `task`. */
  model?: string
  /** The kind of work this call does, used to pick a model tier via
   *  lib/claudeModel. Ignored when `model` is set. */
  task?: ModelTask
  /**
   * Prompt-cache the system prompt. When true, `system` is sent as a
   * single ephemeral cache block (and the caching beta header is added)
   * so a repeated stable system prefix is not re-billed at full input
   * price across turns. Off by default and opt-in per surface.
   */
  cacheSystem?: boolean
  /** Optional tools passthrough (e.g. a forced submit tool for
   *  structured output). Omitted entirely when undefined. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[]
  /** Optional tool_choice passthrough (pin one submit tool so the model
   *  cannot answer in prose). Omitted entirely when undefined. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toolChoice?: any
  /** anthropic-version header. Defaults to ANTHROPIC_VERSION. */
  version?: string
  /** API key. Defaults to env.ANTHROPIC_API_KEY. */
  apiKey?: string
  /** Extra headers merged on top of the standard triplet. */
  extraHeaders?: Record<string, string>
  /**
   * When set, the per-practice model-spend ceiling is enforced before
   * the call: over budget, callClaude throws AiBudgetExceededError (the
   * caller degrades gracefully) and no HTTP request is made. Every
   * Keystone AI surface passes this; leaving it off is for tests only.
   */
  practiceId?: string
  /** Rides into the cost ledger so spend is legible per engagement. */
  engagementId?: string | null
}

export interface ClaudeRequest {
  url: string
  headers: Record<string, string>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: Record<string, any>
}

/** Resolve the spend-accounting tier for a call, mirroring the model
 *  pick in buildClaudeRequest. */
export function spendTierFor(opts: Pick<CallClaudeOptions, 'model' | 'task'>): SpendTier {
  if (opts.model) return 'explicit'
  switch (opts.task) {
    case 'suggest':
    case 'voice_sweep':
      return 'fast'
    case 'extract':
      return 'extract'
    default:
      return 'default'
  }
}

/**
 * Assemble the URL, headers, and body for a model call. PURE (no
 * network, no DB), so request shaping, model tiering, and the
 * prompt-cache block are unit-testable without hitting the API.
 * callClaude is this plus the wallet guard plus fetch.
 */
export function buildClaudeRequest(opts: CallClaudeOptions): ClaudeRequest {
  const {
    system,
    messages,
    maxTokens,
    model,
    task,
    tools,
    toolChoice,
    version = ANTHROPIC_VERSION,
    apiKey = env.ANTHROPIC_API_KEY,
    extraHeaders,
    cacheSystem,
  } = opts

  // An explicit model wins; otherwise the task picks the tier; otherwise
  // the capable default. One source of truth for the tier map.
  const resolvedModel = model || (task ? modelForTask(task) : CLAUDE_MODEL_DEFAULT)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey as string,
    'anthropic-version': version,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: resolvedModel,
    max_tokens: maxTokens,
    messages,
  }
  if (system !== undefined) {
    if (cacheSystem) {
      // One ephemeral cache block over the stable system prefix.
      body.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      headers['anthropic-beta'] = PROMPT_CACHING_BETA
    } else {
      body.system = system
    }
  }
  if (tools !== undefined) body.tools = tools
  if (toolChoice !== undefined) body.tool_choice = toolChoice
  if (extraHeaders) Object.assign(headers, extraHeaders)

  return { url: ANTHROPIC_MESSAGES_URL, headers, body }
}

/**
 * POST a single (non-streaming) request to the Anthropic Messages API
 * and return the raw Response. The caller owns the response: read
 * res.ok / res.status, call res.json(), apply its own error policy.
 * Network errors propagate to the caller.
 *
 * The spend guard runs first when a practiceId is supplied: over budget,
 * throw before the HTTP call so nothing is spent. On success the call's
 * real dollar cost is recorded per practice and engagement; the clone
 * means reading usage never consumes the body the caller still parses,
 * and the fire-and-forget insert can never delay the response.
 */
export async function callClaude(opts: CallClaudeOptions): Promise<Response> {
  if (opts.practiceId) {
    const spend = await checkPracticeSpend(opts.practiceId, undefined, spendTierFor(opts))
    if (!spend.ok) throw new AiBudgetExceededError(spend.retryAfterSec)
  }

  const { url, headers, body } = buildClaudeRequest(opts)
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (opts.practiceId && res.ok) {
    const tier = spendTierFor(opts)
    const model = body.model as string
    res
      .clone()
      .json()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((data: any) =>
        logAiSpend({
          practiceId: opts.practiceId!,
          engagementId: opts.engagementId,
          model,
          tier,
          usage: data?.usage,
          task: opts.task,
        })
      )
      .catch((e) =>
        console.error(
          '[ai-spend-ledger] capture failed:',
          e instanceof Error ? e.message : 'unknown'
        )
      )
  }

  return res
}

export interface ClaudeResult {
  /** The parsed Messages API response body. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  /** Which model actually answered (the fallback contract's third leg). */
  modelUsed: string
  /** True when the declared fallback model produced the answer. */
  fellBack: boolean
}

/** Thrown when the API returns a non-2xx status. */
export class ClaudeApiError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(`anthropic_api_error ${status}: ${detail.slice(0, 300)}`)
    this.name = 'ClaudeApiError'
    this.status = status
  }
}

/**
 * callClaude plus the fallback contract: parse the response, and when
 * stop_reason is "refusal" (checked BEFORE reading content; the body can
 * be empty on a refusal) retry once on the model's declared fallback.
 * Logs which model answered either way. Use this wrapper for every
 * Keystone AI job; use raw callClaude only when a caller needs the
 * unparsed Response.
 */
export async function callClaudeChecked(opts: CallClaudeOptions): Promise<ClaudeResult> {
  const first = await callClaude(opts)
  if (!first.ok) throw new ClaudeApiError(first.status, await first.text())
  const firstData = await first.json()
  const firstModel: string = firstData?.model ?? buildClaudeRequest(opts).body.model

  if (firstData?.stop_reason !== 'refusal') {
    return { data: firstData, modelUsed: firstModel, fellBack: false }
  }

  const fallback = FALLBACK_MODEL[firstModel]
  if (!fallback) {
    console.warn(`[anthropic] refusal from ${firstModel}; no declared fallback, returning as-is`)
    return { data: firstData, modelUsed: firstModel, fellBack: false }
  }

  console.warn(`[anthropic] refusal from ${firstModel}; retrying once on ${fallback}`)
  const second = await callClaude({ ...opts, model: fallback, task: undefined })
  if (!second.ok) throw new ClaudeApiError(second.status, await second.text())
  const secondData = await second.json()
  const secondModel: string = secondData?.model ?? fallback

  console.warn(
    `[anthropic] answered by ${secondData?.stop_reason === 'refusal' ? `${secondModel} (also refused)` : secondModel} after fallback`
  )
  return { data: secondData, modelUsed: secondModel, fellBack: true }
}

import { env } from '@/lib/env'

/**
 * lib/claudeModel.ts
 *
 * Single source of truth for the Anthropic model ids used by every
 * Keystone endpoint that calls the Claude API. Adapted from Trellis
 * lib/claudeModel.ts; the task names are Keystone's four AI jobs
 * (specs/keystone.md section 4: transcript extraction, digest draft,
 * resource suggestion, engagement Q&A) plus the voice sweep.
 *
 * Model ids and pricing verified against the Anthropic model catalog on
 * 2026-07-08. Override any tier at deploy time with its env var.
 */

/** Transcript extraction: the highest-stakes job (client PII, structured
 *  output that becomes homework). Runs the top Opus tier. */
export const CLAUDE_MODEL_EXTRACT: string =
  env.CLAUDE_MODEL_EXTRACT || 'claude-opus-4-8'

/** Digest drafting and engagement Q&A: capable default tier. */
export const CLAUDE_MODEL_DEFAULT: string =
  env.CLAUDE_MODEL_DEFAULT || 'claude-sonnet-5'

/** Resource suggestion and the voice sweep: high-frequency, low-stakes
 *  work on the fast tier. */
export const CLAUDE_MODEL_FAST: string =
  env.CLAUDE_MODEL_FAST || 'claude-haiku-4-5-20251001'

/**
 * The frontier tier. Present per the Ring 0 prompt but wired to NO job:
 * no ModelTask resolves to it. If a future ring adopts it, note that
 * Fable 5 rejects any explicit `thinking` config other than adaptive,
 * requires 30-day data retention, and can return stop_reason "refusal"
 * from its safety classifiers, which is why the fallback contract in
 * lib/anthropicClient.ts exists.
 */
export const CLAUDE_MODEL_FRONTIER: string =
  env.CLAUDE_MODEL_FRONTIER || 'claude-fable-5'

/** The kind of work a Keystone AI call is doing, used to pick the tier. */
export type ModelTask = 'extract' | 'digest' | 'qa' | 'suggest' | 'voice_sweep' | 'case_study'

/**
 * Pick the model id for a task. Centralizing this here means there is
 * ONE place that knows which model serves which job, and a model
 * deprecation is a one-line fix.
 */
export function modelForTask(task: ModelTask): string {
  switch (task) {
    case 'extract':
      return CLAUDE_MODEL_EXTRACT
    case 'suggest':
    case 'voice_sweep':
      return CLAUDE_MODEL_FAST
    case 'digest':
    case 'qa':
    case 'case_study':
    default:
      return CLAUDE_MODEL_DEFAULT
  }
}

/**
 * The declared fallback model per model id, the first leg of the
 * fallback contract (implemented in lib/anthropicClient.ts): when a call
 * returns stop_reason "refusal", retry ONCE on the declared fallback and
 * log which model answered. Single retry, so the map cannot loop.
 */
export const FALLBACK_MODEL: Record<string, string> = {
  'claude-fable-5': 'claude-opus-4-8',
  'claude-opus-4-8': 'claude-sonnet-5',
  'claude-sonnet-5': 'claude-opus-4-8',
  'claude-haiku-4-5-20251001': 'claude-sonnet-5',
}

/** Anthropic API version pinned at the same point as the quarry apps. */
export const ANTHROPIC_VERSION = '2023-06-01'

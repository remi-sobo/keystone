import { supabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * lib/voiceViolations.ts
 *
 * The non-blocking voice-drift logger. Copied from Trellis
 * lib/voice/logViolation.ts with the scope renamed to practice.
 *
 * When a human-facing AI surface drifts, the sweep cleans the output and
 * calls this to record a row in voice_violations (Ring 1 migration). It
 * is fire-and-forget by contract: a logging failure must NEVER delay or
 * break the user-facing response, so callers do not await it and every
 * error is swallowed after a console line.
 *
 * Privacy: only the model's own output (capped) and metadata are stored,
 * never the user's prompt and never transcript content.
 *
 * SERVER-ONLY (imports the service-role client). Never import from the
 * client surface; the sweep runs in practice-surface routes and cron.
 */

const EXCERPT_CAP = 280

export interface VoiceViolationRecord {
  practiceId?: string | null
  /** A stable surface label, e.g. 'digest_draft', 'extract_actions'. */
  source: string
  /** Lowercase violation codes from validateVoice. */
  violations: string[]
  /** The drifted model output (capped here). Never the user's prompt. */
  rawExcerpt?: string
  /** The cleaned output (capped here). */
  cleanedExcerpt?: string
  /** Whether the surface re-asked the model once before cleaning. */
  retried?: boolean
}

/**
 * Insert one drift row. Fire-and-forget: returns a promise the caller
 * may ignore. Never throws. Resolves false on failure, true on write.
 */
export async function logVoiceViolation(rec: VoiceViolationRecord): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.from('voice_violations').insert({
      practice_id: rec.practiceId ?? null,
      source: rec.source,
      violations: rec.violations ?? [],
      raw_excerpt: rec.rawExcerpt ? rec.rawExcerpt.slice(0, EXCERPT_CAP) : null,
      cleaned_excerpt: rec.cleanedExcerpt ? rec.cleanedExcerpt.slice(0, EXCERPT_CAP) : null,
      retried: rec.retried === true,
    })
    if (error) {
      console.error('[voice-violations] insert failed:', error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[voice-violations] insert threw:', e instanceof Error ? e.message : 'unknown')
    return false
  }
}

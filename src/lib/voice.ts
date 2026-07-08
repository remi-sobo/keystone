/**
 * lib/voice.ts
 *
 * The single voice validator for Keystone. Copied from the consolidated
 * Trellis validator (lib/voice/validate.ts) and re-valued with the SOBO
 * banned-word list from the voice guide and the Ring 0 prompt.
 *
 * Keystone's voice (specs/keystone.md section 6.6): warm and direct, no
 * em dashes, no banned filler words, no markdown in prose surfaces, no
 * emoji. Every surface that emits model prose to a human runs this gate
 * at the boundary (the voice_sweep task); a failed gate is logged via
 * lib/voiceViolations.ts so drift is visible.
 *
 * PURE MODULE: no I/O, no imports beyond the language, safe to import
 * from client components and from the config-integrity gate.
 */

// The SOBO banned words. The first eight are named in the voice guide;
// the rest are the same class of filler, carried from the R&W list.
export const BANNED_WORDS = [
  'transformative',
  'holistic',
  'pivotal',
  'leverage',
  'unlock',
  'seamless',
  'robust',
  'elevate',
  'delve',
  'empower',
  'revolutionize',
  'synergy',
] as const

// ES5-compatible emoji detection: the BMP symbol/dingbat blocks plus the
// SMP emoji blocks via their UTF-16 high-surrogate ranges.
const EMOJI_RE = /[☀-➿]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g

export interface VoiceResult {
  /** true when the text is clean under the full ruleset. */
  ok: boolean
  /** Lowercase violation codes, e.g. 'em_dash', 'banned_word:unlock'. */
  violations: string[]
  /** The text with mechanical violations (dashes, markdown, emoji)
   *  repaired. Word-level drift is logged, not rewritten: rewriting
   *  prose without the model makes it worse. */
  cleaned: string
}

/** The dash-plus-banned-words check, the minimal gate. */
export function violatesVoice(text: string): string[] {
  const violations: string[] = []
  if (/—|–|--/.test(text)) violations.push('em_dash')
  const lower = text.toLowerCase()
  for (const w of BANNED_WORDS) {
    if (lower.includes(w)) violations.push(`banned_word:${w}`)
  }
  return violations
}

/** Mechanical repair for the dash rule. */
export function cleanVoice(text: string): string {
  return text.replace(/\s*(—|–|--)\s*/g, ', ').replace(/,\s*,/g, ',')
}

function cleanText(text: string): string {
  return cleanVoice(text)
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^[-•]\s/gm, '')
    .replace(/^#{1,3}\s/gm, '')
    .replace(EMOJI_RE, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

/**
 * The full gate for human-facing prose: dashes, banned words, markdown,
 * emoji. Returns lowercase codes and the cleaned text. This is what the
 * voice sweep on AI output calls (generate, sweep, retry once with a
 * stricter prompt, ship the cleaned text, never the raw violation).
 */
export function validateVoice(text: string): VoiceResult {
  const codes = violatesVoice(text)
  if (/\*\*|(^|\s)\*[^*]|^#{1,3}\s|^[-•]\s/m.test(text)) codes.push('markdown')
  if (EMOJI_RE.test(text)) codes.push('emoji')
  if (codes.length === 0) return { ok: true, violations: [], cleaned: text }
  return { ok: false, violations: codes, cleaned: cleanText(text) }
}

/**
 * Retry wrapper, the Arc shape: the caller provides callModel(system,
 * user) returning assistant text. Pass on first success; otherwise retry
 * once with a sharpened system prompt, then ship the cleaned text.
 * `onViolation` fires once, non-blocking (wire it to logVoiceViolation).
 */
export async function withVoiceSweep(
  systemPrompt: string,
  userMessage: string,
  callModel: (system: string, user: string) => Promise<string>,
  opts: {
    source?: string
    onViolation?: (event: {
      source: string
      violations: string[]
      rawExcerpt: string
      cleanedExcerpt: string
      retried: boolean
    }) => Promise<void> | void
  } = {}
): Promise<string> {
  const source = opts.source ?? 'unknown'
  const first = await callModel(systemPrompt, userMessage)
  const firstCheck = validateVoice(first)
  if (firstCheck.ok) return first

  const stricterSystem = `${systemPrompt}

CORRECTION NEEDED: your previous response violated the voice rules. Violations: ${firstCheck.violations.join(', ')}.

Rewrite your response:
- ZERO em dashes or en dashes. Use commas, colons, or short sentences.
- None of these words: ${BANNED_WORDS.join(', ')}.
- No markdown formatting. No emoji.
- Warm, direct, plain. Short sentences.`

  const second = await callModel(stricterSystem, userMessage)
  const secondCheck = validateVoice(second)

  if (opts.onViolation) {
    try {
      await opts.onViolation({
        source,
        violations: firstCheck.violations,
        rawExcerpt: first.slice(0, 280),
        cleanedExcerpt: secondCheck.cleaned.slice(0, 280),
        retried: true,
      })
    } catch {
      // Logging failure must never break the user-facing response.
    }
  }

  return secondCheck.ok ? second : secondCheck.cleaned
}

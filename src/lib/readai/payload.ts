import crypto from 'crypto'
import { z } from 'zod'
import { ExtractionPayload, TRANSCRIPT_CHAR_CAP, type Extraction } from '@/lib/extract'

/**
 * lib/readai/payload.ts
 *
 * The Read AI webhook payload (support.read.ai, "Getting Started with
 * Webhooks"; the meeting_end trigger). PURE: parse, normalize, and
 * shape, so e2e/readai-engine.spec.ts tests it with no network or DB.
 *
 * Everything in the payload is untrusted. Read AI does not sign its
 * webhooks, so the URL secret is the only proof of origin, and even a
 * genuine payload is AI-written text about a call: it lands as data in
 * an inert proposal, never as a live record.
 */

/** Read AI webhooks carry no signature; the secret rides the URL. */
export function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!expected || !given) return false
  const a = crypto.createHash('sha256').update(given).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

const Text = z.object({ text: z.string() }).passthrough()
const Person = z
  .object({ name: z.string().nullish(), email: z.string().nullish() })
  .passthrough()

// Timestamps arrive as ISO strings or Unix milliseconds (the docs show
// both); either is accepted and normalized to a Date.
const Stamp = z.union([z.string(), z.number()])

export const ReadAiWebhook = z
  .object({
    session_id: z.string().min(1).max(100),
    trigger: z.string().max(60).optional(),
    title: z.string().max(500).nullish(),
    start_time: Stamp.nullish(),
    end_time: Stamp.nullish(),
    participants: z.array(Person).max(200).nullish(),
    owner: Person.nullish(),
    summary: z.string().max(20_000).nullish(),
    action_items: z.array(Text).max(100).nullish(),
    key_questions: z.array(Text).max(100).nullish(),
    topics: z.array(Text).max(100).nullish(),
    report_url: z.string().max(500).nullish(),
    transcript: z
      .object({
        speakers: z.array(z.object({ name: z.string().nullish() }).passthrough()).nullish(),
        speaker_blocks: z
          .array(
            z
              .object({
                start_time: Stamp.nullish(),
                end_time: Stamp.nullish(),
                speaker: z.object({ name: z.string().nullish() }).passthrough().nullish(),
                words: z.string().nullish(),
              })
              .passthrough()
          )
          .max(20_000)
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()

export type ReadAiWebhookPayload = z.infer<typeof ReadAiWebhook>

export interface ReadAiMeeting {
  readaiId: string
  title: string | null
  startedAt: Date | null
  endedAt: Date | null
  /** Lowercased, deduplicated, owner included. */
  participantEmails: string[]
  summary: string
  actionItems: string[]
  transcript: string
  reportUrl: string | null
}

function toDate(v: string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : /^\d+$/.test(v) ? Number(v) : NaN
  const d = Number.isFinite(n) ? new Date(n) : new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Speaker blocks become plain "Name: words" lines, capped. */
export function transcriptText(p: ReadAiWebhookPayload): string {
  const blocks = p.transcript?.speaker_blocks ?? []
  const lines: string[] = []
  for (const b of blocks) {
    const words = (b.words ?? '').trim()
    if (!words) continue
    const who = (b.speaker?.name ?? '').trim() || 'Speaker'
    lines.push(`${who}: ${words}`)
  }
  return lines.join('\n').slice(0, TRANSCRIPT_CHAR_CAP)
}

/** Only an https link to Read AI's own app survives; anything else is dropped. */
export function safeReportUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return null
    if (u.hostname !== 'app.read.ai' && !u.hostname.endsWith('.read.ai')) return null
    return `${u.origin}${u.pathname}`
  } catch {
    return null
  }
}

export function normalizeMeeting(p: ReadAiWebhookPayload): ReadAiMeeting {
  const emails = new Set<string>()
  for (const person of [...(p.participants ?? []), ...(p.owner ? [p.owner] : [])]) {
    const e = (person.email ?? '').trim().toLowerCase()
    if (EMAIL_RE.test(e) && e.length <= 254) emails.add(e)
  }
  return {
    readaiId: p.session_id.trim(),
    title: p.title?.trim().slice(0, 300) || null,
    startedAt: toDate(p.start_time),
    endedAt: toDate(p.end_time),
    participantEmails: [...emails].sort(),
    summary: (p.summary ?? '').trim(),
    actionItems: (p.action_items ?? [])
      .map((a) => a.text.trim())
      .filter((t) => t.length > 0)
      .slice(0, 20),
    transcript: transcriptText(p),
    reportUrl: safeReportUrl(p.report_url),
  }
}

/**
 * Read AI's notes, shaped as an extraction proposal so the existing
 * review workspace is the one place a consultant edits and publishes.
 * Read AI gives no decisions list, so decisions start empty. Returns
 * null when there is no summary to propose (a meeting with only a
 * transcript still attaches; the consultant can run Keystone's own
 * extraction from it).
 */
export function proposalFromMeeting(m: ReadAiMeeting): Extraction | null {
  if (!m.summary) return null
  const parsed = ExtractionPayload.safeParse({
    summary_md: m.summary.slice(0, 4000),
    decisions_md: '',
    action_items: m.actionItems.map((title) => ({
      title: title.slice(0, 200),
      timing: 'standing',
    })),
  })
  return parsed.success ? parsed.data : null
}

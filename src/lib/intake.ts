import crypto from 'crypto'
import { z } from 'zod'

/**
 * The website lead intake contract (specs/website-to-keystone-lead-intake.md).
 *
 * Pure logic: the payload shape and the secret comparison. No database, no
 * network, so the gate spec can exercise every branch without a server.
 *
 * The payload is deliberately narrow. It can express a lead and nothing
 * else: no ids into Keystone's spine, no practice or client scope, no
 * flags, no free-form object beyond the fixed utm keys. A caller holding
 * the secret can create a staging row and that is the entire reach.
 * `.strict()` is load-bearing here, so an unexpected key is a 400 rather
 * than a silently ignored field.
 */

// Fixed keys, so a crafted payload cannot stuff arbitrary data into the
// jsonb column. Mirrors the site's own utmSchema.
export const utmSchema = z
  .object({
    utm_source: z.string().trim().max(200).optional(),
    utm_medium: z.string().trim().max(200).optional(),
    utm_campaign: z.string().trim().max(200).optional(),
    utm_term: z.string().trim().max(200).optional(),
    utm_content: z.string().trim().max(200).optional(),
  })
  .strict()

export const leadIntakeSchema = z
  .object({
    // The site's contact_submissions.id. The idempotency key.
    submission_id: z.string().uuid(),
    // Required: the collision check keys on this, so a lead without it
    // cannot be checked against the house accounts at all.
    org_name: z.string().trim().min(1).max(160),
    contact_name: z.string().trim().min(1).max(120),
    email: z.string().trim().min(3).max(200),
    audience: z.string().trim().max(40).nullish(),
    role: z.string().trim().max(80).nullish(),
    budget_band: z.string().trim().max(80).nullish(),
    message: z.string().trim().max(4000).nullish(),
    source_page: z.string().trim().max(500).nullish(),
    utm: utmSchema.nullish(),
    submitted_at: z.string().datetime({ offset: true }).nullish(),
  })
  .strict()

export type LeadIntakePayload = z.infer<typeof leadIntakeSchema>

/**
 * Constant-time secret comparison. `===` on a secret leaks its prefix
 * through timing; the rate limit bounds guessing, this removes the oracle
 * that would make guessing cheap. Length is compared first because
 * timingSafeEqual throws on a length mismatch, and a length difference is
 * not a secret worth protecting.
 */
export function secretMatches(
  expected: string | undefined,
  presented: string | null | undefined
): boolean {
  if (!expected || !presented) return false
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(presented, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** The staging row a validated payload becomes, minus the scope. */
export function stagingRow(payload: LeadIntakePayload, practiceId: string) {
  const utm = payload.utm && Object.keys(payload.utm).length > 0 ? payload.utm : null
  return {
    practice_id: practiceId,
    external_submission_id: payload.submission_id,
    org_name: payload.org_name,
    contact_name: payload.contact_name,
    email: payload.email,
    audience: payload.audience ?? null,
    role: payload.role ?? null,
    budget_band: payload.budget_band ?? null,
    message: payload.message ?? null,
    source_page: payload.source_page ?? null,
    utm,
    submitted_at: payload.submitted_at ?? null,
  }
}

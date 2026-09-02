import type { CallClaudeOptions } from '@/lib/anthropicClient'
import { hubMoney } from '@/lib/hubTheme'

/**
 * The hub's one drafting job (specs/epayl-fundraising-hub.md, phase
 * six): a thank-you note in the house voice, drafted INSIDE the
 * workflow on the donor's page, never a text box on the navigation.
 * Inert by construction: the draft is render-only, nothing sends, and
 * Kendra copies it or throws it away.
 *
 * The guardrails matter more than the prompt, and both live here as
 * pure functions the gate can test:
 *   - groundedFigures: every dollar figure in the draft must be one
 *     the caller supplied from real rows. An ungrounded figure fails
 *     the whole draft; in fundraising a confident wrong number costs
 *     a relationship.
 *   - checkHubVoice: the community is never described by what it
 *     lacks and development jargon never reaches a user. A violation
 *     fails the draft rather than getting patched.
 */

/** Phrases that never reach a user (docs/hub/house-voice.md). */
export const HUB_BANNED_PHRASES = [
  'at-risk',
  'at risk youth',
  'underserved',
  'underprivileged',
  'give back',
  'giving back',
  'gives back',
  'moves management',
  'cultivation',
  'cultivate',
  'prospecting',
  'donor pipeline',
] as const

export interface ThankYouFacts {
  orgName: string
  household: string
  greeting: string | null
  gifts: { amount_cents: number; gift_date: string | null; designation: string | null; kind: string }[]
  touches: { kind: string; occurred_on: string; note: string | null }[]
}

export function buildThankYouRequest(facts: ThankYouFacts): CallClaudeOptions {
  const giftLines = facts.gifts
    .slice(0, 6)
    .map(
      (g) =>
        `${hubMoney(g.amount_cents)}${g.gift_date ? ` on ${g.gift_date}` : ''}${
          g.designation ? ` for ${g.designation}` : ''
        }${g.kind === 'pledged' ? ' (promised, not yet in hand)' : ''}`
    )
    .join('; ')
  const touchLines = facts.touches
    .slice(0, 4)
    .map((t) => `${t.kind.replace('_', ' ')} on ${t.occurred_on}${t.note ? `: ${t.note}` : ''}`)
    .join('; ')

  return {
    system: [
      `You draft a short thank-you note from the leadership of ${facts.orgName} to one household, for the director to copy, edit, and send herself. Nothing you write is sent automatically.`,
      'Voice, strictly: plain, short, declarative sentences. Contractions always. No em dashes. No emoji. No markdown, no headings, no bullet points; a short letter in plain text.',
      'Never describe the community by what it lacks. Words like at-risk, underserved, and give back do not appear. No fundraising jargon of any kind.',
      'Use ONLY the dollar figures provided in the facts, written exactly as given. If no figure is provided, write the note without one. Never estimate, never round differently, never invent a number.',
      'One note, under 150 words, warm and specific, no signature block beyond a single closing line.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          `Household: ${facts.household}`,
          facts.greeting ? `They like to be greeted as: ${facts.greeting}` : null,
          facts.gifts.length > 0 ? `Their gifts on record here: ${giftLines}` : 'No gift is on record here; thank them for their part in the ministry without naming an amount.',
          touchLines ? `What they have heard from us lately: ${touchLines}` : 'Nothing is on record about what they have heard from us.',
          'Draft the thank-you note.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    maxTokens: 400,
    task: 'hub_draft',
  }
}

/** Pull the plain-text draft out of an API response. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractDraft(data: any): string | null {
  const block = Array.isArray(data?.content)
    ? data.content.find((c: { type?: string }) => c?.type === 'text')
    : null
  const text = typeof block?.text === 'string' ? block.text.trim() : ''
  return text.length > 0 ? text : null
}

/**
 * Every dollar figure in the draft must be one of the allowed cents
 * values, formatted as whole dollars. Anything else is ungrounded and
 * fails the draft.
 */
export function groundedFigures(
  draft: string,
  allowedCents: number[]
): { ok: boolean; ungrounded: string[] } {
  const allowed = new Set(allowedCents.map((c) => hubMoney(c)))
  const figures = draft.match(/\$[\d,]+(?:\.\d{1,2})?/g) ?? []
  const ungrounded = figures.filter((f) => {
    const normalized = '$' + Math.round(Number(f.replace(/[$,]/g, ''))).toLocaleString('en-US')
    return !allowed.has(normalized)
  })
  return { ok: ungrounded.length === 0, ungrounded }
}

/** The hub's own voice wall, on top of the shared Keystone gate. */
export function checkHubVoice(draft: string): { ok: boolean; violations: string[] } {
  const lower = draft.toLowerCase()
  const violations = HUB_BANNED_PHRASES.filter((p) => lower.includes(p))
  return { ok: violations.length === 0, violations: [...violations] }
}

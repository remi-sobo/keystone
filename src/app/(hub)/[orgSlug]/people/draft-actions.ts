'use server'

import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubContext } from '@/lib/hubPage'
import { checkRateLimits } from '@/lib/rateLimit'
import { callClaudeChecked } from '@/lib/anthropicClient'
import { AiBudgetExceededError } from '@/lib/spend'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'
import {
  buildThankYouRequest,
  checkHubVoice,
  extractDraft,
  groundedFigures,
} from '@/lib/hubDraft'

/**
 * The thank-you draft, inside the workflow (specs/
 * epayl-fundraising-hub.md, phase six). The permission story matches
 * the client Q&A precedent: the facts are read on THIS SESSION under
 * RLS, so the model can only be shown what this member can already
 * read; the call rides the one chokepoint (spend guard, cost ledger,
 * refusal fallback); the voice gate and the hub's own walls run at
 * the boundary; and the draft is RENDER-ONLY. Nothing sends, nothing
 * is stored; Kendra copies it or throws it away. A draft that invents
 * a dollar figure or describes the community by what it lacks is
 * thrown away whole, with an honest message, never patched.
 */

const AI_PER_MIN = { kind: 'hub:ai:min', windowMs: 60 * 1000, max: 4 }
const AI_PER_HOUR = { kind: 'hub:ai:hour', windowMs: 60 * 60 * 1000, max: 30 }

export interface DraftState {
  status: 'idle' | 'ok' | 'error'
  draft?: string
  message?: string
}

export async function draftThankYou(
  orgSlug: string,
  _prev: DraftState,
  formData: FormData
): Promise<DraftState> {
  const hub = await hubContext(orgSlug)
  if (!hub) return { status: 'error', message: 'Sign in again.' }
  const donorId = z.string().uuid().safeParse(formData.get('donor_id'))
  if (!donorId.success) return { status: 'error', message: 'That household could not be read.' }

  const limited = await checkRateLimits([
    { config: AI_PER_MIN, key: hub.orgId },
    { config: AI_PER_HOUR, key: hub.orgId },
  ])
  if (!limited.ok) {
    return { status: 'error', message: 'Too many drafts at once. Wait a minute and try again.' }
  }

  const supabase = await createServerSupabase()
  const [{ data: donor }, giftsRes, touchesRes] = await Promise.all([
    supabase
      .from('hub_donors')
      .select('id, household, greeting, do_not_contact')
      .eq('org_id', hub.orgId)
      .eq('id', donorId.data)
      .maybeSingle(),
    supabase
      .from('hub_gifts')
      .select('amount_cents, gift_date, designation, kind')
      .eq('org_id', hub.orgId)
      .eq('donor_id', donorId.data)
      .order('gift_date', { ascending: false, nullsFirst: false })
      .limit(6),
    supabase
      .from('hub_touches')
      .select('kind, occurred_on, note')
      .eq('org_id', hub.orgId)
      .eq('donor_id', donorId.data)
      .order('occurred_on', { ascending: false })
      .limit(4),
  ])
  if (!donor) return { status: 'error', message: 'That household could not be read.' }
  if (donor.do_not_contact) {
    return {
      status: 'error',
      message: 'This household is do-not-contact, so nothing gets drafted for them.',
    }
  }

  const gifts = (giftsRes.data ?? []).map((g) => ({
    amount_cents: Number(g.amount_cents),
    gift_date: g.gift_date,
    designation: g.designation,
    kind: g.kind,
  }))
  const request = buildThankYouRequest({
    orgName: hub.orgName,
    household: donor.household,
    greeting: donor.greeting,
    gifts,
    touches: touchesRes.data ?? [],
  })

  let result
  try {
    result = await callClaudeChecked({ ...request, practiceId: hub.practiceId })
  } catch (e) {
    if (e instanceof AiBudgetExceededError) {
      return { status: 'error', message: 'The AI budget for this month is spent.' }
    }
    console.error('[hub draft] call failed:', e instanceof Error ? e.message : 'unknown')
    return { status: 'error', message: 'Drafting is not available right now.' }
  }

  const draft = extractDraft(result.data)
  if (!draft) return { status: 'error', message: 'Nothing came back. Try again.' }

  // The walls, in order: figures grounded in real rows, the hub's own
  // voice, then the shared Keystone gate.
  const grounded = groundedFigures(draft, gifts.map((g) => g.amount_cents))
  if (!grounded.ok) {
    return {
      status: 'error',
      message: 'The draft made up a number, so it was thrown away whole. Try again.',
    }
  }
  const hubVoice = checkHubVoice(draft)
  if (!hubVoice.ok) {
    void logVoiceViolation({
      practiceId: hub.practiceId,
      source: 'hub_draft',
      violations: hubVoice.violations,
      rawExcerpt: draft.slice(0, 400),
      cleanedExcerpt: '',
    })
    return {
      status: 'error',
      message: 'The draft broke the house voice, so it was thrown away whole. Try again.',
    }
  }
  const check = validateVoice(draft)
  const finalDraft = check.ok ? draft : check.cleaned
  if (!check.ok) {
    void logVoiceViolation({
      practiceId: hub.practiceId,
      source: 'hub_draft',
      violations: check.violations,
      rawExcerpt: draft.slice(0, 400),
      cleanedExcerpt: finalDraft.slice(0, 400),
    })
  }

  return { status: 'ok', draft: finalDraft }
}

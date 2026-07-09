import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { callClaudeChecked } from '@/lib/anthropicClient'
import { AiBudgetExceededError } from '@/lib/spend'
import { checkRateLimits, LIMITS } from '@/lib/rateLimit'
import {
  buildDigestRequest,
  hasDigestContent,
  mondayOf,
  parseDigest,
  type DigestFacts,
} from '@/lib/digest'
import { validateVoice } from '@/lib/voice'
import { logVoiceViolation } from '@/lib/voiceViolations'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * The digest cron (Ring 6). Vercel invokes this on the schedule in
 * vercel.json (proposal under CONFIRM 6: Friday 3pm Pacific) with
 * Authorization: Bearer CRON_SECRET. Fail-closed: no secret configured,
 * no run. For every active engagement it gathers the week's REAL events
 * and either refuses (empty week, existing draft) or drafts through the
 * one AI chokepoint into an inert ai_proposals row. Nothing here sends
 * email and nothing touches a live table: the consultant's approval on
 * /today is the only path from draft to digests row to inbox.
 */

function fmtWhen(dt: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dt))
}

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET
  if (!secret) {
    console.error('[digest] CRON_SECRET is not set; refusing to run.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const weekOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const weekOf = mondayOf(now)

  const { data: engagements, error } = await supabaseAdmin
    .from('engagements')
    .select('id, title, practice_id, client_id, clients(name)')
    .eq('status', 'active')
  if (error) {
    console.error('[digest] engagement scan failed:', error.message)
    return NextResponse.json({ error: 'scan_failed' }, { status: 500 })
  }

  const out = { drafted: 0, empty: 0, existing: 0, failed: 0 }

  for (const e of engagements ?? []) {
    // One draft per engagement per week: an undecided or accepted
    // proposal for this week, or a sent digest, means skip.
    const [{ data: existingProposals }, { data: existingDigest }] = await Promise.all([
      supabaseAdmin
        .from('ai_proposals')
        .select('id, payload, status')
        .eq('kind', 'digest')
        .eq('engagement_id', e.id)
        .in('status', ['proposed', 'accepted']),
      supabaseAdmin
        .from('digests')
        .select('id')
        .eq('engagement_id', e.id)
        .eq('week_of', weekOf)
        .maybeSingle(),
    ])
    const hasThisWeek =
      !!existingDigest ||
      (existingProposals ?? []).some(
        (p) => (p.payload as { week_of?: string })?.week_of === weekOf
      )
    if (hasThisWeek) {
      out.existing++
      continue
    }

    const [held, shipped, done, stages, upcoming] = await Promise.all([
      supabaseAdmin
        .from('sessions')
        .select('starts_at, tz, kind')
        .eq('engagement_id', e.id)
        .in('status', ['booked', 'held'])
        .gte('starts_at', weekAgo)
        .lt('starts_at', nowIso),
      supabaseAdmin
        .from('deliverables')
        .select('title, delivered_on')
        .eq('engagement_id', e.id)
        .gte('delivered_on', weekAgo.slice(0, 10)),
      supabaseAdmin
        .from('action_items')
        .select('title, done_at')
        .eq('engagement_id', e.id)
        .eq('status', 'done')
        .gte('done_at', weekAgo),
      supabaseAdmin
        .from('workstream_stage_events')
        .select('to_stage, at, workstreams(title)')
        .eq('engagement_id', e.id)
        .gte('at', weekAgo),
      supabaseAdmin
        .from('sessions')
        .select('starts_at, tz, kind')
        .eq('engagement_id', e.id)
        .eq('status', 'booked')
        .gte('starts_at', nowIso)
        .lt('starts_at', weekOut),
    ])

    const facts: DigestFacts = {
      sessionsHeld: (held.data ?? []).map((s) => `${s.kind} session on ${fmtWhen(s.starts_at, s.tz)}`),
      deliverablesShipped: (shipped.data ?? []).map((d) => `${d.title} (${d.delivered_on})`),
      homeworkDone: (done.data ?? []).map((i) => i.title),
      stageChanges: (stages.data ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ev) => `${((ev.workstreams as any)?.title as string) ?? 'a workstream'} moved to ${ev.to_stage}`
      ),
      upcomingSessions: (upcoming.data ?? []).map(
        (s) => `${s.kind} session on ${fmtWhen(s.starts_at, s.tz)}`
      ),
    }

    // The refusal: an empty week gets no draft, full stop.
    if (!hasDigestContent(facts)) {
      out.empty++
      continue
    }

    const limited = await checkRateLimits([
      { config: LIMITS.AI_DIGEST_PER_HOUR, key: e.practice_id },
    ])
    if (!limited.ok) {
      out.failed++
      continue
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientName = ((e.clients as any)?.name as string) ?? 'the client'
    const request = buildDigestRequest(facts, {
      clientName,
      engagementTitle: e.title,
      weekOf,
    })

    let result
    try {
      result = await callClaudeChecked({
        ...request,
        practiceId: e.practice_id,
        engagementId: e.id,
      })
    } catch (err) {
      if (err instanceof AiBudgetExceededError) {
        console.warn('[digest] budget spent; skipping practice', e.practice_id)
      } else {
        console.error('[digest] model call failed:', err instanceof Error ? err.message : 'unknown')
      }
      out.failed++
      continue
    }

    const draft = parseDigest(result.data)
    if (!draft) {
      out.failed++
      continue
    }

    // The voice gate at the boundary: mechanical repairs ship, drift logs.
    for (const field of ['subject', 'draft_md'] as const) {
      const check = validateVoice(draft[field])
      if (!check.ok) {
        draft[field] = check.cleaned
        void logVoiceViolation({
          practiceId: e.practice_id,
          source: 'digest',
          violations: check.violations,
          rawExcerpt: draft[field].slice(0, 400),
          cleanedExcerpt: check.cleaned.slice(0, 400),
        })
      }
    }

    // The ONE write: an inert proposal row.
    const { error: insertError } = await supabaseAdmin.from('ai_proposals').insert({
      kind: 'digest',
      engagement_id: e.id,
      practice_id: e.practice_id,
      client_id: e.client_id,
      payload: { week_of: weekOf, subject: draft.subject, draft_md: draft.draft_md },
      model_used: result.modelUsed,
    })
    if (insertError) {
      console.error('[digest] proposal insert failed:', insertError.message)
      out.failed++
      continue
    }
    out.drafted++
  }

  return NextResponse.json(out)
}

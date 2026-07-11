import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { appBaseUrl, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { clientTeamRecipients, notify, practiceTeamRecipients } from '@/lib/notify'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * The notify cron (V2 4F). Vercel invokes this daily (vercel.json)
 * with Authorization: Bearer CRON_SECRET; fail-closed like the digest
 * cron. Two passes:
 *
 *   1. Materialize the homework reminders, dedupe-keyed so each item
 *      touches each person at most twice ever: once when due tomorrow,
 *      once at three days overdue (gate 4F-5).
 *   2. One batched email per recipient with anything new (unemailed),
 *      honoring email_mode; a day with nothing new sends nothing.
 *      Rows already read in-app are stamped without being sent.
 */

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const secret = env.CRON_SECRET
  if (!secret) {
    console.error('[notify] CRON_SECRET is not set; refusing to run.')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // ── Pass 1: the reminders ──────────────────────────────────────────
  const [{ data: dueSoon }, { data: overdue }] = await Promise.all([
    supabaseAdmin
      .from('action_items')
      .select('id, title, engagement_id, practice_id, client_id, assigned_client_member_id, assigned_practice_member_id')
      .eq('status', 'open')
      .eq('due_on', dayOffset(1)),
    supabaseAdmin
      .from('action_items')
      .select('id, title, engagement_id, practice_id, client_id, assigned_client_member_id, assigned_practice_member_id')
      .eq('status', 'open')
      .eq('due_on', dayOffset(-3)),
  ])

  let reminders = 0
  const remind = async (
    items: NonNullable<typeof dueSoon>,
    kind: 'homework_due' | 'homework_overdue',
    phrase: string
  ) => {
    for (const it of items) {
      const recipient = it.assigned_client_member_id
        ? { clientMemberId: it.assigned_client_member_id }
        : it.assigned_practice_member_id
          ? { practiceMemberId: it.assigned_practice_member_id }
          : null
      if (!recipient) continue
      await notify(
        {
          practiceId: it.practice_id,
          clientId: it.client_id,
          engagementId: it.engagement_id,
          kind,
          title: `${phrase}: ${it.title}`,
          href: it.assigned_client_member_id
            ? `/homework/${it.id}`
            : `/engagements/${it.engagement_id}/homework/${it.id}`,
          dedupeKey: `${kind}:${it.id}`,
        },
        [recipient]
      )
      reminders++
    }
  }
  await remind(dueSoon ?? [], 'homework_due', 'Due tomorrow')
  await remind(overdue ?? [], 'homework_overdue', 'Still open, due three days ago')

  // 3B: the session's own reminder, one touch the day before, to both
  // sides. The purpose line is the title when the consultant set one.
  const { data: tomorrowSessions } = await supabaseAdmin
    .from('sessions')
    .select('id, practice_id, client_id, engagement_id, purpose')
    .eq('status', 'booked')
    .gte('starts_at', `${dayOffset(1)}T00:00:00Z`)
    .lt('starts_at', `${dayOffset(2)}T00:00:00Z`)
  for (const s of tomorrowSessions ?? []) {
    const title = s.purpose ? `Tomorrow: ${s.purpose}` : 'Your session is tomorrow'
    const base = {
      practiceId: s.practice_id,
      clientId: s.client_id,
      engagementId: s.engagement_id,
      kind: 'session_reminder' as const,
      title,
      dedupeKey: `session_reminder:${s.id}`,
    }
    await notify({ ...base, href: `/sessions/${s.id}` }, await clientTeamRecipients(s.client_id))
    await notify(
      { ...base, href: `/sessions/${s.id}/notes` },
      await practiceTeamRecipients(s.practice_id)
    )
    reminders++
  }

  // ── Pass 2: one batched email per recipient ────────────────────────
  const { data: pendingRows } = await supabaseAdmin
    .from('notifications')
    .select('id, title, href, read_at, recipient_client_member_id, recipient_practice_member_id')
    .is('emailed_at', null)
    .order('created_at', { ascending: true })
    .limit(500)

  const byRecipient = new Map<string, NonNullable<typeof pendingRows>>()
  for (const row of pendingRows ?? []) {
    const key = row.recipient_client_member_id
      ? `c:${row.recipient_client_member_id}`
      : `p:${row.recipient_practice_member_id}`
    byRecipient.set(key, [...(byRecipient.get(key) ?? []), row])
  }

  const stampedIds: string[] = []
  let emails = 0
  for (const [key, rows] of byRecipient) {
    const [side, memberId] = key.split(':')
    const table = side === 'c' ? 'client_members' : 'practice_members'
    const prefCol = side === 'c' ? 'client_member_id' : 'practice_member_id'
    const [{ data: member }, { data: pref }] = await Promise.all([
      supabaseAdmin.from(table).select('email, user_id, revoked_at').eq('id', memberId).maybeSingle(),
      supabaseAdmin.from('notification_prefs').select('email_mode').eq(prefCol, memberId).maybeSingle(),
    ])

    const unread = rows.filter((r) => !r.read_at)
    const muted = (pref?.email_mode ?? 'batched') === 'off'
    const sendable = Boolean(member?.email && member?.user_id && !member?.revoked_at)

    if (unread.length === 0 || muted || !sendable) {
      // Nothing to say, or the user said not to: the queue still clears.
      stampedIds.push(...rows.map((r) => r.id))
      continue
    }

    const base = appBaseUrl()
    const listHtml = unread
      .map((r) => `<p><a href="${base}${r.href}">${escapeHtml(r.title)}</a></p>`)
      .join('\n')
    const result = await sendEmail({
      to: member!.email,
      subject:
        unread.length === 1
          ? 'One new thing in your engagement room'
          : `${unread.length} new things in your engagement room`,
      html: emailShell({
        eyebrow: 'New since your last visit',
        bodyHtml: listHtml,
        cta: { href: `${base}${side === 'c' ? '/messages' : '/today'}`, label: 'Open Keystone' },
      }),
    })
    if (result.ok) {
      stampedIds.push(...rows.map((r) => r.id))
      emails++
    } else {
      // Not stamped: tomorrow's run retries honestly.
      console.error('[notify] batch email failed:', result.status, result.detail)
    }
  }

  if (stampedIds.length > 0) {
    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ emailed_at: new Date().toISOString() })
      .in('id', stampedIds)
    if (error) console.error('[notify] emailed_at stamp failed:', error.message)
  }

  return NextResponse.json({ reminders, recipients: byRecipient.size, emails })
}

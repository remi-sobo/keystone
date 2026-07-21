import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { appBaseUrl, emailShell, escapeHtml, sendEmail } from '@/lib/email'
import { notify } from '@/lib/notify'

/**
 * lib/publishNotice.ts
 *
 * SERVER-ONLY, practice-surface callers only (the caller verifies
 * practice membership BEFORE this runs; the no-service-role guard keeps
 * it off the client surface). The publish-time touch: when a session
 * note goes shared or homework lands on a client member, the people it
 * concerns hear about it now instead of at the next daily cron.
 *
 * One email per recipient covering everything published in the same
 * breath (the note plus that person's homework), never one email per
 * row. The notification rows are emitted first through lib/notify.ts so
 * the in-app inbox agrees with the inbox in their mail; rows a send
 * reaches are stamped emailed_at so the daily batch never repeats them.
 * A muted recipient (email_mode off) keeps the in-app row and gets no
 * send; an unsendable one (no login yet, revoked) is left for the cron
 * to clear. Best effort throughout: a failed email must never fail the
 * publish that caused it.
 *
 * Discipline (SECURITY.md): titles and email lines are short facts
 * about the record, a homework title, a session date. Never note
 * bodies, never transcript text.
 */

export interface PublishedHomework {
  itemId: string
  clientMemberId: string
  title: string
  dueOn: string | null
}

function dueLabel(dueOn: string): string {
  try {
    return new Date(`${dueOn}T00:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return dueOn
  }
}

export async function sendPublishNotices(opts: {
  practiceId: string
  clientId: string
  engagementId: string
  /** Present when a session note was just published to the client. */
  note?: { sessionId: string; dateLabel: string | null }
  /** Client-side homework created in this publish, if any. */
  homework?: PublishedHomework[]
}): Promise<void> {
  try {
    const homework = opts.homework ?? []
    if (!opts.note && homework.length === 0) return

    const { data: members } = await supabaseAdmin
      .from('client_members')
      .select('id, email, user_id')
      .eq('client_id', opts.clientId)
      .is('revoked_at', null)
    if (!members || members.length === 0) return

    const noteTitle = opts.note
      ? opts.note.dateLabel
        ? `Session notes from ${opts.note.dateLabel} are ready`
        : 'Your session notes are ready'
      : null

    // The in-app rows first, so both inboxes tell the same story.
    if (opts.note && noteTitle) {
      await notify(
        {
          practiceId: opts.practiceId,
          clientId: opts.clientId,
          engagementId: opts.engagementId,
          kind: 'note_published',
          title: noteTitle,
          href: `/sessions/${opts.note.sessionId}`,
          dedupeKey: `note_published:${opts.note.sessionId}`,
        },
        members.map((m) => ({ clientMemberId: m.id }))
      )
    }
    for (const hw of homework) {
      await notify(
        {
          practiceId: opts.practiceId,
          clientId: opts.clientId,
          engagementId: opts.engagementId,
          kind: 'homework_assigned',
          title: `New homework: ${hw.title}`,
          href: `/homework/${hw.itemId}`,
          dedupeKey: `homework_assigned:${hw.itemId}`,
        },
        [{ clientMemberId: hw.clientMemberId }]
      )
    }

    // One send per person, honoring the mute.
    const { data: prefs } = await supabaseAdmin
      .from('notification_prefs')
      .select('client_member_id, email_mode')
      .in(
        'client_member_id',
        members.map((m) => m.id)
      )
    const muted = new Set(
      (prefs ?? []).filter((p) => p.email_mode === 'off').map((p) => p.client_member_id)
    )

    const base = appBaseUrl()
    for (const member of members) {
      const mine = homework.filter((hw) => hw.clientMemberId === member.id)
      const hasNote = Boolean(opts.note && noteTitle)
      if (!hasNote && mine.length === 0) continue
      if (muted.has(member.id) || !member.email || !member.user_id) continue

      const lines: string[] = []
      if (hasNote && opts.note) {
        lines.push(
          `<p style="margin:0 0 10px 0;"><a href="${base}/sessions/${opts.note.sessionId}" style="color:#1E3526;">${escapeHtml(noteTitle!)}</a></p>`
        )
      }
      if (mine.length > 0) {
        lines.push(`<p style="margin:0 0 6px 0;">Homework for you:</p>`)
        for (const hw of mine) {
          lines.push(
            `<p style="margin:0 0 6px 0;"><a href="${base}/homework/${hw.itemId}" style="color:#1E3526;">${escapeHtml(hw.title)}</a>${hw.dueOn ? `, due ${escapeHtml(dueLabel(hw.dueOn))}` : ''}</p>`
          )
        }
      }

      const subject =
        hasNote && mine.length > 0
          ? 'Notes and homework from your session'
          : hasNote
            ? 'Your session notes are ready'
            : 'New homework for you'

      const result = await sendEmail({
        to: member.email,
        subject,
        html: emailShell({
          eyebrow: 'Your engagement room',
          bodyHtml: lines.join('\n'),
          cta: { href: `${base}/home`, label: 'Open Keystone' },
        }),
      })

      if (result.ok) {
        const keys: string[] = []
        if (hasNote && opts.note) keys.push(`note_published:${opts.note.sessionId}:${member.id}`)
        for (const hw of mine) keys.push(`homework_assigned:${hw.itemId}:${member.id}`)
        const { error } = await supabaseAdmin
          .from('notifications')
          .update({ emailed_at: new Date().toISOString() })
          .in('dedupe_key', keys)
        if (error) console.error('[publish-notice] emailed_at stamp failed:', error.message)
      } else {
        // Not stamped: the daily cron retries honestly.
        console.error('[publish-notice] send failed:', result.status, result.detail)
      }
    }
  } catch (e) {
    console.error('[publish-notice] threw:', e instanceof Error ? e.message : 'unknown')
  }
}

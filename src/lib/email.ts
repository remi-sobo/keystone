import { env } from '@/lib/env'

/**
 * lib/email.ts
 *
 * SERVER-ONLY. Per-recipient Resend sends, copied from Trellis
 * lib/people/send.ts. Direct fetch, no SDK; degrades gracefully when the
 * key is absent (a warn plus an honest failure result, never a fake
 * success: a client's message must never show "sent" when it was not,
 * per specs/keystone.md section 9, silent email failure).
 *
 * Keystone never broadcasts: one recipient per call (digest sends loop
 * over client members individually).
 */

const DEFAULT_FROM = env.KEYSTONE_FROM_EMAIL || 'Keystone <hello@soboconsulting.com>'

export interface SendResult {
  ok: boolean
  status: number
  detail?: string
}

/** Send one email via Resend. */
export async function sendEmail(opts: {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}): Promise<SendResult> {
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set; skipping email.')
    return { ok: false, status: 0, detail: 'email not configured' }
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: opts.to,
        reply_to: opts.replyTo,
        subject: opts.subject,
        html: opts.html,
        text: opts.text || stripHtml(opts.html),
      }),
    })
    return { ok: res.ok, status: res.status, detail: res.ok ? undefined : await res.text() }
  } catch (e) {
    console.error('[email] send threw', e)
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : String(e) }
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** The public base URL for building deep links in notification emails. */
export function appBaseUrl(): string {
  return env.NEXT_PUBLIC_APP_URL
}

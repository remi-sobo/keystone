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

// The from-address fallback lives in env.ts so domain literals stay in
// one file (enforced by the config-integrity gate).
const DEFAULT_FROM = env.KEYSTONE_FROM_EMAIL

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

/**
 * The one branded email frame: paper background, ink text, a forest
 * link. Extracted from the Ring 6 digest so every Keystone email
 * (digest, invites, message notifications as they migrate) meets the
 * client in the same voice. Hex values mirror the frozen tokens.
 */
export function emailShell(opts: {
  eyebrow: string
  bodyHtml: string
  cta?: { href: string; label: string }
}): string {
  return [
    `<div style="max-width:560px;margin:0 auto;padding:24px;background:#FBF4EA;color:#1C1914;font-family:Georgia,serif;">`,
    `<p style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#4A453B;margin:0 0 18px 0;">${opts.eyebrow}</p>`,
    opts.bodyHtml,
    opts.cta
      ? `<p style="margin:18px 0 0 0;"><a href="${opts.cta.href}" style="color:#1E3526;">${opts.cta.label}</a></p>`
      : '',
    `</div>`,
  ].join('\n')
}

/** Escape user-sourced text landing inside email HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The public base URL for building deep links in notification emails. */
export function appBaseUrl(): string {
  return env.NEXT_PUBLIC_APP_URL
}

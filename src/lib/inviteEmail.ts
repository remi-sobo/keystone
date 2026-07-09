import { appBaseUrl, emailShell, escapeHtml } from '@/lib/email'

/**
 * lib/inviteEmail.ts
 *
 * The invite email as a designed artifact (specs/keystone-v2-admin-ui.md
 * section 6). Two variants, one law: the email carries NO credential.
 * It links to /login with the address prefilled; sign-in stays magic
 * link or Google, and the claim happens on the verified JWT email
 * exactly as it always has. A forwarded invite grants nothing.
 *
 * Copy rides the voice rules like every shipped string: warm, plain,
 * no em dashes, no urgency theater.
 */

export interface InviteEmail {
  subject: string
  html: string
}

export function buildInviteEmail(opts: {
  side: 'practice' | 'client'
  email: string
  practiceName: string
  /** The client organization's name; required for the client variant. */
  clientName?: string
}): InviteEmail {
  const loginHref = `${appBaseUrl()}/login?email=${encodeURIComponent(opts.email)}`
  const practice = escapeHtml(opts.practiceName)

  if (opts.side === 'client') {
    const client = escapeHtml(opts.clientName ?? 'your organization')
    return {
      subject: `Your room in Keystone, from ${opts.practiceName}`,
      html: emailShell({
        eyebrow: `Keystone / ${client}`,
        bodyHtml: [
          `<p style="margin:0 0 14px 0;">Hello. ${practice} set up a room in Keystone for the ${client} engagement, and this is your invitation into it.</p>`,
          `<p style="margin:0 0 14px 0;">Inside you will find the work as it stands: sessions and what each one needs from you, homework, deliverables as they ship, and the progress picture, all in one calm place.</p>`,
          `<p style="margin:0 0 14px 0;">Sign in with this email address and the door opens. There is no password to create.</p>`,
        ].join('\n'),
        cta: { href: loginHref, label: 'Come in' },
      }),
    }
  }

  return {
    subject: `Your seat at ${opts.practiceName} on Keystone`,
    html: emailShell({
      eyebrow: `Keystone / ${practice}`,
      bodyHtml: [
        `<p style="margin:0 0 14px 0;">You have a seat at ${practice} on Keystone, the room where the practice runs its client engagements.</p>`,
        `<p style="margin:0 0 14px 0;">Sign in with this email address to pick it up. There is no password to create.</p>`,
      ].join('\n'),
      cta: { href: loginHref, label: 'Sign in' },
    }),
  }
}

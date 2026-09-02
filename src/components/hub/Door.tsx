'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import type { HubVocabulary } from '@/lib/hubTheme'

/**
 * The locked screen: full-viewport on the org's loud ground, centered
 * column, wordmark, 60px gold rule, headline, plain-words body, one
 * email field, one button. No password field, no hint, no numbers.
 * Nothing about the org's finances exists in this HTML, which is a
 * hard requirement verified with curl (specs/epayl-fundraising-hub.md).
 *
 * All copy comes from the org's vocabulary row; the door renders for a
 * known slug through the one deliberate pre-auth RPC and knows nothing
 * else. Client component only so the sent state can read the URL; the
 * sign-in action is the same server action family as /login.
 */
import Wordmark from '@/components/hub/Wordmark'

export default function Door(props: {
  vocabulary: HubVocabulary
  action: (formData: FormData) => Promise<void>
}) {
  return (
    <Suspense fallback={null}>
      <DoorInner {...props} />
    </Suspense>
  )
}

function DoorInner({
  vocabulary,
  action,
}: {
  vocabulary: HubVocabulary
  action: (formData: FormData) => Promise<void>
}) {
  const search = useSearchParams()
  const state = search.get('state') ?? undefined
  const email = search.get('email') ?? undefined
  const segments = vocabulary.wordmark ?? [{ text: 'Fundraising Hub' }]
  const sent = state === 'sent'
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--hub-acid-black)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        fontFamily: 'var(--hub-font-body)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520 }}>
        <Wordmark segments={segments} tagline={vocabulary.tagline ?? 'Fundraising Hub'} size={24} />
        <div style={{ height: 3, background: 'var(--hub-gold)', margin: '32px 0', width: 72 }} />
        <h1
          style={{
            fontFamily: 'var(--hub-font-display)',
            fontSize: 'clamp(34px, 5vw, 44px)',
            lineHeight: 1.05,
            color: 'var(--hub-bone)',
            textTransform: 'uppercase',
            margin: 0,
            fontWeight: 400,
          }}
        >
          {sent ? 'Check your email' : (vocabulary.door_headline ?? 'This page is private')}
        </h1>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: 'var(--hub-bone-dim)', marginTop: 18, maxWidth: '46ch' }}>
          {sent
            ? `If ${email ?? 'that address'} is on the list, a sign-in link is on its way.`
            : (vocabulary.door_body ??
              "Put in your email and we'll send you a link that signs you in. No password to remember. The link only works for the people on the list.")}
        </p>
        {state === 'error' ? (
          <p style={{ fontSize: 14, color: 'var(--hub-terracotta)', marginTop: 12 }}>
            The link didn&apos;t send. Try again in a minute.
          </p>
        ) : null}
        {state === 'slow' ? (
          <p style={{ fontSize: 14, color: 'var(--hub-terracotta)', marginTop: 12 }}>
            Too many tries. Wait a minute and try again.
          </p>
        ) : null}
        {!sent ? (
          <form action={action} style={{ marginTop: 26 }}>
            <label
              htmlFor="hub-door-email"
              style={{
                fontFamily: 'var(--hub-font-detail)',
                fontSize: 11,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--hub-stone)',
                display: 'block',
              }}
            >
              Your email
            </label>
            <input
              id="hub-door-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              style={{
                width: '100%',
                marginTop: 8,
                padding: '16px 18px',
                background: 'var(--hub-acid-black-raised)',
                border: '1px solid var(--hub-line-on-black)',
                color: 'var(--hub-bone)',
                fontSize: 17,
              }}
            />
            <button
              type="submit"
              style={{
                marginTop: 18,
                padding: '16px 28px',
                background: 'var(--hub-gold)',
                color: 'var(--hub-acid-black)',
                border: 'none',
                fontFamily: 'var(--hub-font-detail)',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              Send me the link
            </button>
          </form>
        ) : null}
        {vocabulary.door_footer ? (
          <p
            style={{
              fontFamily: 'var(--hub-font-detail)',
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--hub-stone)',
              marginTop: 34,
            }}
          >
            {vocabulary.door_footer}
          </p>
        ) : null}
      </div>
    </div>
  )
}

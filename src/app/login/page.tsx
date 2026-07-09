import type { Metadata } from 'next'
import Image from 'next/image'
import { signInWithEmail, signInWithGoogle } from './actions'

export const metadata: Metadata = { title: 'Sign in' }

/**
 * The login page, the actual front door (spec 6.4). SafeSpace's first
 * impression of the fee arrives here, before any feature does. At
 * desktop widths the door is half and half: the keystone arches on the
 * left (the one piece of art in the product, brass wedge at the crown),
 * the email-first card on the right. At 390px the art steps aside and
 * the centered card carries the room alone. Paper canvas, the wordmark
 * with the brass period, one quiet line, the dot watermark under 9
 * percent opacity. No marketing copy, no feature list.
 *
 * Two doors in the card (spec 6.4, amended 2026-07-09): the magic link
 * first and as the fail-safe, then Continue with Google behind an "or"
 * divider. Same invited email either way; see login/actions.ts.
 */

const STATES: Record<string, { tone: 'ok' | 'err'; text: string }> = {
  sent: { tone: 'ok', text: 'Check your email. Your sign-in link is on the way.' },
  invalid: { tone: 'err', text: 'That does not look like an email address. Try again.' },
  error: { tone: 'err', text: 'The sign-in link could not be sent. Try again in a minute.' },
  slow: { tone: 'err', text: 'Too many tries. Wait a minute, then try again.' },
  no_access: {
    tone: 'err',
    text: 'That email is signed in but has no engagement here yet. Reach out to your consultant.',
  },
  expired: { tone: 'err', text: 'That link has expired. Enter your email for a fresh one.' },
  google_error: {
    tone: 'err',
    text: 'Google sign-in could not start. Try again, or use the email link.',
  },
  cancelled: {
    tone: 'err',
    text: 'Google sign-in did not finish. Try again, or use the email link.',
  },
}

/** The Google "G", inline so the page loads nothing external. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; email?: string }>
}) {
  const { state, email } = await searchParams
  const notice = state ? STATES[state] : undefined

  return (
    <main className="flex min-h-screen bg-paper">
      {/* The arches: hidden until lg so the 390px door stays a single
          centered card. The art is left-weighted, so center-cropping
          keeps the arches and the brass keystone in frame. */}
      <div className="relative hidden w-1/2 lg:block" aria-hidden>
        <Image
          src="/login-arches.webp"
          alt=""
          fill
          priority
          sizes="50vw"
          className="object-cover"
        />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        {/* The dot-row watermark, under 9 percent opacity, never animated. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(42,38,32,0.07) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
          }}
        />

        <div className="relative w-full max-w-sm">
          <h1 className="font-display text-center text-5xl font-medium text-ink">
            Keystone<span className="text-brass">.</span>
          </h1>
          <p className="mt-3 text-center text-sm text-ink-dim">Where your engagement lives</p>

          <div className="mt-10 rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-6 shadow-[var(--shadow-soft)]">
            {notice ? (
              <p
                role="status"
                className={`mb-4 text-sm ${notice.tone === 'ok' ? 'text-forest' : 'text-ink'}`}
              >
                {notice.text}
              </p>
            ) : null}

            <form action={signInWithEmail} className="flex flex-col gap-3">
              <label htmlFor="email" className="eyebrow">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue={email ?? ''}
                placeholder="you@yourorganization.org"
                className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2.5 text-base text-ink placeholder:text-ink-dim/60"
              />
              <button
                type="submit"
                className="mt-2 w-full rounded-lg bg-forest px-4 py-2.5 font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
              >
                Email me a sign-in link
              </button>
            </form>

            <div className="mt-5 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-ink/10" />
              <span className="text-xs text-ink-dim">or</span>
              <span className="h-px flex-1 bg-ink/10" />
            </div>

            <form action={signInWithGoogle} className="mt-5">
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-ink/15 bg-paper px-4 py-2.5 font-medium text-ink transition-colors duration-200 hover:border-ink/30 active:scale-[0.98]"
              >
                <GoogleMark />
                Continue with Google
              </button>
            </form>

            <p className="mt-4 text-xs leading-relaxed text-ink-dim">
              Sign-in is by invitation. Both doors use the email address your consultant
              invited.
            </p>
          </div>

          <p className="eyebrow mt-10 text-center">by Sobo Consulting</p>
        </div>
      </div>
    </main>
  )
}

import type { Metadata } from 'next'
import Image from 'next/image'
import { signInWithEmail } from './actions'

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

            <p className="mt-4 text-xs leading-relaxed text-ink-dim">
              Sign-in is by invitation. Use the email address your consultant invited.
            </p>
          </div>

          <p className="eyebrow mt-10 text-center">by Sobo Consulting</p>
        </div>
      </div>
    </main>
  )
}

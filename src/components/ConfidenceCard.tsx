import Link from 'next/link'
import { KeystoneCard } from '@/components/KeystoneCard'

/**
 * ConfidenceCard: the home card for a named check-in participant. Two
 * states only: open-and-unsubmitted (the invitation, brass-lined) and
 * done (a quiet receipt that stays until the next check-in opens).
 * The home page renders this ONLY when the viewer has a participant
 * row; a founder or teammate never sees it, matching the RLS wall
 * underneath.
 */

export function ConfidenceCard({
  checkin,
  submitted,
}: {
  checkin: { id: string; label: string }
  submitted: boolean
}) {
  return (
    <section aria-label="Confidence check-in" className="mb-10">
      {submitted ? (
        <KeystoneCard>
          <p className="text-sm text-ink">
            <span aria-hidden="true" className="text-brass">
              ✓
            </span>{' '}
            Done · {checkin.label}
            <span className="text-ink-dim">
              {' '}
              Same check-in next month, watch your line move.
            </span>
          </p>
        </KeystoneCard>
      ) : (
        <KeystoneCard feature corner>
          <p className="eyebrow">Confidence check-in</p>
          <h3 className="font-display mt-1 text-xl text-navy">
            {checkin.label} · about 3 minutes
          </h3>
          <p className="mt-2 max-w-prose text-sm text-ink">
            A short self-rating you&apos;ll repeat each month, so you can watch your own line
            move. A growth measure, never a grade.
          </p>
          <Link
            href={`/checkin/${checkin.id}`}
            className="mt-4 inline-block rounded-lg border border-sage px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper active:scale-[0.98]"
          >
            Start the check-in
          </Link>
        </KeystoneCard>
      )}
    </section>
  )
}

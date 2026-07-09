import { CornerArchFragment } from '@/components/keystone-motifs'

/**
 * KeystoneCard: the one card surface, replacing the repeated
 * rounded-border paper-raised pattern. Quiet by default. Two optional
 * treatments, both used sparingly so most cards stay calm:
 *
 *   feature  a very subtle brass hairline across the top edge
 *   corner   a faint corner arch fragment, for the one card on a page
 *            that earns an architectural accent
 */
export function KeystoneCard({
  children,
  feature = false,
  corner = false,
  className = '',
}: {
  children: React.ReactNode
  feature?: boolean
  corner?: boolean
  className?: string
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5 shadow-[var(--shadow-soft)] ${className}`}
    >
      {feature ? (
        <div
          aria-hidden="true"
          className="absolute left-5 right-5 top-0 h-px bg-gradient-to-r from-transparent via-brass/60 to-transparent"
        />
      ) : null}

      {corner ? (
        <CornerArchFragment className="pointer-events-none absolute -bottom-8 -right-10 h-40 w-48" />
      ) : null}

      <div className="relative">{children}</div>
    </section>
  )
}

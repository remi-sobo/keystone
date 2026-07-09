import { NestedArchWatermark } from '@/components/keystone-motifs'

/**
 * RoomShell: the canvas for every authenticated page. The interior of
 * the Keystone brand room. Warm paper, a faint print grain, and one
 * nested-arch watermark drifting at the right edge on desktop. The
 * watermark and grain sit behind; content is raised above them and
 * stays fully readable.
 *
 * Accepts an eyebrow (mono label), a title (Cormorant page title), an
 * optional description, and the page body. Spacing follows the existing
 * page rhythm so pages read the same once wrapped.
 */
export function RoomShell({
  eyebrow,
  title,
  description,
  children,
  maxWidth = 'max-w-5xl',
  className = '',
}: {
  /** Mono label above the title. A node so breadcrumb links fit. */
  eyebrow?: React.ReactNode
  title?: string
  description?: string
  children: React.ReactNode
  /** Content column width. Narrow reading surfaces (timeline, chat,
   *  library) pass their own so the room stays true to each page. */
  maxWidth?: string
  className?: string
}) {
  return (
    <div
      className={`keystone-paper-grain relative min-h-screen overflow-hidden bg-paper ${className}`}
    >
      <NestedArchWatermark className="pointer-events-none fixed -right-28 top-16 hidden h-[720px] w-[520px] lg:block" />

      <div className={`relative mx-auto ${maxWidth} px-5 py-8 md:px-10 md:py-12`}>
        {eyebrow || title || description ? (
          <header className="mb-10">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? <h1 className="text-page-title mt-2 text-ink">{title}</h1> : null}
            {description ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim">{description}</p>
            ) : null}
          </header>
        ) : null}

        {children}
      </div>
    </div>
  )
}

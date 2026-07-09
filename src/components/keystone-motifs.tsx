/**
 * Keystone motifs: the login artwork translated into small, reusable
 * architectural fragments for the authenticated app (see
 * docs/keystone-motif-kit.md). The login page stays the strongest art
 * moment; these are the quiet echoes of it inside the room.
 *
 * Every mark is presentational, decorative, and aria-hidden. There are
 * no hooks and no state here, so this is a plain server-safe module: a
 * server component can render any of these without crossing the client
 * boundary (the lesson from the nav-list crash).
 *
 * Color comes only from the ten frozen tokens (globals.css @theme).
 * Nothing here introduces a new color.
 */

/** The tiny brass signature mark. A pin, never a logo: keep it small. */
export function KeystoneWedge({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 28" aria-hidden="true" className={className} fill="none">
      <path d="M4 2h16l-3 24H7L4 2Z" fill="var(--color-brass)" />
      <path
        d="M4 2h16l-3 24H7L4 2Z"
        stroke="var(--color-ink)"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
    </svg>
  )
}

/** A single arch in outline, for backgrounds behind headers and empty
 *  views. Background only: never let it compete with real content. */
export function SingleArchLine({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 320" aria-hidden="true" className={className} fill="none">
      <path
        d="M40 320V120C40 75.8 75.8 40 120 40s80 35.8 80 80v200"
        stroke="var(--color-forest)"
        strokeOpacity="0.16"
        strokeWidth="2"
      />
      <path
        d="M72 320V126c0-26.5 21.5-48 48-48s48 21.5 48 48v194"
        stroke="var(--color-brass)"
        strokeOpacity="0.16"
        strokeWidth="1"
      />
    </svg>
  )
}

/** The main continuity piece: nested arches echoing the login art,
 *  faint enough to read as a watermark. One per page canvas. */
export function NestedArchWatermark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 520 720" aria-hidden="true" className={className} fill="none">
      <path
        d="M80 720V250C80 150.6 160.6 70 260 70s180 80.6 180 180v470"
        stroke="var(--color-forest)"
        strokeOpacity="0.10"
        strokeWidth="34"
      />
      <path
        d="M145 720V270c0-63.5 51.5-115 115-115s115 51.5 115 115v450"
        stroke="var(--color-sage)"
        strokeOpacity="0.10"
        strokeWidth="26"
      />
      <path
        d="M208 720V286c0-28.7 23.3-52 52-52s52 23.3 52 52v434"
        stroke="var(--color-navy)"
        strokeOpacity="0.07"
        strokeWidth="20"
      />
      <path d="M236 49h48l-8 76h-32l-8-76Z" fill="var(--color-brass)" fillOpacity="0.18" />
    </svg>
  )
}

/** A corner arch for feature cards and empty states. Sparingly: not
 *  every card wants one. */
export function CornerArchFragment({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 180" aria-hidden="true" className={className} fill="none">
      <path
        d="M20 180V90C20 51.3 51.3 20 90 20s70 31.3 70 70v90"
        stroke="var(--color-forest)"
        strokeOpacity="0.13"
        strokeWidth="18"
      />
      <path
        d="M58 180V96c0-17.7 14.3-32 32-32s32 14.3 32 32v84"
        stroke="var(--color-brass)"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />
      <path d="M80 10h20l-3 36H83L80 10Z" fill="var(--color-brass)" fillOpacity="0.26" />
    </svg>
  )
}

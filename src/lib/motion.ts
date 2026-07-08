/**
 * lib/motion.ts
 *
 * The shared motion vocabulary. Structure copied from sobo-consulting
 * src/lib/motion.ts; values are specs/keystone.md section 6.5. One
 * easing everywhere, CSS and JS, so the whole app moves like one hand
 * made it. The CSS twin lives in globals.css as --ease-keystone.
 *
 * The vocabulary, and nothing outside it: 250ms fade-rise section
 * reveals (8px), 400ms left-to-right stage-fill sweeps, 200ms sidebar
 * collapse, active:scale-[0.98] button press, an optimistic sage sweep
 * on homework check-off, and one celebration (a single brass glint when
 * a workstream reaches Stabilize). No parallax, no loops; the 2.4s
 * breathing pulse on the current stage is the sole exception and it
 * dies under prefers-reduced-motion. Every animated component honors
 * the reduced-motion gate in globals.css; JS-driven motion checks
 * matchMedia('(prefers-reduced-motion: reduce)') before animating.
 */

/** cubic-bezier(0.22, 1, 0.36, 1), as a framer-motion-style tuple. */
export const EASE = [0.22, 1, 0.36, 1] as const

/** The same easing for plain CSS/WAAPI call sites. */
export const EASE_CSS = 'cubic-bezier(0.22, 1, 0.36, 1)'

export const DURATION = {
  /** Sidebar collapse and other chrome moves. */
  chrome: 0.2,
  /** Section reveals: fade up 8px. */
  reveal: 0.25,
  /** Stage-fill sweep when a workstream stage advances. */
  sweep: 0.4,
  /** The breathing pulse on the current stage (opacity only). */
  breathe: 2.4,
} as const

/** Distance in px for the fade-rise reveal. */
export const REVEAL_RISE_PX = 8

/** True when the viewer asked for reduced motion; render complete and still. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

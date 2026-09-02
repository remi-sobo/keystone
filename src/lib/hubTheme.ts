/**
 * The client hub theme layer (specs/epayl-fundraising-hub.md).
 *
 * hub_orgs.theme is the full token set for one org; this module turns
 * it into CSS custom properties scoped to the hub layout. Components
 * read variables only: no hex value appears in a component, ever
 * (pinned structurally by e2e/client-hub-isolation.spec.ts). The
 * second client's hub is a row in a table, not a branch in the code.
 *
 * Fonts are the one theme element that needs a code touch per new
 * family, because next/font loads at build time: the layout registers
 * the families and exposes them as CSS variables; the theme maps the
 * three roles (display, body, detail) onto registered family keys.
 */

import type { CSSProperties } from 'react'

/** The color roles a theme may set, in the token order the art
 *  direction documents (docs/hub/art-direction.md). */
const COLOR_KEYS = [
  'acid_black',
  'acid_black_raised',
  'bone',
  'bone_dim',
  'paper',
  'paper_raised',
  'gold',
  'gold_ink',
  'forest',
  'forest_ink',
  'terracotta',
  'stone',
  'stone_ink',
  'line_on_black',
  'line_on_paper',
] as const

/** Registered font families (see the hub layout) by theme key. */
const FONT_FAMILIES: Record<string, string> = {
  'abril-fatface': 'var(--hub-font-abril)',
  archivo: 'var(--hub-font-archivo)',
  'space-mono': 'var(--hub-font-space-mono)',
}

const HEX = /^#[0-9a-fA-F]{3,8}$/

export interface HubVocabulary {
  org_noun?: string
  wordmark?: { text: string; tone?: 'default' | 'gold' }[]
  tagline?: string
  door_headline?: string
  door_body?: string
  door_footer?: string
  intro?: string
}

/**
 * Resolve a theme row into the CSS custom properties the hub wrapper
 * carries. Unknown keys are ignored; non-hex color values are dropped
 * rather than emitted, so a malformed row degrades to the variable
 * being unset instead of injecting arbitrary CSS.
 */
export function hubThemeStyle(theme: Record<string, unknown> | null): CSSProperties {
  const style: Record<string, string> = {}
  const t = theme ?? {}
  for (const key of COLOR_KEYS) {
    const v = t[key]
    if (typeof v === 'string' && HEX.test(v)) {
      style[`--hub-${key.replace(/_/g, '-')}`] = v
    }
  }
  const fonts = (t.fonts ?? {}) as Record<string, unknown>
  for (const role of ['display', 'body', 'detail'] as const) {
    const fam = fonts[role]
    if (typeof fam === 'string' && FONT_FAMILIES[fam]) {
      style[`--hub-font-${role}`] = FONT_FAMILIES[fam]
    }
  }
  return style as CSSProperties
}

/** Format integer cents as whole dollars, mono-register style
 *  ($199,245). Never invents precision the data does not carry. */
export function hubMoney(cents: number): string {
  const dollars = Math.round(cents / 100)
  return '$' + dollars.toLocaleString('en-US')
}

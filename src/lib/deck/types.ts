/**
 * lib/deck/types.ts
 *
 * The slide model for session teaching decks, lifted from the SOBO
 * session deck design system (build_deck.py's slide functions; the
 * Session 1 HTML deck is the rendered truth these types mirror). Eight
 * layouts exist in the system; Session 1 uses seven of them. A slide is
 * a discriminated union on `slide_type`, and the same shape lives in
 * session_slides.payload (jsonb) so a seeded deck and a static fixture
 * render through the identical component path.
 */

export interface CoverSlide {
  slide_type: 'cover'
  eyebrow: string
  title: string
  subtitle: string
  /** Footer-style meta line: "{meta_left} x {meta_right} . {meta_when}" */
  meta_left: string
  meta_right: string
  meta_when: string
}

export interface SectionSlide {
  slide_type: 'section'
  /** The outlined numeral, e.g. "01" */
  num: string
  title: string
  sub?: string
}

export interface IdeaSlide {
  slide_type: 'idea'
  eyebrow: string
  head: string
  sup: string
}

export interface AgendaSlide {
  slide_type: 'agenda'
  eyebrow: string
  title: string
  items: string[]
  footnote?: string
}

export interface TrackRow {
  label: string
  /** Brass label variant (the second track) */
  alt?: boolean
  chips: string[]
}

export interface TracksSlide {
  slide_type: 'tracks'
  eyebrow: string
  title: string
  tracks: TrackRow[]
  note?: string
}

export interface LoopSlide {
  slide_type: 'loop'
  eyebrow: string
  title: string
  steps: string[]
  note?: string
}

export interface HomeworkRow {
  who: string
  task: string
}

export interface HomeworkSlide {
  slide_type: 'homework'
  eyebrow: string
  title: string
  rows: HomeworkRow[]
}

export interface CloseSlide {
  slide_type: 'close'
  line1: string
  /** The brass second line */
  line2: string
  attr: string
}

export type DeckSlide =
  | CoverSlide
  | SectionSlide
  | IdeaSlide
  | AgendaSlide
  | TracksSlide
  | LoopSlide
  | HomeworkSlide
  | CloseSlide

export const SLIDE_TYPES = [
  'cover',
  'section',
  'idea',
  'agenda',
  'tracks',
  'loop',
  'homework',
  'close',
] as const

/** The fixed footer and meta for one deck run. */
export interface DeckMeta {
  /** "SOBO x SafeSpace" (rendered with the times glyph) */
  footerLeft: string
  /** "The Six-Month Build" */
  program: string
  /** "01" (zero-padded session number for the footer counter) */
  sessionNumber: string
}

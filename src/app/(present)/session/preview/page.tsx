import type { Metadata } from 'next'
import DeckRenderer from '@/components/deck/DeckRenderer'
import { session1Meta, session1Slides } from '@/lib/deck/session1'

/**
 * The static-fixture preview (GATE 3's side-by-side): Session 1's
 * fourteen slides rendered from the in-repo fixture, no database read,
 * so the renderer can be compared against the standalone HTML deck
 * (docs/decks/SafeSpace_Session01_Teaching.html) before any seeded data
 * is trusted.
 */
export const metadata: Metadata = {
  title: 'Session 01 · Preview',
}

export default function DeckPreviewPage() {
  return <DeckRenderer slides={session1Slides} meta={session1Meta} />
}

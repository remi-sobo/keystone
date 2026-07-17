import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import DeckRenderer from '@/components/deck/DeckRenderer'
import { session1Meta, session1Slides } from '@/lib/deck/session1'
import { getViewer } from '@/lib/membership'

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

export default async function DeckPreviewPage() {
  // The fixture preview stays operator-only: it is a build tool, not a
  // client surface (the layout admits both walls for the presenter).
  const viewer = await getViewer()
  if (!viewer.practice) redirect('/home')
  return <DeckRenderer slides={session1Slides} meta={session1Meta} />
}

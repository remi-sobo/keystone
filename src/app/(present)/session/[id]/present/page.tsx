import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import DeckRenderer from '@/components/deck/DeckRenderer'
import type { DeckMeta, DeckSlide } from '@/lib/deck/types'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * The full-screen presenter: /session/[id]/present, id being the
 * engagement_sessions row (the roadmap session whose deck this is).
 * Operator-only via the (present) layout; every read rides the session
 * client under RLS, so a session id from another practice resolves to
 * zero rows and lands on notFound, never on data. The deck meta is
 * data-driven off the cover slide (its eyebrow is the program name,
 * its meta pair the footer), with the session code as the counter.
 */
export const metadata: Metadata = {
  title: 'Present',
}

export default async function PresentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabase()

  const { data: session } = await supabase
    .from('engagement_sessions')
    .select('id, code, title, practices(name), clients(name)')
    .eq('id', id)
    .maybeSingle()
  if (!session) notFound()

  const { data: rows } = await supabase
    .from('session_slides')
    .select('sort_order, slide_type, payload')
    .eq('engagement_session_id', session.id)
    .order('sort_order', { ascending: true })

  if (!rows || rows.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-paper">
        <p className="font-display text-2xl text-ink-dim">
          No deck has been seeded for {session.code} yet.
        </p>
      </main>
    )
  }

  const slides = rows.map(
    (r) => ({ slide_type: r.slide_type, ...(r.payload as object) }) as DeckSlide
  )

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const practiceName = ((session.practices as any)?.name as string) ?? ''
  const clientName = ((session.clients as any)?.name as string) ?? ''
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const cover = slides.find((s) => s.slide_type === 'cover')
  const meta: DeckMeta = {
    footerLeft:
      cover && cover.slide_type === 'cover'
        ? `${cover.meta_right} × ${cover.meta_left}`
        : `${practiceName} × ${clientName}`,
    program: cover && cover.slide_type === 'cover' ? cover.eyebrow : session.title,
    sessionNumber: session.code.replace(/^S/, '').padStart(2, '0'),
  }

  return <DeckRenderer slides={slides} meta={meta} />
}

import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/membership'

/**
 * The presenter shell: full-viewport, no sidebar, because a projected
 * deck owns the whole screen. Admission is membership on either wall;
 * what each wall may see is decided per page: the practice presents
 * any of its own decks (and the static preview), a client member sees
 * a deck only once its session is done (Remi's call, 2026-07-17), so
 * the teaching keeps its surprise. Every read beneath this layout
 * rides the session client under RLS; no service role anywhere.
 */
export default async function PresentLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (!viewer.practice && !viewer.client) {
    redirect('/login?state=no_access')
  }
  return <>{children}</>
}

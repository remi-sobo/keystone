import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/membership'

/**
 * The presenter shell: full-viewport, no sidebar, because a projected
 * deck owns the whole screen. Operator-only for now (the runbook's
 * call): same admission rule as the practice surface, reads under RLS
 * on the session client, no service role anywhere beneath this layout.
 */
export default async function PresentLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (!viewer.practice) {
    redirect(viewer.client ? '/home' : '/login?state=no_access')
  }
  return <>{children}</>
}

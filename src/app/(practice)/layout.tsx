import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { practiceNav } from '@/components/nav'
import { getViewer } from '@/lib/membership'

/**
 * The practice surface shell (the workshop). Routes under it use
 * service-role-after-check where they mutate; reads here go through
 * the session client under RLS.
 */
export default async function PracticeLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (!viewer.practice) {
    redirect(viewer.client ? '/home' : '/login?state=no_access')
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar
        items={practiceNav()}
        practiceName={viewer.practice.practiceName}
        personEmail={viewer.user.email ?? ''}
      />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  )
}

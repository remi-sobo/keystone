import { redirect } from 'next/navigation'
import Sidebar, { clientNav } from '@/components/Sidebar'
import { getViewer } from '@/lib/membership'

/**
 * The client surface shell. PURE RLS: everything under this layout
 * reads through the session client only; the no-service-role CI guard
 * fails the build on any service-role import here.
 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (!viewer.client) {
    redirect(viewer.practice ? '/clients' : '/login?state=no_access')
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar
        items={clientNav()}
        practiceName={viewer.client.practiceName}
        clientName={viewer.client.clientName}
        personEmail={viewer.user.email ?? ''}
      />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  )
}

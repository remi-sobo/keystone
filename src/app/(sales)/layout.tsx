import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { salesNav } from '@/components/nav'
import { getViewer } from '@/lib/membership'

/**
 * The sales surface shell (specs/keystone-sales.md). The third room,
 * and the second one a non-employee logs into, so it takes the CLIENT
 * surface discipline rather than the practice one: PURE RLS, no service
 * role anywhere beneath this layout, enforced by the CI guard.
 *
 * The wall itself is migration 0044: private.is_practice_member now
 * means delivery-side member, so every engagement, session, note,
 * client, deliverable and message policy in the schema returns zero
 * rows here. This layout only makes the redirect honest.
 */
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (!viewer.sales) {
    if (viewer.practice) redirect('/today')
    redirect(viewer.client ? '/home' : '/login?state=no_access')
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar
        items={salesNav()}
        practiceName={viewer.sales.practiceName}
        personEmail={viewer.user.email ?? ''}
      />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  )
}

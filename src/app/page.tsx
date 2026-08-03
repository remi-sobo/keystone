import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/membership'

// The root routes by membership: client members to the progress view,
// practice members to the Monday screen, the sales lead to his own
// five surfaces, everyone else to the door.
export default async function RootPage() {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (viewer.client) redirect('/home')
  if (viewer.practice) redirect('/today')
  if (viewer.sales) redirect('/sales')
  redirect('/login?state=no_access')
}

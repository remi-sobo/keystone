import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/membership'

// The root routes by membership: client members to the progress view,
// practice members to the client list, everyone else to the door.
export default async function RootPage() {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (viewer.client) redirect('/home')
  if (viewer.practice) redirect('/clients')
  redirect('/login?state=no_access')
}

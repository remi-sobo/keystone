import { getViewer } from '@/lib/membership'
import type { HubMembership } from '@/lib/membership'

/**
 * The per-page guard for the hub surface. Pages render in parallel
 * with the layout, so each one re-checks membership itself and
 * renders nothing when the session does not belong to this org; the
 * layout is what shows the door or redirects. Pure RLS beneath this:
 * even a page that forgot the guard would read zero rows.
 */
export async function hubContext(orgSlug: string): Promise<HubMembership | null> {
  const viewer = await getViewer()
  if (!viewer.hub || viewer.hub.orgSlug !== orgSlug) return null
  return viewer.hub
}

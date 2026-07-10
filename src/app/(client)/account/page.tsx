import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'

/**
 * The client's account page: who you are in this room, and the door
 * out. Pure RLS; the membership row is the caller's own. Access
 * changes are the practice's to make, so this page holds no settings
 * machinery, just the facts and the sign-out.
 */
export default async function AccountPage() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const supabase = await createServerSupabase()
  const { data: membership } = await supabase
    .from('client_members')
    .select('claimed_at')
    .eq('user_id', viewer.user.id)
    .eq('client_id', viewer.client.clientId)
    .maybeSingle()

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Your account" maxWidth="max-w-2xl">
      <KeystoneCard>
        <p className="text-sm text-ink">
          Signed in as <span className="font-medium">{viewer.user.email}</span>
        </p>
        <p className="mt-1 text-sm text-ink-dim">
          A member of {viewer.client.clientName}, in the room run by {viewer.client.practiceName}
          {membership?.claimed_at
            ? `, since ${new Date(membership.claimed_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}`
            : ''}
          .
        </p>
        <p className="mt-3 text-sm text-ink-dim">
          Need your email changed, or someone added? Ask your consultant; changes land in
          minutes.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button
            type="submit"
            className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:border-ink/40 active:scale-[0.98]"
          >
            Sign out
          </button>
        </form>
      </KeystoneCard>
    </RoomShell>
  )
}

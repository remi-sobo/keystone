import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { saveEmailPref } from './actions'

/**
 * The client's account page: who you are in this room, and the door
 * out. Pure RLS; the membership row is the caller's own. Access
 * changes are the practice's to make, so this page holds no settings
 * machinery, just the facts and the sign-out.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  const supabase = await createServerSupabase()
  const { data: membership } = await supabase
    .from('client_members')
    .select('id, claimed_at')
    .eq('user_id', viewer.user.id)
    .eq('client_id', viewer.client.clientId)
    .maybeSingle()
  const { data: pref } = membership
    ? await supabase
        .from('notification_prefs')
        .select('email_mode')
        .eq('client_member_id', membership.id)
        .maybeSingle()
    : { data: null }

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

      <KeystoneCard className="mt-6">
        <p className="eyebrow">Email updates</p>
        <p className="mt-2 text-sm text-ink-dim">
          One email a day at most, only when something new happened: homework feedback, a shipped
          deliverable, a date to pick. Everything always shows in the app either way.
        </p>
        {state === 'saved' ? (
          <p role="status" className="mt-2 text-sm text-forest">
            Saved.
          </p>
        ) : null}
        <form action={saveEmailPref} className="mt-3 flex flex-wrap items-center gap-3">
          <select
            name="mode"
            defaultValue={pref?.email_mode ?? 'batched'}
            className="rounded-lg border border-ink/15 bg-paper-raised px-3 py-2 text-sm text-ink"
          >
            <option value="batched">One daily summary email</option>
            <option value="off">No email; I check the app</option>
          </select>
          <button
            type="submit"
            className="rounded-lg border border-forest px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98]"
          >
            Save
          </button>
        </form>
      </KeystoneCard>
    </RoomShell>
  )
}

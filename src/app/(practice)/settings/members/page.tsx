import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import {
  addClient,
  addPracticeMember,
  changeRole,
  inviteClientMember,
  resendInvite,
  setMemberAccess,
} from './actions'

/**
 * Members and access (V2 1A, specs/keystone-v2-admin-ui.md). The
 * owner's room: the practice team, every client and their people, and
 * the pending invites, with soft deactivation and designed invite
 * emails. Owner-only; a consultant gets the calm 403 below. Reads ride
 * the session client under RLS; only the last-sign-in column touches
 * the service role (auth.users metadata, after the owner check, never
 * stored app-side and never client-facing).
 */

const NOTES: Record<string, string> = {
  invalid: 'That did not parse. Check the values and try again.',
  exists: 'That email is already on the list.',
  error: 'That could not be saved. Try again.',
  added_sent: 'Added, and the invite email is on its way.',
  added_failed: 'Added. The invite email could not be sent; resend when ready.',
  added_slow: 'Added. Too many invite emails just now; resend in a few minutes.',
  invite_sent: 'Invite sent.',
  invite_failed: 'The invite email could not be sent. Try again.',
  invite_slow: 'Too many invite emails just now. Wait a few minutes.',
  role_changed: 'Role updated.',
  no_change: 'Nothing to change.',
  last_owner: 'A practice keeps at least one active owner. Promote someone else first.',
  deactivated: 'Access ended. The record stays, and reactivation is one click.',
  reactivated: 'Access restored.',
  client_added: 'Client added. Invite their people below.',
}

interface MemberRow {
  id: string
  email: string
  role?: string
  user_id: string | null
  claimed_at: string | null
  revoked_at: string | null
  last_invite_sent_at: string | null
  client_id?: string
}

function fmtDay(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Recency for invite sends: the owner who just clicked Send needs the
 * page to say so plainly. Fresh sends read as minutes or hours ago;
 * anything older falls back to the date.
 */
function fmtRecent(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins === 1 ? '1 minute ago' : `${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  return fmtDay(iso)
}

function statusLine(m: MemberRow, lastSignIn?: string): string {
  if (m.revoked_at) return `Deactivated ${fmtDay(m.revoked_at)}`
  if (!m.claimed_at) {
    return m.last_invite_sent_at
      ? `Invited, email sent ${fmtRecent(m.last_invite_sent_at)}`
      : 'Invited, no email sent yet'
  }
  const seen = lastSignIn ? `, last sign-in ${fmtDay(lastSignIn)}` : ''
  return `In since ${fmtDay(m.claimed_at)}${seen}`
}

function AccessButtons({ side, m }: { side: 'practice' | 'client'; m: MemberRow }) {
  return (
    <span className="flex items-center gap-3">
      {!m.claimed_at && !m.revoked_at ? (
        <form action={resendInvite}>
          <input type="hidden" name="side" value={side} />
          <input type="hidden" name="id" value={m.id} />
          <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
            Resend invite
          </button>
        </form>
      ) : null}
      <form action={setMemberAccess}>
        <input type="hidden" name="side" value={side} />
        <input type="hidden" name="id" value={m.id} />
        <input type="hidden" name="to" value={m.revoked_at ? 'reactivate' : 'deactivate'} />
        <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
          {m.revoked_at ? 'Reactivate' : 'Deactivate'}
        </button>
      </form>
    </span>
  )
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>
}) {
  const { note } = await searchParams
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')

  if (viewer.practice.role !== 'owner') {
    return (
      <RoomShell eyebrow="Settings" title="Members and access" maxWidth="max-w-4xl">
        <p className="text-sm text-ink-dim">
          This room belongs to the practice owner. If you need someone added or removed, ask
          them; changes land in seconds.
        </p>
      </RoomShell>
    )
  }

  const supabase = await createServerSupabase()
  const [{ data: team }, { data: clients }, { data: clientMembers }] = await Promise.all([
    supabase
      .from('practice_members')
      .select('id, email, role, user_id, claimed_at, revoked_at, last_invite_sent_at')
      .eq('practice_id', viewer.practice.practiceId)
      .order('created_at'),
    supabase
      .from('clients')
      .select('id, name, status')
      .eq('practice_id', viewer.practice.practiceId)
      .order('created_at'),
    supabase
      .from('client_members')
      .select('id, client_id, email, user_id, claimed_at, revoked_at, last_invite_sent_at')
      .eq('practice_id', viewer.practice.practiceId)
      .order('created_at'),
  ])

  // Last sign-in, owner-only operational metadata read live from auth,
  // never stored app-side. Degrades to blank without the service key.
  const lastSignIn = new Map<string, string>()
  try {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 })
    for (const u of data?.users ?? []) {
      if (u.last_sign_in_at) lastSignIn.set(u.id, u.last_sign_in_at)
    }
  } catch {
    // Blank column beats a broken page; the roster still renders.
  }

  const members = (clientMembers ?? []) as MemberRow[]
  const pending = [
    ...((team ?? []) as MemberRow[])
      .filter((m) => !m.claimed_at && !m.revoked_at)
      .map((m) => ({ ...m, side: 'practice' as const, where: 'the practice team' })),
    ...members
      .filter((m) => !m.claimed_at && !m.revoked_at)
      .map((m) => ({
        ...m,
        side: 'client' as const,
        where: (clients ?? []).find((c) => c.id === m.client_id)?.name ?? 'a client',
      })),
  ]

  return (
    <RoomShell eyebrow="Settings" title="Members and access" maxWidth="max-w-4xl">
      <p className="text-sm text-ink-dim">
        Who can walk into which room. Deactivation ends access and keeps the record; nothing
        here deletes. <Link href="/settings" className="underline hover:text-ink">Back to settings</Link>
      </p>
      {note && NOTES[note] ? (
        <p role="status" className="mt-3 text-sm text-ink">
          {NOTES[note]}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">The practice team</h2>
        <ul className="mt-4 flex flex-col gap-2">
          {((team ?? []) as MemberRow[]).map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className={`block truncate text-sm ${m.revoked_at ? 'text-ink-dim line-through' : 'text-ink'}`}>
                  {m.email}
                </span>
                <span className="block text-xs text-ink-dim">
                  {statusLine(m, m.user_id ? lastSignIn.get(m.user_id) : undefined)}
                </span>
              </span>
              <form action={changeRole} className="flex items-center gap-2">
                <input type="hidden" name="id" value={m.id} />
                <select
                  name="role"
                  defaultValue={m.role}
                  className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
                >
                  <option value="owner">owner</option>
                  <option value="consultant">consultant</option>
                </select>
                <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                  Save
                </button>
              </form>
              <AccessButtons side="practice" m={m} />
            </li>
          ))}
        </ul>

        <form action={addPracticeMember} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="eyebrow">Email</span>
            <input
              name="email"
              type="email"
              required
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </label>
          <label className="flex min-w-[140px] flex-col gap-1">
            <span className="eyebrow">Role</span>
            <select
              name="role"
              defaultValue="consultant"
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            >
              <option value="consultant">consultant</option>
              <option value="owner">owner</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Add and invite
          </button>
        </form>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Clients and their people</h2>
        {(clients ?? []).map((c) => (
          <div key={c.id} className="mt-5">
            <h3 className="text-lg font-medium text-ink">
              {c.name}
              {c.status !== 'active' ? (
                <span className="ml-2 text-sm text-ink-dim">({c.status})</span>
              ) : null}
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {members
                .filter((m) => m.client_id === c.id)
                .map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1 basis-48">
                      <span className={`block truncate text-sm ${m.revoked_at ? 'text-ink-dim line-through' : 'text-ink'}`}>
                        {m.email}
                      </span>
                      <span className="block text-xs text-ink-dim">
                        {statusLine(m, m.user_id ? lastSignIn.get(m.user_id) : undefined)}
                      </span>
                    </span>
                    <AccessButtons side="client" m={m} />
                  </li>
                ))}
              {members.filter((m) => m.client_id === c.id).length === 0 ? (
                <li className="text-sm text-ink-dim">Nobody invited yet.</li>
              ) : null}
            </ul>
            <form action={inviteClientMember} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="clientId" value={c.id} />
              <label className="flex min-w-[220px] flex-1 flex-col gap-1">
                <span className="eyebrow">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
                />
              </label>
              <button
                type="submit"
                className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
              >
                Invite
              </button>
            </form>
          </div>
        ))}

        <form action={addClient} className="mt-8 flex flex-wrap items-end gap-3">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <span className="eyebrow">New client name</span>
            <input
              name="name"
              required
              maxLength={120}
              className="rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Add client
          </button>
        </form>
        <p className="mt-2 text-xs text-ink-dim">
          A client here is the organization. Engagements are still born from the seed until the
          builder ships (V2 1B).
        </p>
      </section>

      <section className="mt-12">
        <h2 className="font-display text-2xl font-medium text-ink">Pending invites</h2>
        <ul className="mt-4 flex flex-col gap-2">
          {pending.map((m) => (
            <li
              key={`${m.side}-${m.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className="block truncate text-sm text-ink">{m.email}</span>
                <span className="block text-xs text-ink-dim">
                  {m.where}
                  {m.last_invite_sent_at
                    ? `, email sent ${fmtRecent(m.last_invite_sent_at)}`
                    : ', no email sent yet'}
                </span>
              </span>
              <form action={resendInvite}>
                <input type="hidden" name="side" value={m.side} />
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="text-sm text-ink-dim underline hover:text-ink">
                  {m.last_invite_sent_at ? 'Resend invite' : 'Send invite'}
                </button>
              </form>
            </li>
          ))}
          {pending.length === 0 ? (
            <li className="text-sm text-ink-dim">Everyone invited is in.</li>
          ) : null}
        </ul>
      </section>
    </RoomShell>
  )
}

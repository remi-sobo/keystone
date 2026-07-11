import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { addClientFromList } from './actions'

/**
 * The practice's client list. Reads under RLS with the session client;
 * a practice member sees every client of their practice and nothing of
 * any other practice. Adding a client lives HERE, where you look for
 * it (and also inline in the builder); the row itself is owner-only by
 * RLS (clients_write demands practice.manage).
 */

const STATES: Record<string, string> = {
  added: 'Added. Invite their people from Settings, then start the engagement in the builder.',
  owner_only: 'Only the practice owner adds clients.',
  invalid: 'Give the client a name.',
  error: 'That did not save. Try again.',
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const supabase = await createServerSupabase()
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, status, engagements(id, title, status)')
    .order('created_at', { ascending: true })

  return (
    <RoomShell eyebrow="Clients" title="Clients" maxWidth="max-w-4xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      {!clients || clients.length === 0 ? (
        <p className="text-ink-dim">No clients yet. Add the first one below.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-3">
          {clients.map((c) => (
            <li
              key={c.id}
              className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5"
            >
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-display text-xl font-medium text-ink">{c.name}</span>
                <span className="eyebrow">{c.status}</span>
              </div>
              {(c.engagements ?? []).map((e) => (
                <div key={e.id} className="mt-2 text-sm text-ink-dim">
                  {e.title} ({e.status})
                </div>
              ))}
              {(c.engagements ?? []).length === 0 ? (
                <p className="mt-2 text-sm text-ink-dim">
                  No engagement yet. Start one from{' '}
                  <Link href="/engagements" className="text-forest underline">
                    the builder
                  </Link>
                  .
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <section className="mt-10 border-t border-ink/10 pt-6">
        <h2 className="font-display text-2xl font-medium text-ink">Add a client</h2>
        <p className="mt-1 text-sm text-ink-dim">
          The organization first; their people get invited from{' '}
          <Link href="/settings/members" className="underline hover:text-ink">
            Settings, members and access
          </Link>
          , and the engagement starts in the builder. Owner only.
        </p>
        <form action={addClientFromList} className="mt-3 flex flex-wrap items-center gap-3">
          <input
            name="name"
            required
            maxLength={120}
            placeholder="Organization name"
            className="min-w-[240px] flex-1 basis-64 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
          />
          <button
            type="submit"
            className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
          >
            Add client
          </button>
        </form>
      </section>

      <p className="mt-8 text-sm text-ink-dim">
        Engagement detail lives under{' '}
        <Link href="/engagements" className="text-forest underline">
          Engagements
        </Link>
        .
      </p>
    </RoomShell>
  )
}

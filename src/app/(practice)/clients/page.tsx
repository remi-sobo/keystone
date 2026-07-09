import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'

/**
 * The practice's client list. Reads under RLS with the session client;
 * a practice member sees every client of their practice and nothing of
 * any other practice.
 */
export default async function ClientsPage() {
  const supabase = await createServerSupabase()
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, status, engagements(id, title, status)')
    .order('created_at', { ascending: true })

  return (
    <RoomShell eyebrow="Clients" title="Clients" maxWidth="max-w-4xl">
      {!clients || clients.length === 0 ? (
        <p className="text-ink-dim">
          No clients yet. The first one arrives with the engagement seed.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
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
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-sm text-ink-dim">
        Engagement detail lives under <Link href="/engagements" className="text-forest underline">Engagements</Link>.
      </p>
    </RoomShell>
  )
}

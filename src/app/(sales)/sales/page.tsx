import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { SalesRegisterForm } from '@/components/SalesRegisterForm'
import { expiryPhrase, daysToExpiry } from '@/lib/sales'
import { releaseProspect } from './actions'

/**
 * My prospects (specs/keystone-sales.md, Ring 1). The registration
 * record, which is the clause that keeps a disagreement from becoming a
 * family disagreement: whose prospect this is, and from when.
 *
 * Reads are PURE RLS. The policy returns rows where registered_by is
 * the caller, so this page cannot show another rep's registrations even
 * if the query forgot to filter, and it shows nothing at all from the
 * delivery side of the practice.
 */

const STATES: Record<string, string> = {
  registered: 'Registered. The date is on it.',
  released: 'Released. The organization is open again.',
  house_account:
    'That organization is a house account under Exhibit A. It cannot be registered.',
  existing_client:
    'The practice already works with that organization, so it is not open for registration.',
  registered_by_other:
    'That organization is already registered inside the practice. Talk to Remi before you spend time on it.',
  invalid: 'That did not parse. Check the fields.',
  error: 'That did not save. Try again.',
}

const STATUS_LABEL: Record<string, string> = {
  registered: 'Registered',
  expired: 'Lapsed',
  released: 'Released',
  converted: 'Signed',
}

export default async function SalesProspectsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const supabase = await createServerSupabase()

  const { data: prospects } = await supabase
    .from('sales_prospects')
    .select(
      'id, org_name, contact_name, contact_email, source, note, registered_at, expires_at, status'
    )
    .order('registered_at', { ascending: false })

  const rows = prospects ?? []
  const live = rows.filter((p) => p.status === 'registered' && daysToExpiry(p.expires_at) >= 0)
  const past = rows.filter((p) => !live.includes(p))

  return (
    <RoomShell
      eyebrow="Sales"
      title="My prospects"
      description="Every organization you have registered, with the date that makes it yours."
      maxWidth="max-w-3xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <KeystoneCard>
          <p className="eyebrow">Register a prospect</p>
          <SalesRegisterForm />
        </KeystoneCard>

        <section>
          <p className="eyebrow">Registered</p>
          {live.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">
              Nothing registered yet. The first one goes in before the first call.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {live.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-3"
                >
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block text-sm text-ink">{p.org_name}</span>
                    {p.contact_name ? (
                      <span className="block text-xs text-ink-dim">{p.contact_name}</span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-ink-dim">
                      {expiryPhrase(p.expires_at)}
                    </span>
                  </span>
                  <form action={releaseProspect}>
                    <input type="hidden" name="prospectId" value={p.id} />
                    <button
                      type="submit"
                      className="text-xs text-ink-dim underline hover:text-ink"
                    >
                      Release
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 ? (
          <section>
            <p className="eyebrow">No longer held</p>
            <ul className="mt-2 flex flex-col gap-2">
              {past.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 px-4 py-2.5"
                >
                  <span className="text-sm text-ink-dim">{p.org_name}</span>
                  <span className="text-xs text-ink-dim">
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </RoomShell>
  )
}

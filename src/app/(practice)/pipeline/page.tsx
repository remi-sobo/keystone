import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { addDeal, moveDeal, convertDeal } from './actions'

/**
 * Pipeline-lite (V2 4G). Product-tier per CONFIRM V2-5: SOBO runs
 * pipeline and money in Trellis, so this room exists for the practice
 * that has no Trellis, behind a flag SOBO leaves off. Off means off:
 * the page says so and every action refuses server-side. No money
 * fields anywhere; the deals table has nowhere to put a number.
 */

const STAGE_ORDER = ['lead', 'discovery', 'proposal', 'verbal_yes', 'paused', 'closed', 'converted'] as const

const STAGE_LABEL: Record<string, string> = {
  lead: 'Lead',
  discovery: 'Discovery',
  proposal: 'Proposal out',
  verbal_yes: 'Verbal yes',
  paused: 'Paused',
  closed: 'Closed',
  converted: 'Converted',
}

const STATES: Record<string, string> = {
  deal_added: 'Added.',
  deal_moved: 'Moved.',
  deal_not_ready: 'Convert follows a verbal yes. Move it there first.',
  deal_invalid: 'That did not parse. Check the fields.',
  deal_error: 'That did not save. Try again.',
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const supabase = await createServerSupabase()
  const { data: practice } = await supabase
    .from('practices')
    .select('pipeline_enabled')
    .limit(1)
    .maybeSingle()

  if (!practice?.pipeline_enabled) {
    return (
      <RoomShell eyebrow="The practice" title="Pipeline" maxWidth="max-w-2xl">
        <p className="text-sm text-ink">Pipeline is off for this practice.</p>
        <p className="mt-2 text-sm text-ink-dim">
          SOBO runs its pipeline and money in the Trellis command center, and that stays the one
          place. This room exists for a practice on Keystone that has no Trellis; turning it on is
          a deliberate flag flip, not a setting on this page.
        </p>
      </RoomShell>
    )
  }

  const { data: deals } = await supabase
    .from('deals')
    .select('id, name, contact_name, contact_email, note_md, stage, engagement_draft_id, created_at')
    .order('created_at', { ascending: false })

  return (
    <RoomShell eyebrow="The practice" title="Pipeline" maxWidth="max-w-4xl">
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        {STAGE_ORDER.map((stage) => {
          const rows = (deals ?? []).filter((d) => d.stage === stage)
          if (rows.length === 0) return null
          return (
            <section key={stage}>
              <p className="eyebrow">{STAGE_LABEL[stage]}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {rows.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
                  >
                    <span className="min-w-0 flex-1 basis-48 text-sm text-ink">
                      {d.name}
                      {d.contact_name ? (
                        <span className="block text-xs text-ink-dim">{d.contact_name}</span>
                      ) : null}
                    </span>
                    {d.stage === 'converted' ? (
                      <span className="text-xs text-ink-dim">in the builder</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <form action={moveDeal} className="flex items-center gap-1.5">
                          <input type="hidden" name="dealId" value={d.id} />
                          <select
                            name="stage"
                            defaultValue={d.stage}
                            className="rounded border border-ink/15 bg-paper px-2 py-1 text-xs text-ink"
                          >
                            {STAGE_ORDER.filter((s) => s !== 'converted').map((s) => (
                              <option key={s} value={s}>
                                {STAGE_LABEL[s]}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="text-xs text-ink-dim underline hover:text-ink">
                            Move
                          </button>
                        </form>
                        {d.stage === 'verbal_yes' ? (
                          <form action={convertDeal}>
                            <input type="hidden" name="dealId" value={d.id} />
                            <button
                              type="submit"
                              className="rounded-lg bg-forest px-3 py-1 text-xs font-medium text-paper hover:bg-forest-deep"
                            >
                              Convert to draft
                            </button>
                          </form>
                        ) : null}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

        <KeystoneCard>
          <p className="eyebrow">New deal</p>
          <form action={addDeal} className="mt-3 flex flex-col gap-3">
            <input
              name="name"
              required
              maxLength={200}
              placeholder="Organization or deal name"
              className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
            />
            <div className="flex flex-wrap gap-3">
              <input
                name="contactName"
                maxLength={200}
                placeholder="Contact name (optional)"
                className="flex-1 basis-48 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              />
              <input
                name="contactEmail"
                type="email"
                maxLength={320}
                placeholder="Contact email (optional)"
                className="flex-1 basis-48 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              />
            </div>
            <textarea
              name="note"
              rows={2}
              maxLength={4000}
              placeholder="Context, in a line or two (optional)"
              className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
            />
            <button
              type="submit"
              className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]"
            >
              Add deal
            </button>
          </form>
        </KeystoneCard>
      </div>
    </RoomShell>
  )
}

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { submitCheckin } from '../actions'

/**
 * The confidence check-in take-flow (PURE RLS): one page, the framing,
 * fifteen 0-to-10 items under their three domain headings, two open
 * boxes, one submit. Growth is described, never scored: no score is
 * shown back, no comparison is drawn, and a submitted check-in shows
 * only its quiet done state. The check-in row itself is invisible to
 * anyone but a named participant (and the practice), so a founder who
 * guesses the URL lands back on home.
 */

const DOMAIN_HEADINGS: Record<string, string> = {
  fundraising: 'Fundraising',
  departments: 'Across the organization',
  mindset: 'The executive seat',
  open: 'In your own words',
}

const STATES: Record<string, string> = {
  incomplete: 'A few items are still blank. Every scale needs an answer.',
  error: 'That did not save. Nothing was recorded; try again.',
}

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ state?: string }>
}) {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')
  const { id } = await params
  const { state } = await searchParams
  const supabase = await createServerSupabase()

  const [{ data: checkin }, { data: me }] = await Promise.all([
    supabase
      .from('confidence_checkins')
      .select('id, engagement_id, label, opens_at, due_at')
      .eq('id', id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
    supabase
      .from('client_members')
      .select('id')
      .eq('user_id', viewer.user.id)
      .eq('client_id', viewer.client.clientId)
      .maybeSingle(),
  ])
  if (!checkin || !me) redirect('/home')

  const today = new Date().toISOString().slice(0, 10)
  if (checkin.opens_at > today) redirect('/home')

  const [{ data: items }, { count: submittedCount }] = await Promise.all([
    supabase
      .from('confidence_items')
      .select('id, domain, prompt, kind, sort_order')
      .eq('engagement_id', checkin.engagement_id)
      .eq('active', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('confidence_responses')
      .select('id', { count: 'exact', head: true })
      .eq('checkin_id', checkin.id)
      .eq('client_member_id', me.id),
  ])
  const submitted = (submittedCount ?? 0) > 0

  if (submitted) {
    return (
      <RoomShell eyebrow="Confidence check-in" title={checkin.label}>
        <KeystoneCard feature>
          <p className="text-sm text-ink">
            Got it. Same check-in next month, watch your line move.
          </p>
          <Link href="/home" className="mt-3 inline-block text-sm text-forest underline">
            Back to home
          </Link>
        </KeystoneCard>
      </RoomShell>
    )
  }

  const scaleItems = (items ?? []).filter((i) => i.kind === 'scale')
  const textItems = (items ?? []).filter((i) => i.kind === 'text')
  const domains = [...new Set(scaleItems.map((i) => i.domain))]

  return (
    <RoomShell eyebrow="Confidence check-in" title={checkin.label}>
      {state && STATES[state] ? (
        <p className="mb-4 rounded-[var(--radius)] border border-brass/40 bg-paper-raised px-4 py-2 text-sm text-ink">
          {STATES[state]}
        </p>
      ) : null}

      <p className="max-w-prose text-sm text-ink">
        Three minutes, honest answers. This is a growth measure, never a grade. You&apos;ll take
        the same check-in each month, so you can watch your own line move. Rate how confident you
        feel TODAY that you could do each of these.
      </p>
      <p className="mt-2 text-xs text-ink-dim">
        0 is &quot;not at all confident,&quot; 10 is &quot;completely confident.&quot; Due{' '}
        {new Date(`${checkin.due_at}T00:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}
        .
      </p>

      <form action={submitCheckin} className="mt-8 flex max-w-2xl flex-col gap-10">
        <input type="hidden" name="checkinId" value={checkin.id} />

        {domains.map((domain) => (
          <section key={domain} aria-label={DOMAIN_HEADINGS[domain] ?? domain}>
            <h2 className="font-display text-2xl font-medium text-ink">
              {DOMAIN_HEADINGS[domain] ?? domain}
            </h2>
            <div className="mt-4 flex flex-col gap-6">
              {scaleItems
                .filter((i) => i.domain === domain)
                .map((item) => (
                  <fieldset key={item.id}>
                    <legend className="text-sm text-ink">{item.prompt}</legend>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {Array.from({ length: 11 }, (_, n) => (
                        <label
                          key={n}
                          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-ink/15 text-sm text-ink transition-colors duration-200 hover:border-forest has-[:checked]:border-forest has-[:checked]:bg-forest has-[:checked]:text-paper"
                        >
                          <input
                            type="radio"
                            name={`score_${item.id}`}
                            value={n}
                            required
                            className="sr-only"
                          />
                          {n}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
            </div>
          </section>
        ))}

        {textItems.length > 0 ? (
          <section aria-label="In your own words">
            <h2 className="font-display text-2xl font-medium text-ink">In your own words</h2>
            <div className="mt-4 flex flex-col gap-6">
              {textItems.map((item) => (
                <label key={item.id} className="block">
                  <span className="text-sm text-ink">{item.prompt}</span>
                  <textarea
                    name={`text_${item.id}`}
                    rows={3}
                    maxLength={4000}
                    className="mt-2 w-full rounded-[var(--radius)] border border-ink/15 bg-paper-raised p-3 text-sm text-ink focus:border-forest focus:outline-none"
                  />
                </label>
              ))}
            </div>
          </section>
        ) : null}

        <div>
          <button
            type="submit"
            className="rounded-lg border border-sage px-5 py-2.5 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper active:scale-[0.98]"
          >
            Submit your check-in
          </button>
          <p className="mt-2 text-xs text-ink-dim">
            Your answers go to your coaches, and nobody else on your team. Once submitted, they
            stand as written.
          </p>
        </div>
      </form>
    </RoomShell>
  )
}

import { randomUUID } from 'crypto'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { formatMoney, formatRate, monthLabel, expiryPhrase } from '@/lib/sales'
import {
  recordDeal,
  recordPayment,
  markCommissionPaid,
  addHouseAccount,
} from './actions'

/**
 * The sales ledger (specs/keystone-sales.md, Ring 4). Remi's side of
 * the sales module: what is registered, what is signed, what has been
 * collected, and what is owed as a result.
 *
 * Commission liability is a real cash line, so it sits at the top
 * rather than being remembered. Nothing on this page computes a
 * commission: the accrual trigger did that once, at the moment the
 * payment landed, and stored the arithmetic with it.
 */

const STATES: Record<string, string> = {
  deal_recorded: 'Recorded. Commission starts when the first payment lands.',
  deal_exists: 'That organization already has a deal on that offer.',
  payment_recorded: 'Payment recorded. Commission accrued automatically.',
  payment_duplicate: 'That reference is already on this deal. Nothing was recorded twice.',
  fee_too_large: 'Processing fees cannot exceed the amount received.',
  paid: 'Marked paid.',
  house_added: 'Added to the house-account list.',
  house_exists: 'That organization is already on the list.',
  invalid: 'That did not parse. Check the fields.',
  error: 'That did not save. Try again.',
}

interface ProspectRow {
  id: string
  org_name: string
  registered_at: string
  expires_at: string
  status: string
}

interface DealRow {
  id: string
  offer: string
  amount_cents: number
  signed_on: string | null
  owner_id: string
  sales_prospects: { org_name: string } | null
}

export default async function SalesLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>
}) {
  const { state } = await searchParams
  const viewer = await getViewer()
  // The ledger is the owner's room. A consultant is delivery and a
  // sales lead never reaches the practice surface at all.
  if (!viewer.practice || viewer.practice.role !== 'owner') redirect('/today')

  const supabase = await createServerSupabase()
  const [prospectsRes, dealsRes, paymentsRes, commissionsRes, statementRes, houseRes, membersRes] =
    await Promise.all([
      supabase
        .from('sales_prospects')
        .select('id, org_name, registered_at, expires_at, status')
        .order('registered_at', { ascending: false }),
      supabase
        .from('sales_deals')
        .select('id, offer, amount_cents, signed_on, owner_id, sales_prospects(org_name)')
        .order('created_at', { ascending: false }),
      supabase.from('sales_payments').select('id, deal_id, amount_received_cents, received_at'),
      supabase
        .from('sales_commissions')
        .select('id, deal_id, owner_id, amount_cents, rate_bp, status, statement_month'),
      supabase
        .from('sales_commission_statement')
        .select('statement_month, org_name, collected_cents, commission_cents')
        .order('statement_month', { ascending: false }),
      supabase.from('house_accounts').select('id, org_name, note').order('org_name'),
      supabase
        .from('practice_members')
        .select('user_id, email, commission_rate_bp')
        .eq('role', 'sales_lead'),
    ])

  const prospects = (prospectsRes.data ?? []) as ProspectRow[]
  const deals = (dealsRes.data ?? []) as unknown as DealRow[]
  const payments = paymentsRes.data ?? []
  const commissions = commissionsRes.data ?? []
  const statement = statementRes.data ?? []
  const houseAccounts = houseRes.data ?? []
  const reps = membersRes.data ?? []

  const repEmail = (userId: string) =>
    reps.find((r) => r.user_id === userId)?.email ?? 'unassigned'

  const owed = commissions
    .filter((c) => c.status === 'accrued')
    .reduce((n, c) => n + Number(c.amount_cents), 0)
  const paidOut = commissions
    .filter((c) => c.status === 'paid')
    .reduce((n, c) => n + Number(c.amount_cents), 0)
  const collected = payments.reduce((n, p) => n + Number(p.amount_received_cents), 0)
  const signedNotCollected = deals.reduce((n, d) => {
    const dealCollected = payments
      .filter((p) => p.deal_id === d.id)
      .reduce((m, p) => m + Number(p.amount_received_cents), 0)
    return n + Math.max(0, Number(d.amount_cents) - dealCollected)
  }, 0)

  const openProspects = prospects.filter((p) => p.status === 'registered')
  const months = [...new Set(statement.map((s) => s.statement_month as string))]

  // Minted per render, so a double-submitted payment form is one row
  // (the spec's idempotency requirement, at the layer that can hold it).
  const paymentId = randomUUID()

  return (
    <RoomShell
      eyebrow="The practice"
      title="Sales ledger"
      description="Registrations, signed deals, money collected, and what is owed as a result."
      maxWidth="max-w-4xl"
    >
      {state && STATES[state] ? (
        <p role="status" className="mb-6 text-sm text-forest">
          {STATES[state]}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <KeystoneCard className="flex-1 basis-44" feature>
            <p className="eyebrow">Commission owed</p>
            <p className="mt-1 font-display text-2xl text-ink">{formatMoney(owed)}</p>
          </KeystoneCard>
          <KeystoneCard className="flex-1 basis-44">
            <p className="eyebrow">Commission paid</p>
            <p className="mt-1 font-display text-2xl text-ink">{formatMoney(paidOut)}</p>
          </KeystoneCard>
          <KeystoneCard className="flex-1 basis-44">
            <p className="eyebrow">Collected</p>
            <p className="mt-1 font-display text-2xl text-ink">{formatMoney(collected)}</p>
          </KeystoneCard>
          <KeystoneCard className="flex-1 basis-44">
            <p className="eyebrow">Signed, not yet collected</p>
            <p className="mt-1 font-display text-2xl text-ink">
              {formatMoney(signedNotCollected)}
            </p>
          </KeystoneCard>
        </div>
        <p className="text-xs text-ink-dim">
          Two honest figures rather than a weighted forecast. Weighting stage probabilities with one
          rep and no closed history invents a number, and an invented number in a dashboard becomes
          a number you plan cash against.
        </p>

        <section>
          <p className="eyebrow">Registered prospects</p>
          {openProspects.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">Nothing registered yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {openProspects.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
                >
                  <span className="text-sm text-ink">{p.org_name}</span>
                  <span className="text-xs text-ink-dim">{expiryPhrase(p.expires_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <KeystoneCard>
          <p className="eyebrow">Record a signed deal</p>
          <p className="mt-1 text-xs text-ink-dim">
            A deal starts from a registration, never from a name typed here. That is what keeps the
            registration record meaningful.
          </p>
          <form action={recordDeal} className="mt-3 flex flex-col gap-3">
            <select
              name="prospectId"
              required
              className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
            >
              <option value="">Choose a registered prospect</option>
              {openProspects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.org_name}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-3">
              <select
                name="offer"
                required
                className="flex-1 basis-40 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              >
                <option value="greenhouse">Greenhouse</option>
                <option value="direct">Direct</option>
              </select>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="Contracted amount"
                className="flex-1 basis-40 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              />
              <input
                name="signedOn"
                type="date"
                required
                className="flex-1 basis-40 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
              />
            </div>
            <button
              type="submit"
              className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper hover:bg-forest-deep"
            >
              Record deal
            </button>
          </form>
        </KeystoneCard>

        <section>
          <p className="eyebrow">Deals</p>
          {deals.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">No signed deals yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3">
              {deals.map((d) => {
                const dealPayments = payments.filter((p) => p.deal_id === d.id)
                const dealCollected = dealPayments.reduce(
                  (n, p) => n + Number(p.amount_received_cents),
                  0
                )
                return (
                  <li
                    key={d.id}
                    className="rounded-lg border border-ink/10 bg-paper-raised px-4 py-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm text-ink">
                        {d.sales_prospects?.org_name ?? 'Unnamed'}
                      </span>
                      <span className="text-xs text-ink-dim">
                        {d.offer === 'greenhouse' ? 'Greenhouse' : 'Direct'} for {repEmail(d.owner_id)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-dim">
                      {formatMoney(d.amount_cents)} contracted, {formatMoney(dealCollected)}{' '}
                      collected across {dealPayments.length}{' '}
                      {dealPayments.length === 1 ? 'payment' : 'payments'}
                    </p>
                    <form action={recordPayment} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="dealId" value={d.id} />
                      <input type="hidden" name="paymentId" value={paymentId} />
                      <label className="flex flex-col text-xs text-ink-dim">
                        Amount received
                        <input
                          name="amount"
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          className="mt-0.5 w-32 rounded border border-ink/15 bg-paper px-2 py-1 text-sm text-ink"
                        />
                      </label>
                      <label className="flex flex-col text-xs text-ink-dim">
                        Processing fees
                        <input
                          name="fee"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue="0"
                          className="mt-0.5 w-28 rounded border border-ink/15 bg-paper px-2 py-1 text-sm text-ink"
                        />
                      </label>
                      <label className="flex flex-col text-xs text-ink-dim">
                        Received
                        <input
                          name="receivedAt"
                          type="date"
                          required
                          className="mt-0.5 rounded border border-ink/15 bg-paper px-2 py-1 text-sm text-ink"
                        />
                      </label>
                      <label className="flex flex-col text-xs text-ink-dim">
                        Reference
                        <input
                          name="sourceRef"
                          maxLength={200}
                          placeholder="Bank or check ref"
                          className="mt-0.5 w-40 rounded border border-ink/15 bg-paper px-2 py-1 text-sm text-ink"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-lg bg-forest px-3 py-1.5 text-xs font-medium text-paper hover:bg-forest-deep"
                      >
                        Record payment
                      </button>
                    </form>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <p className="eyebrow">Commission owed</p>
          {commissions.filter((c) => c.status === 'accrued').length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">Nothing accrued and unpaid.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {commissions
                .filter((c) => c.status === 'accrued')
                .map((c) => {
                  const deal = deals.find((d) => d.id === c.deal_id)
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
                    >
                      <span className="text-sm text-ink">
                        {formatMoney(c.amount_cents)}
                        <span className="ml-2 text-xs text-ink-dim">
                          {deal?.sales_prospects?.org_name ?? 'Unnamed'} at{' '}
                          {formatRate(c.rate_bp)} for {repEmail(c.owner_id)}
                        </span>
                      </span>
                      <form action={markCommissionPaid} className="flex items-center gap-2">
                        <input type="hidden" name="commissionId" value={c.id} />
                        <input
                          name="paidRef"
                          maxLength={200}
                          placeholder="Payment ref"
                          className="w-32 rounded border border-ink/15 bg-paper px-2 py-1 text-xs text-ink"
                        />
                        <button
                          type="submit"
                          className="text-xs text-ink-dim underline hover:text-ink"
                        >
                          Mark paid
                        </button>
                      </form>
                    </li>
                  )
                })}
            </ul>
          )}
        </section>

        {months.length > 0 ? (
          <section>
            <p className="eyebrow">Statement by month</p>
            {months.map((month) => (
              <div key={month} className="mt-3">
                <p className="text-sm text-ink">{monthLabel(month)}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {statement
                    .filter((s) => s.statement_month === month)
                    .map((s, i) => (
                      <li key={`${month}-${i}`} className="text-xs text-ink-dim">
                        {s.org_name as string}: {formatMoney(s.collected_cents as number)}{' '}
                        collected, {formatMoney(s.commission_cents as number)} commission
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        <KeystoneCard>
          <p className="eyebrow">House accounts</p>
          <p className="mt-1 text-xs text-ink-dim">
            Exhibit A of the agreement. An organization on this list cannot be registered, and the
            refusal happens at the moment the name is typed.
          </p>
          {houseAccounts.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">
              The list is empty. Until Exhibit A is entered here, no organization is protected.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {houseAccounts.map((h) => (
                <li key={h.id} className="text-sm text-ink">
                  {h.org_name}
                  {h.note ? <span className="ml-2 text-xs text-ink-dim">{h.note}</span> : null}
                </li>
              ))}
            </ul>
          )}
          <form action={addHouseAccount} className="mt-3 flex flex-wrap items-end gap-2">
            <input
              name="orgName"
              required
              maxLength={200}
              placeholder="Organization name"
              className="flex-1 basis-56 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
            />
            <input
              name="note"
              maxLength={1000}
              placeholder="Note (optional)"
              className="flex-1 basis-40 rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
            />
            <button
              type="submit"
              className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper hover:bg-forest-deep"
            >
              Add
            </button>
          </form>
        </KeystoneCard>

        {reps.length > 0 ? (
          <section>
            <p className="eyebrow">Rates</p>
            <ul className="mt-2 flex flex-col gap-1">
              {reps.map((r) => (
                <li key={r.email} className="text-xs text-ink-dim">
                  {r.email} at {formatRate(r.commission_rate_bp)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-dim">
              The rate is copied onto every commission row when it accrues, so changing it later
              never moves a statement already issued.
            </p>
          </section>
        ) : null}
      </div>
    </RoomShell>
  )
}

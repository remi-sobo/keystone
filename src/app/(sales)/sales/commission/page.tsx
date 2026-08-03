import { createServerSupabase } from '@/lib/supabase/server'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import { formatMoney, formatRate, monthLabel } from '@/lib/sales'

/**
 * My commission (specs/keystone-sales.md, Ring 4). Section 4.4 of the
 * agreement puts a monthly statement obligation on the practice; this
 * page is that statement, always current, so nobody hand-builds one.
 *
 * Every number here is read under the caller's own RLS, so a rep sees
 * his own money and nothing else. The arithmetic is not done on this
 * page: it was done once by the accrual trigger and stored, so what
 * shows here is what the ledger says.
 */

interface DealRow {
  id: string
  offer: string
  amount_cents: number
  signed_on: string | null
  sales_prospects: { org_name: string } | null
}

export default async function SalesCommissionPage() {
  const supabase = await createServerSupabase()

  const [dealsRes, paymentsRes, commissionsRes, statementRes] = await Promise.all([
    supabase
      .from('sales_deals')
      .select('id, offer, amount_cents, signed_on, sales_prospects(org_name)')
      .order('created_at', { ascending: false }),
    supabase.from('sales_payments').select('deal_id, amount_received_cents, received_at'),
    supabase.from('sales_commissions').select('deal_id, amount_cents, status, rate_bp'),
    supabase
      .from('sales_commission_statement')
      .select(
        'statement_month, org_name, offer, collected_cents, commission_cents, commission_paid_cents, commission_pending_cents, rate_bp'
      )
      .order('statement_month', { ascending: false }),
  ])

  const deals = (dealsRes.data ?? []) as unknown as DealRow[]
  const payments = paymentsRes.data ?? []
  const commissions = commissionsRes.data ?? []
  const statement = statementRes.data ?? []

  const sum = (rows: { amount_cents?: number; amount_received_cents?: number }[], key: string) =>
    rows.reduce((n, r) => n + Number((r as Record<string, unknown>)[key] ?? 0), 0)

  const totalAccrued = sum(
    commissions.filter((c) => c.status === 'accrued'),
    'amount_cents'
  )
  const totalPaid = sum(
    commissions.filter((c) => c.status === 'paid'),
    'amount_cents'
  )

  const months = [...new Set(statement.map((s) => s.statement_month as string))]

  return (
    <RoomShell
      eyebrow="Sales"
      title="My commission"
      description="Commission is earned on money the practice actually receives, not on what was signed. A signed deal that has not been paid shows here as pipeline, not as earnings."
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <KeystoneCard className="flex-1 basis-48">
            <p className="eyebrow">Paid to you</p>
            <p className="mt-1 font-display text-2xl text-ink">{formatMoney(totalPaid)}</p>
          </KeystoneCard>
          <KeystoneCard className="flex-1 basis-48">
            <p className="eyebrow">Accrued, not yet paid</p>
            <p className="mt-1 font-display text-2xl text-ink">{formatMoney(totalAccrued)}</p>
          </KeystoneCard>
        </div>

        <section>
          <p className="eyebrow">By deal</p>
          {deals.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">
              Nothing signed yet. Deals appear here once the practice records the signed amount.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {deals.map((d) => {
                const dealPayments = payments.filter((p) => p.deal_id === d.id)
                const dealCommissions = commissions.filter((c) => c.deal_id === d.id)
                const collected = sum(dealPayments, 'amount_received_cents')
                const accrued = sum(
                  dealCommissions.filter((c) => c.status === 'accrued'),
                  'amount_cents'
                )
                const paid = sum(
                  dealCommissions.filter((c) => c.status === 'paid'),
                  'amount_cents'
                )
                const rate = dealCommissions[0]?.rate_bp
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
                        {d.offer === 'greenhouse' ? 'Greenhouse' : 'Direct'}
                        {rate ? ` at ${formatRate(rate)}` : ''}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-dim sm:grid-cols-4">
                      <div>
                        <dt>Contracted</dt>
                        <dd className="text-ink">{formatMoney(d.amount_cents)}</dd>
                      </div>
                      <div>
                        <dt>Collected</dt>
                        <dd className="text-ink">{formatMoney(collected)}</dd>
                      </div>
                      <div>
                        <dt>Commission pending</dt>
                        <dd className="text-ink">{formatMoney(accrued)}</dd>
                      </div>
                      <div>
                        <dt>Commission paid</dt>
                        <dd className="text-ink">{formatMoney(paid)}</dd>
                      </div>
                    </dl>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <p className="eyebrow">Monthly statement</p>
          <p className="mt-1 text-xs text-ink-dim">
            One line per organization per month, showing what came in and how the commission was
            calculated. This is the statement the agreement asks for, and it is current whenever you
            open it.
          </p>
          {months.length === 0 ? (
            <p className="mt-2 text-sm text-ink-dim">No payments have been received yet.</p>
          ) : (
            months.map((month) => (
              <div key={month} className="mt-4">
                <p className="text-sm text-ink">{monthLabel(month)}</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[28rem] text-left text-xs">
                    <thead className="text-ink-dim">
                      <tr>
                        <th className="py-1 pr-3 font-normal">Organization</th>
                        <th className="py-1 pr-3 font-normal">Collected</th>
                        <th className="py-1 pr-3 font-normal">Rate</th>
                        <th className="py-1 pr-3 font-normal">Commission</th>
                        <th className="py-1 font-normal">Paid</th>
                      </tr>
                    </thead>
                    <tbody className="text-ink">
                      {statement
                        .filter((s) => s.statement_month === month)
                        .map((s, i) => (
                          <tr key={`${month}-${i}`} className="border-t border-ink/10">
                            <td className="py-1.5 pr-3">{s.org_name as string}</td>
                            <td className="py-1.5 pr-3">
                              {formatMoney(s.collected_cents as number)}
                            </td>
                            <td className="py-1.5 pr-3">{formatRate(s.rate_bp as number)}</td>
                            <td className="py-1.5 pr-3">
                              {formatMoney(s.commission_cents as number)}
                            </td>
                            <td className="py-1.5">
                              {formatMoney(s.commission_paid_cents as number)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </RoomShell>
  )
}

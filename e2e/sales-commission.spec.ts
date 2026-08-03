import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  commissionCents,
  statementMonth,
  formatMoney,
  formatRate,
  verdictFromError,
  canRegister,
  expiryPhrase,
} from '../src/lib/sales'

/**
 * The commission ledger (specs/keystone-sales.md, Ring 4).
 *
 * Section 4.4 of the agreement obliges the practice to issue a monthly
 * statement showing org, amounts collected, and the calculation. The
 * definition of done for this ring is arithmetic that matches a hand
 * calculation and a payment that can never accrue twice, so this gate
 * checks both: the pure function against hand numbers, and the schema
 * against the two duplication paths that money is exposed to.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')
const MIG = read('supabase/migrations/0045_sales_commission.sql')

test.describe('the arithmetic matches a hand calculation', () => {
  test('twenty percent of ten thousand dollars, net of fees', () => {
    // $10,000.00 received, $300.00 in processing fees, so the basis is
    // $9,700.00 and twenty percent of that is $1,940.00.
    expect(commissionCents(1_000_000, 30_000, 2000)).toBe(194_000)
    expect(formatMoney(194_000)).toBe('$1,940.00')
  })

  test('no fees means the full amount is the basis', () => {
    expect(commissionCents(2_500_000, 0, 2000)).toBe(500_000)
  })

  test('a zero rate earns nothing, which is how a direct deal reads', () => {
    expect(commissionCents(2_500_000, 0, 0)).toBe(0)
  })

  test('fees can never push the basis below zero', () => {
    expect(commissionCents(10_000, 50_000, 2000)).toBe(0)
  })

  test('rounding is half up at the cent, matching the trigger', () => {
    // 3333 cents at 20% is 666.6, which rounds to 667.
    expect(commissionCents(3_333, 0, 2000)).toBe(667)
    expect(MIG).toContain('round(v_basis::numeric * v_rate / 10000)::bigint')
  })

  test('rates read as percentages and money reads as money', () => {
    expect(formatRate(2000)).toBe('20%')
    expect(formatRate(1750)).toBe('17.50%')
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(null)).toBe('$0.00')
  })

  test('a payment lands in the month it was received', () => {
    expect(statementMonth('2026-08-14')).toBe('2026-08-01')
    expect(statementMonth('2026-01-31')).toBe('2026-01-01')
    expect(MIG).toContain("date_trunc('month', new.received_at::timestamp)::date")
  })
})

test.describe('a payment can never accrue twice', () => {
  test('one commission row per payment, as a constraint', () => {
    expect(MIG).toMatch(/payment_id\s+uuid not null unique references public\.sales_payments/)
    expect(MIG).toContain('on conflict (payment_id) do nothing')
  })

  test('the payment id is client-minted and the insert ignores duplicates', () => {
    // The spec names this shape after the four-rows-per-send bug that
    // Keystone already shipped once in messages.
    const paymentsDdl = MIG.slice(
      MIG.indexOf('create table if not exists public.sales_payments'),
      MIG.indexOf('create unique index if not exists sales_payments_source_ref_uniq')
    )
    expect(paymentsDdl).toContain('id                    uuid primary key,')
    expect(
      paymentsDdl,
      'a server-defaulted id would defeat the whole idempotency layer'
    ).not.toContain('gen_random_uuid')
    const ledger = read('src/app/(practice)/sales-ledger/actions.ts')
    expect(ledger).toContain("{ onConflict: 'id', ignoreDuplicates: true }")
    // The id is minted when the form renders, so a double submit of the
    // SAME form carries the same id and lands once.
    expect(read('src/app/(practice)/sales-ledger/page.tsx')).toContain('const paymentId = randomUUID()')
  })

  test('the same real-world reference cannot land twice on one deal', () => {
    expect(MIG).toContain('sales_payments_source_ref_uniq')
  })

  test('accrual is automatic at the mutation layer, not opt-in per caller', () => {
    expect(MIG).toContain('create trigger sales_payments_accrue')
    expect(MIG).toContain('after insert on public.sales_payments')
    // And no caller has a way to write one by hand.
    expect(MIG).not.toMatch(/create policy sales_commissions_insert/)
  })
})

test.describe('money is stored so it cannot drift', () => {
  test('integer cents and basis points, never a float', () => {
    const ddl = MIG.replace(/^\s*--.*$/gm, '')
    expect(ddl, 'money must not be stored as a float or a numeric column').not.toMatch(
      /\b(real|double precision|float)\b/i
    )
    expect(ddl).toContain('amount_received_cents bigint')
    expect(ddl).toContain('rate_bp         integer')
  })

  test('the rate is copied onto the row, never read from config', () => {
    // Spec open decision 4: a future rep at a different rate, or a
    // re-signed agreement, must not move a historical statement.
    expect(MIG).toContain('rate_bp         integer not null')
    expect(MIG).toContain('commission_rate_bp')
    const accrual = MIG.slice(MIG.indexOf('keystone_sales_accrue_commission'))
    expect(accrual).toContain('pm.commission_rate_bp')
  })

  test('no session can rewrite an amount or a rate', () => {
    expect(MIG).toContain('revoke update on public.sales_commissions from authenticated')
    expect(MIG).toContain(
      'grant update (status, paid_at, paid_ref) on public.sales_commissions to authenticated'
    )
  })

  test('the scope and the owner come from the record, not from the caller', () => {
    expect(MIG).toContain('create trigger sales_deals_scope')
    expect(MIG).toContain('create trigger sales_payments_scope')
    const scope = MIG.slice(MIG.indexOf('keystone_sales_deal_scope'))
    expect(scope).toContain('new.owner_id := v_owner')
    expect(scope).toContain('new.practice_id := v_practice')
  })

  test('the statement is a view over the ledger, under the caller RLS', () => {
    expect(MIG).toContain('create or replace view public.sales_commission_statement')
    expect(MIG).toContain('with (security_invoker = true)')
  })
})

test.describe('the surfaces say true things', () => {
  test('the rep surface states the rule the arithmetic follows', () => {
    const page = read('src/app/(sales)/sales/commission/page.tsx')
    expect(page).toContain('Commission is earned on money the practice actually receives')
  })

  test('the ledger shows two honest figures, never a weighted forecast', () => {
    const page = read('src/app/(practice)/sales-ledger/page.tsx')
    expect(page).toContain('Signed, not yet collected')
    expect(page).toContain('Two honest figures rather than a weighted forecast')
    expect(page, 'no invented probability weighting with zero closed history').not.toMatch(
      /weighted(Value|Amount|Pipeline)|probability|expectedValue/i
    )
  })

  test('a collision reads the same whichever layer caught it', () => {
    expect(verdictFromError('sales_collision_house_account')).toBe('house_account')
    expect(verdictFromError('sales_collision_existing_client')).toBe('existing_client')
    expect(verdictFromError('sales_collision_already_registered')).toBe('registered_by_other')
    expect(verdictFromError('some other database error')).toBeNull()
    expect(canRegister('available')).toBe(true)
    expect(canRegister('house_account')).toBe(false)
    expect(canRegister('registered_by_other')).toBe(false)
  })

  test('expiry is described, never scored', () => {
    const now = new Date('2026-08-03T12:00:00Z')
    expect(expiryPhrase('2026-08-03T12:00:00Z', now)).toBe('Registration lapses today')
    expect(expiryPhrase('2026-08-04T12:00:00Z', now)).toBe('Registration lapses tomorrow')
    expect(expiryPhrase('2026-08-13T12:00:00Z', now)).toBe('Registration lapses in 10 days')
    expect(expiryPhrase('2026-07-01T12:00:00Z', now)).toBe('Registration has lapsed')
    expect(expiryPhrase('2027-01-30T12:00:00Z', now)).toContain('Registered through')
  })
})

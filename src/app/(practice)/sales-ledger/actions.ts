'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { logAuditAction } from '@/lib/audit'

/**
 * Sales ledger actions (specs/keystone-sales.md, Ring 4). The practice
 * side of the sales module: recording a signed amount, recording money
 * received, marking a commission paid, and keeping Exhibit A current.
 *
 * Owner only. The session client carries the write and the RLS policies
 * demand sales.manage, which only the owner role holds, so a consultant
 * or a sales lead reaching this action changes nothing even if the page
 * guard were wrong.
 *
 * Commission is NOT computed here. A payment row landing fires the
 * accrual trigger in migration 0045, which is what makes "a payment
 * inserted through any path produces exactly one commission row" true
 * rather than hoped for.
 */

async function guardLedger() {
  const viewer = await getViewer()
  if (!viewer.user) redirect('/login')
  if (viewer.sales) redirect('/sales')
  if (!viewer.practice) redirect('/login?state=no_access')
  if (viewer.practice.role !== 'owner') redirect('/today')
  const supabase = await createServerSupabase()
  return { viewer, supabase }
}

const DealShape = z.object({
  prospectId: z.string().uuid(),
  offer: z.enum(['greenhouse', 'direct']),
  amount: z.coerce.number().min(0).max(100_000_000),
  signedOn: z.string().trim().min(1),
  note: z.string().trim().max(4000).optional(),
})

/**
 * Record a signed deal against a registered prospect. Registration is
 * the only path to a deal existing (failure mode 4), so this takes a
 * prospect id and never an org name. The prospect supplies the scope
 * and the owner; the trigger enforces that rather than trusting it.
 */
export async function recordDeal(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardLedger()
  const parsed = DealShape.safeParse({
    prospectId: formData.get('prospectId'),
    offer: formData.get('offer'),
    amount: formData.get('amount'),
    signedOn: formData.get('signedOn'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/sales-ledger?state=invalid')

  const { error } = await supabase.from('sales_deals').insert({
    prospect_id: parsed.data.prospectId,
    offer: parsed.data.offer,
    amount_cents: Math.round(parsed.data.amount * 100),
    signed_on: parsed.data.signedOn,
    note: parsed.data.note ?? null,
    created_by: viewer.user!.id,
    // Overwritten by the scope trigger from the prospect. Present only
    // because the columns are NOT NULL.
    practice_id: viewer.practice!.practiceId,
    owner_id: viewer.user!.id,
  })
  if (error) {
    if (error.message.includes('sales_deals_prospect_offer_uniq')) {
      redirect('/sales-ledger?state=deal_exists')
    }
    console.error('[sales-ledger] deal insert failed:', error.message)
    redirect('/sales-ledger?state=error')
  }

  // The registration has done its job; the claim no longer needs to
  // block the org name.
  await supabase
    .from('sales_prospects')
    .update({ status: 'converted', updated_at: new Date().toISOString() })
    .eq('id', parsed.data.prospectId)
    .eq('status', 'registered')

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'sales.deal_recorded',
    target: parsed.data.prospectId,
    detail: { offer: parsed.data.offer },
    practiceId: viewer.practice!.practiceId,
  })
  redirect('/sales-ledger?state=deal_recorded')
}

const PaymentShape = z.object({
  // Minted when the form rendered, so a double submit is one row.
  paymentId: z.string().uuid(),
  dealId: z.string().uuid(),
  amount: z.coerce.number().gt(0).max(100_000_000),
  fee: z.coerce.number().min(0).max(100_000_000),
  receivedAt: z.string().trim().min(1),
  sourceRef: z.string().trim().max(200).optional(),
  note: z.string().trim().max(4000).optional(),
})

export async function recordPayment(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardLedger()
  const parsed = PaymentShape.safeParse({
    paymentId: formData.get('paymentId'),
    dealId: formData.get('dealId'),
    amount: formData.get('amount'),
    fee: formData.get('fee') || 0,
    receivedAt: formData.get('receivedAt'),
    sourceRef: String(formData.get('sourceRef') ?? '').trim() || undefined,
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/sales-ledger?state=invalid')

  const amountCents = Math.round(parsed.data.amount * 100)
  const feeCents = Math.round(parsed.data.fee * 100)
  if (feeCents > amountCents) redirect('/sales-ledger?state=fee_too_large')

  // The client-minted id plus ON CONFLICT DO NOTHING is the idempotency
  // layer the spec asks for by name. Keystone already shipped four rows
  // per send once, in messages; money is worse than messages.
  const { error } = await supabase.from('sales_payments').upsert(
    {
      id: parsed.data.paymentId,
      deal_id: parsed.data.dealId,
      amount_received_cents: amountCents,
      processing_fee_cents: feeCents,
      received_at: parsed.data.receivedAt,
      source_ref: parsed.data.sourceRef ?? null,
      note: parsed.data.note ?? null,
      recorded_by: viewer.user!.id,
      // Overwritten by the scope trigger from the deal.
      practice_id: viewer.practice!.practiceId,
    },
    { onConflict: 'id', ignoreDuplicates: true }
  )
  if (error) {
    if (error.message.includes('sales_payments_source_ref_uniq')) {
      redirect('/sales-ledger?state=payment_duplicate')
    }
    console.error('[sales-ledger] payment insert failed:', error.message)
    redirect('/sales-ledger?state=error')
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'sales.payment_recorded',
    target: parsed.data.dealId,
    // Metadata, never the amount: the ledger holds the number, the
    // audit log holds the fact that it moved (SECURITY.md).
    detail: { has_reference: Boolean(parsed.data.sourceRef) },
    practiceId: viewer.practice!.practiceId,
  })
  redirect('/sales-ledger?state=payment_recorded')
}

const PaidShape = z.object({
  commissionId: z.string().uuid(),
  paidRef: z.string().trim().max(200).optional(),
})

/** Mark an accrued commission paid. The only update the ledger allows:
 *  the column grant in migration 0045 makes amounts and rates unwritable
 *  by any session, so a policy slip cannot restate a statement. */
export async function markCommissionPaid(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardLedger()
  const parsed = PaidShape.safeParse({
    commissionId: formData.get('commissionId'),
    paidRef: String(formData.get('paidRef') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/sales-ledger?state=invalid')

  const { error } = await supabase
    .from('sales_commissions')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_ref: parsed.data.paidRef ?? null,
    })
    .eq('id', parsed.data.commissionId)
    .eq('status', 'accrued')
  if (error) {
    console.error('[sales-ledger] mark paid failed:', error.message)
    redirect('/sales-ledger?state=error')
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'sales.commission_paid',
    target: parsed.data.commissionId,
    practiceId: viewer.practice!.practiceId,
  })
  redirect('/sales-ledger?state=paid')
}

const HouseShape = z.object({
  orgName: z.string().trim().min(1).max(200),
  note: z.string().trim().max(1000).optional(),
})

/** Add an organization to Exhibit A. The list is only as good as what
 *  is in it, which is why this form exists rather than a seed script
 *  nobody runs twice. */
export async function addHouseAccount(formData: FormData): Promise<void> {
  const { viewer, supabase } = await guardLedger()
  const parsed = HouseShape.safeParse({
    orgName: formData.get('orgName'),
    note: String(formData.get('note') ?? '').trim() || undefined,
  })
  if (!parsed.success) redirect('/sales-ledger?state=invalid')

  const { error } = await supabase.from('house_accounts').insert({
    practice_id: viewer.practice!.practiceId,
    org_name: parsed.data.orgName,
    note: parsed.data.note ?? null,
    added_by: viewer.user!.id,
  })
  if (error) {
    if (error.message.includes('house_accounts_org_uniq')) {
      redirect('/sales-ledger?state=house_exists')
    }
    console.error('[sales-ledger] house account insert failed:', error.message)
    redirect('/sales-ledger?state=error')
  }

  await logAuditAction({
    actorEmail: viewer.user!.email ?? '',
    action: 'sales.house_account_added',
    target: parsed.data.orgName,
    practiceId: viewer.practice!.practiceId,
  })
  redirect('/sales-ledger?state=house_added')
}

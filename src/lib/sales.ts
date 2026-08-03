/**
 * lib/sales.ts
 *
 * The pure half of the sales module (specs/keystone-sales.md): money
 * formatting, the commission arithmetic, and the copy for every verdict
 * the registration guard can return. No database, no session, so the
 * gate can assert the arithmetic without a Postgres.
 *
 * The commission is COMPUTED IN THE DATABASE by the accrual trigger in
 * migration 0045. The function here exists so a surface can show the
 * calculation next to the number and so the gate can check both against
 * one hand calculation. It is a mirror, never a second authority.
 */

/** Money is integer cents everywhere in this module. Never a float. */
export function formatMoney(cents: number | null | undefined, currency = 'USD'): string {
  const value = (cents ?? 0) / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Rates are basis points: 2000 is twenty percent. */
export function formatRate(rateBp: number): string {
  return `${(rateBp / 100).toFixed(rateBp % 100 === 0 ? 0 : 2)}%`
}

/**
 * Commission on one payment: the rate applied to what was received,
 * net of processing fees (agreement section 4.2). Half-up at the cent,
 * matching round() in the accrual trigger.
 */
export function commissionCents(
  amountReceivedCents: number,
  processingFeeCents: number,
  rateBp: number
): number {
  const basis = Math.max(0, amountReceivedCents - processingFeeCents)
  return Math.round((basis * rateBp) / 10000)
}

/** The month a payment belongs to, as the statement key (YYYY-MM-01). */
export function statementMonth(receivedAt: string): string {
  return `${receivedAt.slice(0, 7)}-01`
}

/** A statement month rendered for a person: "August 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-')
  const date = new Date(Number(y), Number(m) - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export type RegistrationVerdict =
  | 'available'
  | 'house_account'
  | 'existing_client'
  | 'registered_by_you'
  | 'registered_by_other'
  | 'empty'
  | 'forbidden'

/**
 * What the form says, at the moment he types it, rather than three
 * months later in an argument. Plain, and it never names the other
 * person or the other client: the answer is that the org is not
 * available, not who has it.
 */
export const VERDICT_COPY: Record<RegistrationVerdict, string> = {
  available: 'Clear to register.',
  house_account:
    'This organization is a house account under Exhibit A of your agreement. It cannot be registered.',
  existing_client:
    'The practice already works with this organization, so it is not open for registration.',
  registered_by_you: 'You already have this one registered. Check your list.',
  registered_by_other:
    'This organization is already registered inside the practice. Talk to Remi before you spend time on it.',
  empty: 'Type the organization name.',
  forbidden: 'That check is not available on this account.',
}

/** True when a verdict permits the registration to be filed. */
export function canRegister(verdict: RegistrationVerdict): boolean {
  return verdict === 'available'
}

/**
 * The database raises a named exception when a registration collides.
 * Map it back to the same verdict the live check uses, so the form says
 * one thing whichever layer caught it.
 */
export function verdictFromError(message: string): RegistrationVerdict | null {
  if (message.includes('sales_collision_house_account')) return 'house_account'
  if (message.includes('sales_collision_existing_client')) return 'existing_client'
  if (message.includes('sales_collision_already_registered')) return 'registered_by_other'
  return null
}

/** Days until a registration lapses. Negative means it already has. */
export function daysToExpiry(expiresAt: string, now: Date = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime()
  return Math.ceil(ms / 86_400_000)
}

/**
 * The expiry line under a registration. Descriptive, never a red badge:
 * the house voice describes state, it does not score the person.
 */
export function expiryPhrase(expiresAt: string, now: Date = new Date()): string {
  const days = daysToExpiry(expiresAt, now)
  if (days < 0) return 'Registration has lapsed'
  if (days === 0) return 'Registration lapses today'
  if (days === 1) return 'Registration lapses tomorrow'
  if (days <= 30) return `Registration lapses in ${days} days`
  return `Registered through ${new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`
}

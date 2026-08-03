'use client'

import { useEffect, useState } from 'react'
import { VERDICT_COPY, canRegister, type RegistrationVerdict } from '@/lib/sales'
import { registerProspect } from '@/app/(sales)/sales/actions'

/**
 * Register a prospect (specs/keystone-sales.md, Ring 1). The form that
 * creates the timestamp, and the one place the house-account check runs
 * live: the org name is checked as it is typed, so a collision shows up
 * before any time is spent on the org.
 *
 * The check here is a courtesy. The wall is the insert trigger in
 * migration 0044, which refuses the same three collisions whatever path
 * the write arrives by, so a form bug can never let one through.
 */
export function SalesRegisterForm() {
  const [org, setOrg] = useState('')
  const [verdict, setVerdict] = useState<RegistrationVerdict | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    const name = org.trim()
    if (name.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      if (cancelled) return
      setChecking(true)
      try {
        const res = await fetch('/sales/check', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ org: name }),
        })
        const body = (await res.json()) as { verdict?: RegistrationVerdict }
        if (!cancelled) setVerdict(body.verdict ?? null)
      } catch {
        // A failed check never blocks the form: the database has the
        // final say either way, and it is honest about not knowing.
        if (!cancelled) setVerdict(null)
      } finally {
        if (!cancelled) setChecking(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [org])

  // Clearing on a too-short name happens here, not in the effect: an
  // effect body that calls setState synchronously cascades renders.
  const onOrgChange = (value: string) => {
    setOrg(value)
    if (value.trim().length < 2) {
      setVerdict(null)
      setChecking(false)
    }
  }

  const blocked = verdict !== null && !canRegister(verdict)

  return (
    <form action={registerProspect} className="mt-3 flex flex-col gap-3">
      <div>
        <label htmlFor="orgName" className="eyebrow">
          Organization
        </label>
        <input
          id="orgName"
          name="orgName"
          required
          maxLength={200}
          value={org}
          onChange={(e) => onOrgChange(e.target.value)}
          placeholder="The organization you are registering"
          className="mt-1 w-full rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
        />
        <p role="status" aria-live="polite" className="mt-1.5 min-h-5 text-xs">
          {checking ? (
            <span className="text-ink-dim">Checking the name.</span>
          ) : verdict ? (
            <span className={blocked ? 'text-brass' : 'text-ink-dim'}>{VERDICT_COPY[verdict]}</span>
          ) : null}
        </p>
      </div>

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
      <input
        name="source"
        maxLength={200}
        placeholder="Where this came from (optional)"
        className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
      />
      <textarea
        name="note"
        rows={2}
        maxLength={4000}
        placeholder="Context, in a line or two (optional)"
        className="rounded-lg border border-ink/15 bg-paper-raised p-2 text-sm text-ink"
      />
      <button
        type="submit"
        disabled={blocked}
        className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Register this prospect
      </button>
      <p className="text-xs text-ink-dim">
        Registering stamps the date and puts your name on it. That timestamp is what makes the
        prospect yours under the agreement, so register before you make the first call, not after.
      </p>
    </form>
  )
}

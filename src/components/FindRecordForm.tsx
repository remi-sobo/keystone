'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'

/**
 * The find box (V2 engagement search): exact words, grouped results,
 * no model. Shared by /ask (client) and the engagement page
 * (practice); the server action supplies each hit's href for its
 * surface.
 */

export interface FindHit {
  kind: string
  label: string
  snippet: string
  href: string
}

export type FindResult = { ok: true; hits: FindHit[] } | { ok: false; error: string }

export default function FindRecordForm({
  find,
}: {
  find: (term: string) => Promise<FindResult>
}) {
  const [result, setResult] = useState<FindResult | null>(null)
  const [searched, setSearched] = useState('')
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    const term = String(formData.get('term') ?? '').trim()
    if (term.length < 2) return
    startTransition(async () => {
      setSearched(term)
      setResult(await find(term))
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={submit} className="flex flex-wrap items-end gap-2">
        <input
          name="term"
          required
          minLength={2}
          maxLength={100}
          placeholder="Find exact words in the record"
          className="min-w-[240px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg border border-forest px-4 py-2 text-sm font-medium text-forest transition-colors duration-200 hover:bg-forest hover:text-paper active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Looking' : 'Find'}
        </button>
      </form>
      {result ? (
        result.ok ? (
          result.hits.length === 0 ? (
            <p className="text-sm text-ink-dim">
              Nothing in the record contains &quot;{searched}&quot;.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {result.hits.map((h, i) => (
                <li
                  key={`${h.kind}-${i}`}
                  className="rounded-lg border border-ink/10 bg-paper-raised px-3 py-2"
                >
                  <Link href={h.href} className="text-sm text-forest underline">
                    {h.label}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-dim">{h.snippet}</p>
                </li>
              ))}
            </ul>
          )
        ) : (
          <p role="status" className="text-sm text-ink-dim">
            That search did not run. Try again.
          </p>
        )
      ) : null}
    </div>
  )
}

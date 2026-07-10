'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'

/**
 * The Q&A input (V2 2E), shared by /ask (client) and the engagement
 * page (practice). The server action does everything real; this form
 * renders the question, the answer, its sources as links into the
 * record's surfaces, and honest failure states.
 */

export type AskResult =
  | { ok: true; answer: string; grounded: boolean; sources: Array<{ label: string; href: string }> }
  | { ok: false; error: string }

const ERRORS: Record<string, string> = {
  slow: 'A few questions at a time. Wait a minute and ask again.',
  budget: 'The month’s AI budget is spent; answers return next month.',
  unavailable: 'The answer engine is not configured yet. Ask your consultant directly.',
  failed: 'That did not come back cleanly. Try asking again.',
  invalid: 'Ask in a sentence or two, up to 500 characters.',
}

export default function AskRecordForm({
  ask,
}: {
  ask: (question: string) => Promise<AskResult>
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [result, setResult] = useState<AskResult | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    const question = String(formData.get('question') ?? '').trim()
    if (!question) return
    startTransition(async () => {
      setResult(await ask(question))
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={submit} className="flex flex-wrap items-end gap-2">
        <input
          name="question"
          required
          maxLength={500}
          placeholder="Ask about this engagement"
          className="min-w-[240px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Reading the record' : 'Ask'}
        </button>
      </form>
      <p className="text-xs text-ink-dim">
        Answers come only from this engagement&apos;s record and cite their sources.
      </p>
      {result ? (
        result.ok ? (
          <div className="rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-4">
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{result.answer}</p>
            {result.sources.length > 0 ? (
              <p className="mt-2 text-xs text-ink-dim">
                Sources:{' '}
                {result.sources.map((s, i) => (
                  <span key={`${s.label}-${i}`}>
                    {i > 0 ? ', ' : ''}
                    <Link href={s.href} className="text-forest underline">
                      {s.label}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : (
          <p role="status" className="text-sm text-ink-dim">
            {ERRORS[result.error] ?? ERRORS.failed}
          </p>
        )
      ) : null}
    </div>
  )
}

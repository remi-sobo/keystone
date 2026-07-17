'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageCircleQuestion, X, ArrowUp } from 'lucide-react'
import { askQuestion } from '@/app/(client)/ask/actions'
import { reportIssue, type ReportKind } from '@/app/(client)/report/actions'
import type { AskResult } from '@/components/AskRecordForm'

/**
 * The help FAB (specs/keystone-v2-help-fab.md): one floating button on
 * every client room that opens a small window with two tabs, a Coach
 * (the 2E Q&A path unchanged, grounded and cited) and Report an issue
 * (the new pure-RLS report). The first modal primitive in the codebase,
 * so it holds to the frozen tokens and the one easing: a paper-raised
 * panel, forest primary, a brass tick on the active tab. It sits above
 * the 390px bottom tab bar and its z-index; Escape and the scrim close
 * it; focus lands in the panel on open.
 */

type Tab = 'coach' | 'report'

type CoachTurn = { question: string; result: AskResult }

const COACH_ERRORS: Record<string, string> = {
  slow: 'A few questions at a time. Wait a minute and ask again.',
  budget: 'The month’s AI budget is spent; answers return next month.',
  unavailable: 'The answer engine is not configured yet. Ask your consultant directly.',
  failed: 'That did not come back cleanly. Try asking again.',
  invalid: 'Ask in a sentence or two, up to 500 characters.',
}

const REPORT_ERRORS: Record<string, string> = {
  invalid: 'Add a sentence or two about what happened.',
  slow: 'A few reports at a time. Wait a minute and try again.',
  no_engagement: 'There is no active engagement to report against yet.',
  error: 'That did not send. Try again in a moment.',
}

const KINDS: Array<{ value: ReportKind; label: string; hint: string }> = [
  { value: 'bug', label: 'Broken', hint: 'Something is not working' },
  { value: 'confusing', label: 'Confusing', hint: 'Something is unclear' },
  { value: 'idea', label: 'Idea', hint: 'Something could be better' },
]

export default function HelpFab() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('coach')
  const panelRef = useRef<HTMLDivElement>(null)

  // Close on Escape while open; focus the panel on open.
  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* The scrim: a quiet click-away, only while open. */}
      {open ? (
        <button
          type="button"
          aria-label="Close help"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-ink/20 md:bg-transparent"
        />
      ) : null}

      {/* The window, anchored above the button. */}
      {open ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Help and coach"
          className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-h-[72vh] max-w-[380px] flex-col overflow-hidden rounded-[var(--radius)] border border-ink/10 bg-paper-raised shadow-[var(--shadow-soft)] outline-none md:inset-x-auto md:right-6 md:bottom-24"
        >
          <header className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <div className="flex gap-4" role="tablist" aria-label="Help">
              {(['coach', 'report'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`relative pb-1 text-sm transition-colors duration-200 ${
                    tab === t ? 'font-medium text-forest' : 'text-ink-dim hover:text-ink'
                  }`}
                >
                  {tab === t ? (
                    <span aria-hidden className="absolute inset-x-0 -bottom-[13px] h-[3px] bg-brass" />
                  ) : null}
                  {t === 'coach' ? 'Coach' : 'Report an issue'}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-ink-dim transition-colors duration-200 hover:text-ink active:scale-[0.98]"
            >
              <X size={18} strokeWidth={1.75} aria-hidden />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {tab === 'coach' ? <CoachPanel /> : <ReportPanel />}
          </div>
        </div>
      ) : null}

      {/* The button itself: above the mobile tab bar and its z-40. */}
      <button
        type="button"
        aria-label={open ? 'Close help' : 'Open help and coach'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-forest text-paper shadow-[var(--shadow-soft)] transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98] md:bottom-6 md:right-6"
      >
        {open ? (
          <X size={22} strokeWidth={1.75} aria-hidden />
        ) : (
          <MessageCircleQuestion size={24} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </>
  )
}

function CoachPanel() {
  const [turns, setTurns] = useState<CoachTurn[]>([])
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, pending])

  function submit(formData: FormData) {
    const question = String(formData.get('question') ?? '').trim()
    if (!question) return
    inputRef.current?.form?.reset()
    startTransition(async () => {
      const result = await askQuestion(question)
      setTurns((prev) => [...prev, { question, result }])
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-dim">
        Ask where the engagement stands. Answers come only from this engagement&apos;s record
        and cite their sources.
      </p>

      {turns.length === 0 && !pending ? (
        <p className="text-sm text-ink-dim">
          Try &ldquo;What is due from us next?&rdquo; or &ldquo;What did we decide about the
          board?&rdquo;
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-ink">{turn.question}</p>
            {turn.result.ok ? (
              <div className="rounded-[var(--radius)] border border-ink/10 bg-paper p-3">
                <p className="whitespace-pre-line text-sm leading-relaxed text-ink">
                  {turn.result.answer}
                </p>
                {turn.result.sources.length > 0 ? (
                  <p className="mt-2 text-xs text-ink-dim">
                    Sources:{' '}
                    {turn.result.sources.map((s, j) => (
                      <span key={`${s.label}-${j}`}>
                        {j > 0 ? ', ' : ''}
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
                {COACH_ERRORS[turn.result.error] ?? COACH_ERRORS.failed}
              </p>
            )}
          </div>
        ))}
        {pending ? <p className="text-sm text-ink-dim">Reading the record</p> : null}
        <div ref={endRef} />
      </div>

      <form action={submit} className="sticky bottom-0 flex items-end gap-2 bg-paper-raised pt-1">
        <input
          ref={inputRef}
          name="question"
          required
          maxLength={500}
          placeholder="Ask about this engagement"
          className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={pending}
          aria-label="Ask"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-forest text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98] disabled:opacity-60"
        >
          <ArrowUp size={18} strokeWidth={2} aria-hidden />
        </button>
      </form>
    </div>
  )
}

function ReportPanel() {
  const [kind, setKind] = useState<ReportKind>('bug')
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState<null | { emailed: boolean }>(null)
  const [error, setError] = useState<string | null>(null)

  function submit(formData: FormData) {
    const text = String(formData.get('body') ?? '').trim()
    if (!text) {
      setError('invalid')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await reportIssue({ kind, body: text })
      if (result.ok) {
        setDone({ emailed: result.emailed })
        setBody('')
      } else {
        setError(result.error)
      }
    })
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink">
          {done.emailed
            ? 'Sent. Your consultant has it.'
            : 'Filed. We could not send the email just now, but your consultant will see it.'}
        </p>
        <button
          type="button"
          onClick={() => {
            setDone(null)
            setKind('bug')
          }}
          className="self-start rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink transition-colors duration-200 hover:bg-paper-deep active:scale-[0.98]"
        >
          Report another
        </button>
      </div>
    )
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <p className="text-xs text-ink-dim">
        Tell your consultant what you ran into. It goes straight to them.
      </p>

      <div className="flex gap-2" role="radiogroup" aria-label="What kind of report">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            title={k.hint}
            onClick={() => setKind(k.value)}
            className={`flex-1 rounded-lg border px-2 py-2 text-sm transition-colors duration-200 active:scale-[0.98] ${
              kind === k.value
                ? 'border-forest bg-paper font-medium text-forest'
                : 'border-ink/15 text-ink-dim hover:text-ink'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <textarea
        name="body"
        required
        rows={4}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What happened, and where?"
        className="w-full rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
      />

      {error ? (
        <p role="status" className="text-sm text-ink-dim">
          {REPORT_ERRORS[error] ?? REPORT_ERRORS.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? 'Sending' : 'Send to your consultant'}
      </button>
    </form>
  )
}

'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { MessageCircleQuestion, X } from 'lucide-react'
import { reportPracticeIssue, type ReportKind } from '@/app/(practice)/report/actions'

/**
 * The practice-side report button (specs/keystone-v2-help-fab.md,
 * owner-only follow-up). A consultant or the owner files a system issue
 * that comes to the owner. Report only: there is no single engagement on
 * the practice side, so no Coach tab (that stays on the client surface).
 * The report cannot be read back here (issue.read is the owner's alone);
 * the owner reads them on /issues. Same window vocabulary as the client
 * HelpFab: a forest button above the bottom tab bar, a paper-raised
 * panel on the frozen tokens, Escape and scrim to close.
 */

const REPORT_ERRORS: Record<string, string> = {
  invalid: 'Add a sentence or two about what happened.',
  slow: 'A few reports at a time. Wait a minute and try again.',
  error: 'That did not send. Try again in a moment.',
}

const KINDS: Array<{ value: ReportKind; label: string; hint: string }> = [
  { value: 'bug', label: 'Broken', hint: 'Something is not working' },
  { value: 'confusing', label: 'Confusing', hint: 'Something is unclear' },
  { value: 'idea', label: 'Idea', hint: 'Something could be better' },
]

export default function PracticeReportFab() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

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
      {open ? (
        <button
          type="button"
          aria-label="Close report"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-ink/20 md:bg-transparent"
        />
      ) : null}

      {open ? (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Report an issue"
          className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-h-[72vh] max-w-[380px] flex-col overflow-hidden rounded-[var(--radius)] border border-ink/10 bg-paper-raised shadow-[var(--shadow-soft)] outline-none md:inset-x-auto md:right-6 md:bottom-24"
        >
          <header className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
            <span className="text-sm font-medium text-forest">Report an issue</span>
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
            <ReportForm onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        aria-label={open ? 'Close report' : 'Report an issue'}
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

function ReportForm({ onClose }: { onClose: () => void }) {
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
      const result = await reportPracticeIssue({ kind, body: text })
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
            ? 'Sent. It is on the Reported issues screen and in the owner’s inbox.'
            : 'Filed. It is on the Reported issues screen; the email will send once Resend is connected.'}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDone(null)
              setKind('bug')
            }}
            className="rounded-lg border border-ink/15 px-3 py-1.5 text-sm text-ink transition-colors duration-200 hover:bg-paper-deep active:scale-[0.98]"
          >
            Report another
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-dim transition-colors duration-200 hover:text-ink active:scale-[0.98]"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <form action={submit} className="flex flex-col gap-3">
      <p className="text-xs text-ink-dim">
        File a system issue. It goes to the owner; only the owner sees the list.
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
        {pending ? 'Sending' : 'Send to the owner'}
      </button>
    </form>
  )
}

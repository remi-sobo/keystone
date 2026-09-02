'use client'

import { useActionState } from 'react'
import type { DraftState } from '@/app/(hub)/[orgSlug]/people/draft-actions'

/**
 * The draft box: a button, then a plain readable draft in a textarea
 * Kendra copies and edits herself. Render-only by design; nothing
 * here sends anything, and a failed guardrail shows its honest
 * message instead of a patched draft.
 */
export default function ThankYouDraft({
  donorId,
  action,
}: {
  donorId: string
  action: (prev: DraftState, formData: FormData) => Promise<DraftState>
}) {
  const [state, formAction, pending] = useActionState<DraftState, FormData>(action, {
    status: 'idle',
  })

  return (
    <div style={{ marginTop: 12, maxWidth: 640 }}>
      <form action={formAction}>
        <input type="hidden" name="donor_id" value={donorId} />
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: '10px 16px',
            background: 'transparent',
            color: 'var(--hub-gold-ink)',
            border: '1px solid var(--hub-line-on-paper)',
            fontFamily: 'var(--hub-font-detail)',
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            cursor: pending ? 'wait' : 'pointer',
          }}
        >
          {pending ? 'Drafting' : 'Draft a thank-you to copy'}
        </button>
      </form>
      {state.status === 'error' && state.message ? (
        <p style={{ fontSize: 13, color: 'var(--hub-terracotta)', marginTop: 8 }}>{state.message}</p>
      ) : null}
      {state.status === 'ok' && state.draft ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            readOnly
            value={state.draft}
            rows={Math.min(12, state.draft.split('\n').length + 3)}
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'var(--hub-paper-raised)',
              border: '1px solid var(--hub-line-on-paper)',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--hub-acid-black)',
            }}
          />
          <p
            style={{
              fontFamily: 'var(--hub-font-detail)',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--hub-stone-ink)',
              marginTop: 6,
            }}
          >
            A draft to copy and make yours. Nothing sends from here.
          </p>
        </div>
      ) : null}
    </div>
  )
}

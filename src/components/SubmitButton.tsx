'use client'

import { useFormStatus } from 'react-dom'

/**
 * The submit control for the message composers. useFormStatus reads the
 * surrounding form's pending state, so the button disables the moment a
 * send is in flight and the label says so out loud. The render-minted
 * message id in the form is the correctness layer underneath; this is
 * the visible half that stops the extra clicks from happening at all.
 * A client island by necessity (pending state is client state); the
 * pages that use it stay server components.
 */
export function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 select-none rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 [touch-action:manipulation] hover:bg-forest-deep active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

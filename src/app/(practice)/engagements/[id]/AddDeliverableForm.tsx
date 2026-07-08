'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createDeliverable, prepareDeliverableUpload } from './actions'

/**
 * Ship a deliverable (Ring 4). Files go direct-to-storage on a signed
 * upload URL minted server-side after the membership check; the row is
 * recorded only after the object actually landed. Errors are honest:
 * nothing pretends to have shipped.
 */

export default function AddDeliverableForm({
  engagementId,
  workstreams,
}: {
  engagementId: string
  workstreams: Array<{ id: string; title: string }>
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [kind, setKind] = useState<'file' | 'link'>('file')
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    startTransition(async () => {
      setStatus(null)
      const title = String(formData.get('title') ?? '').trim()
      const workstreamId = String(formData.get('workstreamId') ?? '')
      const note = String(formData.get('note') ?? '').trim()
      const deliveredOn = String(formData.get('deliveredOn') ?? '')
      if (!title) {
        setStatus('Give it a title.')
        return
      }

      let storagePath: string | undefined
      let url: string | undefined

      if (kind === 'file') {
        const file = formData.get('file') as File | null
        if (!file || file.size === 0) {
          setStatus('Pick a file.')
          return
        }
        const minted = await prepareDeliverableUpload(engagementId, file.name)
        if ('error' in minted) {
          setStatus('Could not start the upload. Try again.')
          return
        }
        const { error } = await supabase.storage
          .from('deliverables')
          .uploadToSignedUrl(minted.path, minted.token, file)
        if (error) {
          setStatus('The upload did not finish. Nothing was recorded; try again.')
          return
        }
        storagePath = minted.path
      } else {
        url = String(formData.get('url') ?? '').trim()
        if (!url) {
          setStatus('Paste the link.')
          return
        }
      }

      const result = await createDeliverable({
        engagementId,
        title,
        kind,
        url,
        storagePath,
        note: note || undefined,
        workstreamId: workstreamId || undefined,
        deliveredOn: /^\d{4}-\d{2}-\d{2}$/.test(deliveredOn) ? deliveredOn : undefined,
      })
      if ('error' in result) {
        setStatus(
          result.error === 'invalid'
            ? 'That did not validate. Check the link and try again.'
            : 'That did not save. Try again.'
        )
        return
      }
      formRef.current?.reset()
      setStatus('Shipped.')
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={submit} className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <input
          name="title"
          placeholder="What shipped"
          className="min-w-[200px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
        />
        <select
          name="workstreamId"
          defaultValue=""
          className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
        >
          <option value="">No workstream</option>
          {workstreams.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title}
            </option>
          ))}
        </select>
        <input
          name="deliveredOn"
          type="date"
          className="rounded-lg border border-ink/15 bg-paper px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="kindPick"
            checked={kind === 'file'}
            onChange={() => setKind('file')}
          />
          File
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            name="kindPick"
            checked={kind === 'link'}
            onChange={() => setKind('link')}
          />
          Link
        </label>
        {kind === 'file' ? (
          <input name="file" type="file" className="text-sm text-ink-dim" />
        ) : (
          <input
            name="url"
            type="url"
            placeholder="https://"
            className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
          />
        )}
      </div>

      <input
        name="note"
        placeholder="One line of context (optional)"
        className="rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Shipping' : 'Ship it'}
        </button>
        {status ? (
          <p role="status" className="text-sm text-ink-dim">
            {status}
          </p>
        ) : null}
      </div>
    </form>
  )
}

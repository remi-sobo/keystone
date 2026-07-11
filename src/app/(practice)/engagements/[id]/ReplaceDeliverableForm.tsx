'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { prepareDeliverableUpload, replaceDeliverableFile } from './actions'

/**
 * Replace a FILE deliverable (V2 3D). Signed upload direct-to-storage
 * as always; the outgoing object becomes an append-only version row
 * before the pointer moves, so nothing is ever lost or deleted.
 */
export default function ReplaceDeliverableForm({
  deliverableId,
  engagementId,
}: {
  deliverableId: string
  engagementId: string
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    startTransition(async () => {
      setStatus(null)
      const file = formData.get('file') as File | null
      if (!file || file.size === 0) {
        setStatus('Pick the new file.')
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
        setStatus('The upload did not finish. Nothing changed; try again.')
        return
      }
      const result = await replaceDeliverableFile(deliverableId, engagementId, minted.path)
      if ('error' in result) {
        setStatus('That did not save. The old file still stands.')
        return
      }
      formRef.current?.reset()
      setStatus('Replaced. The old file is kept as a version.')
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-wrap items-center gap-2">
      <input name="file" type="file" className="text-xs text-ink-dim" />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-ink/15 px-2 py-1 text-xs text-ink transition-colors duration-200 hover:border-ink/30 active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? 'Uploading' : 'Replace the file'}
      </button>
      {status ? (
        <span role="status" className="text-xs text-ink-dim">
          {status}
        </span>
      ) : null}
    </form>
  )
}

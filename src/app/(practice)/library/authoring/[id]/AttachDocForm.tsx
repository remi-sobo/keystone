'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { attachResourceFile, prepareResourceUpload } from '../actions'

/**
 * Attach a document (PDF or Word) to a library resource. Signed upload
 * direct-to-storage after the membership check; the row points at the
 * object only once it landed. Replacing removes the old object.
 */

const MAX_BYTES = 20 * 1024 * 1024

export default function AttachDocForm({ resourceId }: { resourceId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    startTransition(async () => {
      setStatus(null)
      const file = formData.get('file') as File | null
      if (!file || file.size === 0) {
        setStatus('Pick the file.')
        return
      }
      if (!/\.(pdf|doc|docx)$/i.test(file.name)) {
        setStatus('PDF or Word here (.pdf, .doc, .docx).')
        return
      }
      if (file.size > MAX_BYTES) {
        setStatus('That file is larger than 20MB.')
        return
      }
      const minted = await prepareResourceUpload(resourceId, file.name)
      if ('error' in minted) {
        setStatus('Could not start the upload. Try again.')
        return
      }
      const { error } = await supabase.storage
        .from('resources')
        .uploadToSignedUrl(minted.path, minted.token, file)
      if (error) {
        setStatus('The upload did not finish. Nothing was recorded; try again.')
        return
      }
      const result = await attachResourceFile(resourceId, minted.path)
      if ('error' in result) {
        setStatus('That did not save. Try again.')
        return
      }
      formRef.current?.reset()
      setStatus('Attached. Clients see it on the resource now.')
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={submit} className="flex flex-wrap items-center gap-3">
      <input name="file" type="file" accept=".pdf,.doc,.docx" className="text-sm text-ink-dim" />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? 'Uploading' : 'Attach document'}
      </button>
      {status ? (
        <p role="status" className="text-sm text-ink-dim">
          {status}
        </p>
      ) : null}
    </form>
  )
}

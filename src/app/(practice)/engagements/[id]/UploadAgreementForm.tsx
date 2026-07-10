'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { createEngagementDocument, prepareDocumentUpload } from './actions'

/**
 * Upload a formal document PDF (the agreement). Same contract as
 * deliverable files: direct-to-storage on a signed upload URL minted
 * server-side after the membership check, the row recorded only after
 * the object landed, honest errors throughout. Nothing reaches the
 * client unless "share now" is checked.
 */

const MAX_BYTES = 20 * 1024 * 1024

export default function UploadAgreementForm({ engagementId }: { engagementId: string }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    startTransition(async () => {
      setStatus(null)
      const title = String(formData.get('title') ?? '').trim()
      const signed = formData.get('signed') === 'on'
      const shared = formData.get('shared') === 'on'
      const file = formData.get('file') as File | null

      if (!title) {
        setStatus('Give it a title.')
        return
      }
      if (!file || file.size === 0) {
        setStatus('Pick the PDF.')
        return
      }
      if (file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name)) {
        setStatus('PDFs only here.')
        return
      }
      if (file.size > MAX_BYTES) {
        setStatus('That file is larger than 20MB.')
        return
      }

      const minted = await prepareDocumentUpload(engagementId, file.name)
      if ('error' in minted) {
        setStatus(
          minted.error === 'pdf_only'
            ? 'PDFs only here.'
            : 'Could not start the upload. Try again.'
        )
        return
      }
      const { error } = await supabase.storage
        .from('engagement-documents')
        .uploadToSignedUrl(minted.path, minted.token, file)
      if (error) {
        setStatus('The upload did not finish. Nothing was recorded; try again.')
        return
      }

      const result = await createEngagementDocument({
        engagementId,
        title,
        storagePath: minted.path,
        fileName: file.name,
        fileSize: file.size,
        status: signed ? 'signed' : 'uploaded',
        visibleToClient: shared,
      })
      if ('error' in result) {
        setStatus('That did not save. Nothing was recorded; try again.')
        return
      }
      formRef.current?.reset()
      setStatus(shared ? 'Uploaded and shared with the client.' : 'Uploaded. Not shared yet.')
      router.refresh()
    })
  }

  return (
    <form ref={formRef} action={submit} className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <input
          name="title"
          defaultValue="Consulting services agreement"
          className="min-w-[220px] flex-1 rounded-lg border border-ink/15 bg-paper p-2 text-sm text-ink"
        />
        <input name="file" type="file" accept="application/pdf" className="text-sm text-ink-dim" />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-ink">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="signed" defaultChecked className="h-4 w-4" />
          Executed, signed copy
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="shared" className="h-4 w-4" />
          Share with the client now
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? 'Uploading' : 'Upload'}
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

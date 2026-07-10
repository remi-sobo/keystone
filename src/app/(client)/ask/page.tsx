import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import AskRecordForm from '@/components/AskRecordForm'
import { askQuestion } from './actions'

/**
 * Ask (V2 2E): questions answered only from this engagement's record,
 * with sources. The permission wall is the session that builds the
 * corpus; the honest refusal covers everything the record does not
 * say.
 */
export default async function AskPage() {
  const viewer = await getViewer()
  if (!viewer.user || !viewer.client) redirect('/login')

  return (
    <RoomShell eyebrow={viewer.client.clientName} title="Ask" maxWidth="max-w-3xl">
      <p className="text-sm text-ink-dim">
        Ask anything about this engagement: what was decided, where a workstream stands, what
        is due. Answers come from the record you can already read, nothing else.
      </p>
      <div className="mt-6">
        <AskRecordForm ask={askQuestion} />
      </div>
    </RoomShell>
  )
}

import { redirect } from 'next/navigation'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import AskRecordForm from '@/components/AskRecordForm'
import FindRecordForm from '@/components/FindRecordForm'
import { askQuestion, findInRecord } from './actions'

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
    <RoomShell eyebrow={viewer.client.clientName} title="Ask or find" maxWidth="max-w-3xl">
      <section>
        <h2 className="font-display text-2xl font-medium text-ink">Find exact words</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Plain search across everything you can read here: the charter, decisions, notes,
          outcomes, homework, deliverables, and your messages.
        </p>
        <div className="mt-4">
          <FindRecordForm find={findInRecord} />
        </div>
      </section>
      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Ask a question</h2>
        <p className="mt-1 text-sm text-ink-dim">
          What was decided, where a workstream stands, what is due. Answers come from the
          record you can already read, nothing else.
        </p>
        <div className="mt-4">
          <AskRecordForm ask={askQuestion} />
        </div>
      </section>
    </RoomShell>
  )
}

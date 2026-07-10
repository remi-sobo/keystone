import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { getViewer } from '@/lib/membership'
import { RoomShell } from '@/components/RoomShell'
import { KeystoneCard } from '@/components/KeystoneCard'
import {
  addInvite,
  addWorkstream,
  discardDraft,
  moveWorkstream,
  publishDraft,
  removeInvite,
  removeWorkstream,
  restoreDraft,
  saveBasics,
  saveCadence,
  saveClient,
  saveNotes,
  updateWorkstream,
  type DraftShape,
} from '../actions'

/**
 * The Engagement Builder (V2 1B). A resumable draft, sections not
 * steps: each section saves on its own, the draft tolerates holes,
 * and full validation happens only at publish. Invisible to every
 * client member by construction (engagement_drafts carries no
 * client-facing policy).
 */

const DEFAULT_STAGES = ['diagnose', 'design', 'build', 'train', 'stabilize']

const NOTES: Record<string, string> = {
  saved: 'Saved.',
  invalid: 'That did not parse. Check the values.',
  error: 'That could not be saved. Try again.',
  too_many: 'That list is at its cap.',
  not_editable: 'This draft is no longer editable.',
  needs_client: 'Pick the client before publishing.',
  needs_title: 'Give the engagement its real title before publishing.',
  needs_workstreams: 'Add at least one workstream before publishing.',
  client_owner_only: 'Adding a brand-new client is an owner move. Pick an existing one, or ask the owner.',
  published_sendfail:
    'Published. Some invite emails did not go out; resend them from Members and access.',
}

const inputCls = 'rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm'
const buttonCls =
  'rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper transition-colors duration-200 hover:bg-forest-deep active:scale-[0.98]'
const linkBtnCls = 'text-sm text-ink-dim underline hover:text-ink'

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="eyebrow">{children}</span>
}

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ note?: string }>
}) {
  const { id } = await params
  const { note } = await searchParams
  const viewer = await getViewer()
  if (!viewer.user || !viewer.practice) redirect('/login')

  const supabase = await createServerSupabase()
  const [{ data: draft }, { data: clients }, { data: practice }] = await Promise.all([
    supabase
      .from('engagement_drafts')
      .select('id, client_id, title, shape, status, published_engagement_id, updated_at')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('practices').select('stage_config').limit(1).maybeSingle(),
  ])
  if (!draft) redirect('/engagements')

  const stages =
    Array.isArray(practice?.stage_config) && practice.stage_config.length > 0
      ? (practice.stage_config as string[])
      : DEFAULT_STAGES
  const shape = (draft.shape ?? {}) as DraftShape
  const workstreams = shape.workstreams ?? []
  const invites = shape.invites ?? []
  const clientName = (clients ?? []).find((c) => c.id === draft.client_id)?.name

  if (draft.status !== 'draft') {
    return (
      <RoomShell eyebrow="Engagements" title={draft.title} maxWidth="max-w-3xl">
        {draft.status === 'published' ? (
          <KeystoneCard>
            <p className="text-sm text-ink">
              Published{clientName ? ` for ${clientName}` : ''}. This draft stays as the record
              of what was scoped.
            </p>
            {note && NOTES[note] ? <p className="mt-2 text-sm text-ink-dim">{NOTES[note]}</p> : null}
            {draft.published_engagement_id ? (
              <p className="mt-3">
                <Link
                  href={`/engagements/${draft.published_engagement_id}`}
                  className="text-sm text-ink underline hover:text-ink-dim"
                >
                  Open the engagement
                </Link>
              </p>
            ) : null}
          </KeystoneCard>
        ) : (
          <KeystoneCard>
            <p className="text-sm text-ink">Discarded. The record stays.</p>
            <form action={restoreDraft} className="mt-3">
              <input type="hidden" name="draftId" value={draft.id} />
              <button type="submit" className={linkBtnCls}>
                Restore and keep drafting
              </button>
            </form>
          </KeystoneCard>
        )}
      </RoomShell>
    )
  }

  return (
    <RoomShell eyebrow="Engagements / draft" title={draft.title} maxWidth="max-w-3xl">
      <p className="text-sm text-ink-dim">
        A draft, invisible to the client until you publish. Every section saves on its own;
        leave and come back whenever.
      </p>
      {note && NOTES[note] ? (
        <p role="status" className="mt-3 text-sm text-ink">
          {NOTES[note]}
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="font-display text-2xl font-medium text-ink">Client</h2>
        <form action={saveClient} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="draftId" value={draft.id} />
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <Eyebrow>Existing client</Eyebrow>
            <select name="clientId" defaultValue={draft.client_id ?? ''} className={inputCls}>
              <option value="">Choose</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <Eyebrow>Or a new one (owner only)</Eyebrow>
            <input name="newClientName" maxLength={120} className={inputCls} />
          </label>
          <button type="submit" className={buttonCls}>
            Save client
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Basics</h2>
        <form action={saveBasics} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="draftId" value={draft.id} />
          <label className="flex min-w-[240px] flex-[2] flex-col gap-1">
            <Eyebrow>Title (client-facing)</Eyebrow>
            <input name="title" defaultValue={draft.title} required maxLength={160} className={inputCls} />
          </label>
          <label className="flex min-w-[150px] flex-1 flex-col gap-1">
            <Eyebrow>Starts</Eyebrow>
            <input name="startsOn" type="date" defaultValue={shape.starts_on ?? ''} className={inputCls} />
          </label>
          <label className="flex min-w-[110px] flex-col gap-1">
            <Eyebrow>Months</Eyebrow>
            <input
              name="lengthMonths"
              type="number"
              min={1}
              max={24}
              defaultValue={shape.length_months ?? 6}
              className={inputCls}
            />
          </label>
          <label className="flex min-w-[200px] flex-1 flex-col gap-1">
            <Eyebrow>Fee line (charter only)</Eyebrow>
            <input
              name="feeDisplay"
              defaultValue={shape.fee_display ?? ''}
              maxLength={120}
              className={inputCls}
            />
          </label>
          <button type="submit" className={buttonCls}>
            Save basics
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Workstreams</h2>
        <p className="mt-1 text-sm text-ink-dim">
          The client sees these names from first login; keep the exact language of the proposal.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {workstreams.map((w, i) => (
            <li
              key={`${i}-${w.title}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
            >
              <form action={updateWorkstream} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="draftId" value={draft.id} />
                <input type="hidden" name="index" value={i} />
                <input
                  name="title"
                  defaultValue={w.title}
                  maxLength={120}
                  className={`${inputCls} min-w-[180px] flex-1`}
                />
                <select name="stage" defaultValue={w.stage} className={inputCls}>
                  {stages.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button type="submit" className={linkBtnCls}>
                  Save
                </button>
              </form>
              <span className="flex items-center gap-2">
                <form action={moveWorkstream}>
                  <input type="hidden" name="draftId" value={draft.id} />
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="dir" value="up" />
                  <button type="submit" aria-label="Move up" className={linkBtnCls}>
                    Up
                  </button>
                </form>
                <form action={moveWorkstream}>
                  <input type="hidden" name="draftId" value={draft.id} />
                  <input type="hidden" name="index" value={i} />
                  <input type="hidden" name="dir" value="down" />
                  <button type="submit" aria-label="Move down" className={linkBtnCls}>
                    Down
                  </button>
                </form>
                <form action={removeWorkstream}>
                  <input type="hidden" name="draftId" value={draft.id} />
                  <input type="hidden" name="index" value={i} />
                  <button type="submit" className={linkBtnCls}>
                    Remove
                  </button>
                </form>
              </span>
            </li>
          ))}
          {workstreams.length === 0 ? (
            <li className="text-sm text-ink-dim">None yet. An engagement needs at least one.</li>
          ) : null}
        </ul>
        <form action={addWorkstream} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="draftId" value={draft.id} />
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <Eyebrow>Workstream</Eyebrow>
            <input name="title" required maxLength={120} className={inputCls} />
          </label>
          <label className="flex min-w-[140px] flex-col gap-1">
            <Eyebrow>Starting stage</Eyebrow>
            <select name="stage" defaultValue="diagnose" className={inputCls}>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonCls}>
            Add
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Cadence</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Plain words the humans honor; scheduling machinery stays in availability windows.
        </p>
        <form action={saveCadence} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="draftId" value={draft.id} />
          <textarea
            name="cadence"
            rows={2}
            maxLength={2000}
            defaultValue={shape.cadence_md ?? ''}
            placeholder="Twice weekly in month one, then set month by month."
            className={inputCls}
          />
          <div>
            <button type="submit" className={buttonCls}>
              Save cadence
            </button>
          </div>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">People to invite</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Rows are created at publish; nothing sends while drafting.
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {invites.map((email) => (
            <li
              key={email}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink/10 bg-paper-raised px-4 py-2.5"
            >
              <span className="min-w-0 truncate text-sm text-ink">{email}</span>
              <form action={removeInvite}>
                <input type="hidden" name="draftId" value={draft.id} />
                <input type="hidden" name="email" value={email} />
                <button type="submit" className={linkBtnCls}>
                  Remove
                </button>
              </form>
            </li>
          ))}
          {invites.length === 0 ? (
            <li className="text-sm text-ink-dim">Nobody yet. Emails can also wait for Members and access.</li>
          ) : null}
        </ul>
        <form action={addInvite} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="draftId" value={draft.id} />
          <label className="flex min-w-[220px] flex-1 flex-col gap-1">
            <Eyebrow>Email</Eyebrow>
            <input name="email" type="email" required className={inputCls} />
          </label>
          <button type="submit" className={buttonCls}>
            Add
          </button>
        </form>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-medium text-ink">Private scoping notes</h2>
        <p className="mt-1 text-sm text-ink-dim">
          Practice-only, forever. Never published, never copied into the engagement.
        </p>
        <form action={saveNotes} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="draftId" value={draft.id} />
          <textarea
            name="notes"
            rows={4}
            maxLength={8000}
            defaultValue={shape.notes_md ?? ''}
            className={inputCls}
          />
          <div>
            <button type="submit" className={buttonCls}>
              Save notes
            </button>
          </div>
        </form>
      </section>

      <section className="mt-12">
        <KeystoneCard>
          <h2 className="font-display text-2xl font-medium text-ink">Publish</h2>
          <p className="mt-1 text-sm text-ink-dim">
            Creates the engagement{clientName ? ` for ${clientName}` : ''}, its workstreams, and
            the pending invites. The room opens; the draft stays as the scoping record.
          </p>
          <form action={publishDraft} className="mt-4 flex flex-wrap items-center gap-4">
            <input type="hidden" name="draftId" value={draft.id} />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="sendInvites" defaultChecked className="h-4 w-4" />
              Send the invite emails now
            </label>
            <button type="submit" className={buttonCls}>
              Publish engagement
            </button>
          </form>
        </KeystoneCard>
        <form action={discardDraft} className="mt-6">
          <input type="hidden" name="draftId" value={draft.id} />
          <button type="submit" className={linkBtnCls}>
            Discard this draft (kept, reversible)
          </button>
        </form>
      </section>
    </RoomShell>
  )
}

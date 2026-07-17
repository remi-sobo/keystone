import { KeystoneCard } from '@/components/KeystoneCard'
import { MarkdownLite } from '@/components/MarkdownLite'
import { setHomeworkStatus } from '@/app/(client)/homework/actions'

/**
 * PreworkCard: the viewer's own before-session homework, in full, on
 * the home. Read and reflect; the one control is the done toggle (the
 * existing 3C check-off action, assignment-walled at the database).
 * There is deliberately no input here: notes stay with the person and
 * come to the session, not into the platform. A done card stays on the
 * page in its quiet state; it never disappears.
 */

export interface PreworkItem {
  id: string
  title: string
  body_md: string | null
  status: string
}

export function PreworkCard({ items }: { items: PreworkItem[] }) {
  if (items.length === 0) return null
  return (
    <section aria-label="Pre-work" className="mb-10">
      <p className="eyebrow">Before your first session</p>
      <div className="mt-3 flex flex-col gap-4">
        {items.map((item) => {
          const done = item.status === 'done'
          return (
            <KeystoneCard key={item.id} feature={!done}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-xl text-navy">{item.title}</h3>
                {done ? (
                  <span className="shrink-0 font-mono text-xs text-ink-dim">
                    <span aria-hidden="true" className="text-brass">
                      ✓
                    </span>{' '}
                    Done
                  </span>
                ) : null}
              </div>
              {item.body_md ? (
                <div className={`mt-3 text-sm ${done ? 'text-ink-dim' : 'text-ink'}`}>
                  <MarkdownLite text={item.body_md} />
                </div>
              ) : null}
              <form action={setHomeworkStatus} className="mt-4 border-t border-ink/10 pt-3">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="to" value={done ? 'open' : 'done'} />
                {done ? (
                  <button type="submit" className="text-xs text-ink-dim underline hover:text-ink">
                    Mark it open again
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="rounded-lg border border-sage px-4 py-2 text-sm text-forest transition-colors duration-200 hover:bg-sage hover:text-paper active:scale-[0.98]"
                  >
                    Mark done
                  </button>
                )}
              </form>
            </KeystoneCard>
          )
        })}
      </div>
    </section>
  )
}

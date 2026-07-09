import { SingleArchLine, KeystoneWedge } from '@/components/keystone-motifs'

/**
 * ArchEmptyState: the calm, polished empty view for sessions,
 * deliverables, homework, messages, and the library. A faint single
 * arch behind, a small brass wedge above the line, and copy that tells
 * the client what will appear here and when. An empty screen that still
 * feels considered.
 */
export function ArchEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-8 text-center shadow-[var(--shadow-soft)]">
      <SingleArchLine className="pointer-events-none absolute left-1/2 top-4 h-52 w-40 -translate-x-1/2 opacity-70" />

      <div className="relative mx-auto flex max-w-sm flex-col items-center">
        <KeystoneWedge className="h-4 w-4" />
        <h2 className="font-display mt-5 text-2xl font-medium text-ink">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">{body}</p>
      </div>
    </div>
  )
}

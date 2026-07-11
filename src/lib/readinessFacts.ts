/**
 * lib/readinessFacts.ts (V2 4D, gate 4D-2)
 *
 * Execution is the pillar you cannot do for them, so its evidence is
 * the weekly-rhythm facts read straight from the record: sessions
 * held, homework done on time versus late, review submissions. The
 * output is HISTORY IN PROSE beside the consultant's judgment: this
 * lib is gate-tested to never emit the counting-up language of a
 * report card. Pure: no client, no I/O; the wall is the page's (the
 * panel is practice-only).
 */

export interface FactsInputs {
  /** The render's wall clock, passed in so the lib stays pure. */
  now: number
  windowDays: number
  sessions: Array<{ startsAt: string; status: string }>
  items: Array<{ status: string; dueOn: string | null; doneAt: string | null }>
  trail: Array<{ kind: string; createdAt: string }>
}

export function readinessFacts(i: FactsInputs): string[] {
  const cutoff = i.now - i.windowDays * 86400000
  const lines: string[] = []

  const held = i.sessions.filter(
    (s) =>
      ['held', 'booked'].includes(s.status) &&
      Date.parse(s.startsAt) < i.now &&
      Date.parse(s.startsAt) >= cutoff
  ).length
  lines.push(
    held === 0
      ? `No sessions held in the last ${i.windowDays} days`
      : held === 1
        ? `1 session held in the last ${i.windowDays} days`
        : `${held} sessions held in the last ${i.windowDays} days`
  )

  const doneWithDue = i.items.filter(
    (it) => it.status === 'done' && it.dueOn && it.doneAt && Date.parse(it.doneAt) >= cutoff
  )
  if (doneWithDue.length > 0) {
    // On time means done by the end of the due day.
    const onTime = doneWithDue.filter(
      (it) => Date.parse(it.doneAt as string) <= Date.parse(`${it.dueOn}T23:59:59Z`)
    ).length
    lines.push(`${onTime} of ${doneWithDue.length} homework items done on time`)
  }

  const submissions = i.trail.filter(
    (t) => t.kind === 'submission' && Date.parse(t.createdAt) >= cutoff
  ).length
  if (submissions > 0) {
    lines.push(
      submissions === 1 ? '1 review submission' : `${submissions} review submissions`
    )
  }

  return lines
}

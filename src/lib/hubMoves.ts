/**
 * HOME's next three moves (specs/epayl-fundraising-hub.md, the IA
 * revision). Three, never more. CHOSEN BY RULES, NOT BY A MODEL, and
 * the ordering is this file, explicit and readable:
 *
 *   0. A move Kendra pinned holds its slot until she unpins it.
 *   1. Overdue stewardship first (a stewardship task past its date,
 *      then stewardship without a date).
 *   2. Then a blocker that is holding up other work.
 *   3. Then the strategy furthest behind its goal, speaking through
 *      its own named next move or its oldest open task; a strategy
 *      with nothing to say suggests nothing.
 *   4. Then the oldest untouched relationship above the capacity
 *      threshold (never a do-not-contact household).
 *   5. Then whatever open task is due soonest.
 *
 * The reason is always visible on the card, because a suggestion
 * without a reason is a demand. Pure logic, no IO; gated by
 * e2e/hub-moves.spec.ts.
 */

/** The capacity floor for rule 4, named so changing it is one line. */
export const CAPACITY_THRESHOLD_CENTS = 10_000_000 // $100,000 five-year capacity

export interface MoveTask {
  id: string
  title: string
  why: string | null
  owner: string | null
  area: string | null
  source: string
  due_date: string | null
  due_label: string | null
  pinned_slot: number | null
}

export interface MoveCollateral {
  name: string
  owner: string | null
  due_date: string | null
  status: string
  blocks: string | null
}

export interface MoveStrategy {
  id: string
  name: string
  owner: string | null
  goal_cents: number | null
  next_move: string | null
}

export interface MoveDonor {
  id: string
  household: string
  capacity_5yr_cents: number | null
  do_not_contact: boolean
  last_gift_date: string | null
  touched: boolean
}

export interface HomeMove {
  /** hub_tasks id when the move IS a task (pinnable); null otherwise. */
  taskId: string | null
  verb: string
  title: string
  why: string
  when: string | null
  owner: string | null
  pinned: boolean
}

const taskMove = (t: MoveTask, verb: string, pinned = false): HomeMove => ({
  taskId: t.id,
  verb,
  title: t.title,
  why: t.why ?? 'On the list without a reason written down; add one.',
  when: t.due_date ?? t.due_label,
  owner: t.owner,
  pinned,
})

const isStewardship = (t: MoveTask) =>
  t.source === 'stewardship_rule' || (t.area ?? '').toLowerCase() === 'stewardship'

export function chooseHomeMoves(input: {
  today: string
  tasks: MoveTask[]
  collateral: MoveCollateral[]
  strategies: MoveStrategy[]
  committedByStrategy: Map<string, number>
  donors: MoveDonor[]
}): HomeMove[] {
  const { today, tasks, collateral, strategies, committedByStrategy, donors } = input
  const slots: (HomeMove | null)[] = [null, null, null]
  const used = new Set<string>()

  // 0. Pins hold their slots.
  for (const t of tasks) {
    if (t.pinned_slot && t.pinned_slot >= 1 && t.pinned_slot <= 3 && !slots[t.pinned_slot - 1]) {
      slots[t.pinned_slot - 1] = taskMove(t, 'DO', true)
      used.add(t.id)
    }
  }

  const candidates: HomeMove[] = []

  // 1. Overdue stewardship, then stewardship without a date.
  const stewardship = tasks
    .filter((t) => !used.has(t.id) && isStewardship(t))
    .sort((a, b) => {
      const aOver = a.due_date !== null && a.due_date < today ? 0 : 1
      const bOver = b.due_date !== null && b.due_date < today ? 0 : 1
      if (aOver !== bOver) return aOver - bOver
      return (a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1
    })
  for (const t of stewardship) candidates.push(taskMove(t, 'THANK'))

  // 2. A blocker holding up other work.
  for (const c of collateral) {
    if (c.status === 'exists' || !c.blocks) continue
    candidates.push({
      taskId: null,
      verb: 'UNBLOCK',
      title: c.name,
      why: `Blocks ${c.blocks}.`,
      when: c.due_date,
      owner: c.owner,
      pinned: false,
    })
  }

  // 3. The strategy furthest behind its goal, if it has something to
  //    say (its named next move, or its oldest open task).
  const behind = strategies
    .filter((s) => s.goal_cents !== null && s.goal_cents > 0)
    .map((s) => ({
      s,
      gap: (Number(s.goal_cents) - (committedByStrategy.get(s.id) ?? 0)) / Number(s.goal_cents),
    }))
    .sort((a, b) => b.gap - a.gap)
  for (const { s, gap } of behind) {
    if (gap <= 0) continue
    if (s.next_move) {
      candidates.push({
        taskId: null,
        verb: 'MOVE',
        title: s.next_move,
        why: `${s.name} is the furthest behind its goal.`,
        when: null,
        owner: s.owner,
        pinned: false,
      })
    }
  }

  // 4. The oldest untouched relationship above the capacity floor.
  const untouched = donors
    .filter(
      (d) =>
        !d.do_not_contact &&
        !d.touched &&
        d.capacity_5yr_cents !== null &&
        d.capacity_5yr_cents >= CAPACITY_THRESHOLD_CENTS
    )
    .sort((a, b) => ((a.last_gift_date ?? '') < (b.last_gift_date ?? '') ? -1 : 1))
  for (const d of untouched) {
    candidates.push({
      taskId: null,
      verb: 'CALL',
      title: `Get back in touch with ${d.household}`,
      why:
        d.last_gift_date !== null
          ? `Real capacity on file and nothing on record since their last gift in ${d.last_gift_date.slice(0, 4)}.`
          : 'Real capacity on file and no touch on record at all.',
      when: null,
      owner: null,
      pinned: false,
    })
  }

  // 5. Whatever is due soonest.
  const rest = tasks
    .filter((t) => !used.has(t.id) && !isStewardship(t))
    .sort((a, b) => ((a.due_date ?? '9999') < (b.due_date ?? '9999') ? -1 : 1))
  for (const t of rest) candidates.push(taskMove(t, 'DO'))

  const seen = new Set<string>()
  for (const move of candidates) {
    if (slots.every((s) => s !== null)) break
    if (seen.has(move.title)) continue
    seen.add(move.title)
    const free = slots.findIndex((s) => s === null)
    if (free >= 0) slots[free] = move
  }

  return slots.filter((s) => s !== null)
}

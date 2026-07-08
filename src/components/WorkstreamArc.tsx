/**
 * One workstream's five-stage arc (spec 6.4): five connected segments.
 * Completed stages fill sage, the current stage strokes forest with the
 * slow breathing pulse (the sole allowed loop; dies under reduced
 * motion), future stages are hairline. A brass keystone tick marks a
 * stage completed this week. Descriptive, never scored: no percentages,
 * no red, no judgment on a stage that holds.
 *
 * Server-renderable: pure props, no state, no browser APIs.
 */

export default function WorkstreamArc({
  title,
  stage,
  stages,
  freshStages,
}: {
  title: string
  stage: string
  /** The practice's arc vocabulary, e.g. diagnose..stabilize. */
  stages: string[]
  /** Stage names completed within the last 7 days (the brass tick). */
  freshStages: string[]
}) {
  const done = stage === 'done'
  const currentIndex = done ? stages.length : stages.indexOf(stage)

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-display text-xl font-medium text-ink">{title}</h3>
        <span className="eyebrow shrink-0">{done ? 'complete' : stage}</span>
      </div>
      <ol className="mt-3 flex gap-1.5" aria-label={`${title}: stage ${done ? 'complete' : stage}`}>
        {stages.map((s, i) => {
          const isComplete = i < currentIndex
          const isCurrent = i === currentIndex
          const fresh = freshStages.includes(s)
          return (
            <li key={s} className="relative h-2 flex-1" title={s}>
              <span
                aria-hidden
                className={`block h-full rounded-full ${
                  isComplete
                    ? 'bg-sage'
                    : isCurrent
                      ? 'stage-breathing border border-forest bg-paper-raised'
                      : 'border border-ink/15 bg-transparent'
                }`}
              />
              {isComplete && fresh ? (
                <span
                  aria-hidden
                  className="absolute -top-1.5 right-0 h-2 w-2 rotate-45 bg-brass"
                />
              ) : null}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/**
 * A display-size figure over a mono uppercase label, with its trust
 * clause after a gold middle dot. The gap state is the load-bearing
 * half: a number that cannot be computed renders as a gap with a plain
 * sentence, never as a plausible value.
 */
export default function Stat({
  label,
  value,
  trust,
  gap,
  explain,
  volume = 'black',
}: {
  label: string
  value: string | null
  trust?: string | null
  /** The plain sentence shown when there is no value. */
  gap?: string
  /** One sentence behind a small question mark; never a modal. */
  explain?: string
  volume?: 'black' | 'paper'
}) {
  const onBlack = volume === 'black'
  const ink = onBlack ? 'var(--hub-bone)' : 'var(--hub-acid-black)'
  const dim = onBlack ? 'var(--hub-bone-dim)' : 'var(--hub-stone-ink)'
  const mut = onBlack ? 'var(--hub-stone)' : 'var(--hub-stone-ink)'
  return (
    <div
      className="hub-stat"
      style={{
        background: onBlack ? 'var(--hub-acid-black)' : 'var(--hub-paper-raised)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--hub-font-detail)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: mut,
        }}
      >
        {label}
      </div>
      {value !== null ? (
        <div className="hub-stat-value" style={{ color: ink }}>
          {value}
        </div>
      ) : (
        <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 14, color: dim, maxWidth: '34ch' }}>
          {gap ?? 'Nothing recorded yet.'}
        </div>
      )}
      {value !== null && trust ? (
        <div
          style={{
            fontFamily: 'var(--hub-font-detail)',
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            marginTop: 10,
            color: mut,
          }}
        >
          <span style={{ color: 'var(--hub-gold)' }}>·</span> {trust}
        </div>
      ) : null}
      {explain ? (
        <details className="hub-stat-explain">
          <summary
            style={{ color: onBlack ? 'var(--hub-gold)' : 'var(--hub-gold-ink)' }}
            aria-label={`What ${label} means`}
          >
            ?
          </summary>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: dim, margin: '10px 0 0', maxWidth: '38ch' }}>
            {explain}
          </p>
        </details>
      ) : null}
    </div>
  )
}

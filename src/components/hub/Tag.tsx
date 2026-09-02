/**
 * Mono uppercase pill with a hairline border. Tones: gold, muted,
 * terracotta. Terracotta stays small; it marks gaps and overdue work,
 * never decoration. `fill` inverts the gold tone (gold ground, black
 * type) for the one state that earned it: covered.
 */
export default function Tag({
  children,
  tone = 'muted',
  volume = 'paper',
  fill = false,
}: {
  children: React.ReactNode
  tone?: 'gold' | 'muted' | 'terracotta'
  volume?: 'black' | 'paper'
  fill?: boolean
}) {
  const color =
    tone === 'gold'
      ? volume === 'black'
        ? 'var(--hub-gold)'
        : 'var(--hub-gold-ink)'
      : tone === 'terracotta'
        ? 'var(--hub-terracotta)'
        : volume === 'black'
          ? 'var(--hub-stone)'
          : 'var(--hub-stone-ink)'
  const filled = fill && tone === 'gold'
  return (
    <span
      style={{
        fontFamily: 'var(--hub-font-detail)',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: filled ? 'var(--hub-acid-black)' : color,
        background: filled ? 'var(--hub-gold)' : 'transparent',
        border: filled
          ? '1px solid var(--hub-gold)'
          : `1px solid ${volume === 'black' ? 'var(--hub-line-on-black)' : 'var(--hub-line-on-paper)'}`,
        padding: '3px 9px',
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

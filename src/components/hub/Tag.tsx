/**
 * Mono uppercase pill with a hairline border. Tones: gold, muted,
 * terracotta. Terracotta stays small; it marks gaps and overdue work,
 * never decoration.
 */
export default function Tag({
  children,
  tone = 'muted',
  volume = 'paper',
}: {
  children: React.ReactNode
  tone?: 'gold' | 'muted' | 'terracotta'
  volume?: 'black' | 'paper'
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
  return (
    <span
      style={{
        fontFamily: 'var(--hub-font-detail)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color,
        border: `1px solid ${volume === 'black' ? 'var(--hub-line-on-black)' : 'var(--hub-line-on-paper)'}`,
        padding: '3px 8px',
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  )
}

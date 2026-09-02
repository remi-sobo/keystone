/**
 * The wordmark is the mark: there is no logo file. Campaign name set in
 * the display face, uppercase, with the accent segment in gold
 * (docs/hub/art-direction.md). The words come from the org's
 * vocabulary row, so correcting them is a row update, not a deploy.
 */
export interface WordmarkSegment {
  text: string
  tone?: 'default' | 'gold'
}

export default function Wordmark({
  segments,
  tagline,
  size = 19,
  volume = 'black',
}: {
  segments: WordmarkSegment[]
  tagline?: string
  size?: number
  volume?: 'black' | 'paper'
}) {
  const ink = volume === 'black' ? 'var(--hub-bone)' : 'var(--hub-acid-black)'
  return (
    <div style={{ minWidth: 480 }}>
      <div
        style={{
          fontFamily: 'var(--hub-font-display)',
          fontSize: size,
          lineHeight: 1.02,
          letterSpacing: '0.005em',
          textTransform: 'uppercase',
          color: ink,
        }}
      >
        {segments.map((s, i) => (
          <span key={i} style={s.tone === 'gold' ? { color: 'var(--hub-gold)' } : undefined}>
            {s.text}
            {i < segments.length - 1 ? ' ' : ''}
          </span>
        ))}
        {tagline ? (
          <span
            style={{
              fontFamily: 'var(--hub-font-detail)',
              fontSize: 10,
              letterSpacing: '0.2em',
              color: volume === 'black' ? 'var(--hub-stone)' : 'var(--hub-stone-ink)',
              marginLeft: 14,
              textTransform: 'uppercase',
            }}
          >
            <span style={{ color: 'var(--hub-gold)' }}>·</span> {tagline}
          </span>
        ) : null}
      </div>
    </div>
  )
}

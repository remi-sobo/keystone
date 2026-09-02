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
    <div>
      <div
        style={{
          fontFamily: 'var(--hub-font-display)',
          fontSize: size,
          lineHeight: 1.05,
          letterSpacing: '0.01em',
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
      </div>
      {tagline ? (
        <div
          style={{
            fontFamily: 'var(--hub-font-detail)',
            fontSize: 11,
            letterSpacing: '0.22em',
            color: volume === 'black' ? 'var(--hub-stone)' : 'var(--hub-stone-ink)',
            marginTop: 8,
            textTransform: 'uppercase',
          }}
        >
          <span style={{ color: 'var(--hub-gold)' }}>·</span> {tagline}
        </div>
      ) : null}
    </div>
  )
}

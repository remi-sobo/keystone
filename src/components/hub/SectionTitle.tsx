/**
 * A section head: mono uppercase label in gold-ink over the display
 * face at section size (docs/hub/art-direction.md).
 */
export default function SectionTitle({
  label,
  title,
}: {
  label: string
  title: string
}) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          fontFamily: 'var(--hub-font-detail)',
          fontSize: 11,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--hub-gold-ink)',
        }}
      >
        {label}
      </div>
      <h1
        style={{
          fontFamily: 'var(--hub-font-display)',
          fontSize: 42,
          lineHeight: 1.02,
          textTransform: 'uppercase',
          color: 'var(--hub-acid-black)',
          margin: '10px 0 0',
          fontWeight: 400,
        }}
      >
        {title}
      </h1>
    </div>
  )
}

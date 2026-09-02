/**
 * A 1px hairline box with an optional 3px gold top rule. Square
 * corners, no shadow, no motion: this is a print-first brand.
 */
export default function Card({
  children,
  rule = false,
  volume = 'paper',
}: {
  children: React.ReactNode
  rule?: boolean
  volume?: 'black' | 'paper'
}) {
  const onBlack = volume === 'black'
  return (
    <div
      style={{
        background: onBlack ? 'var(--hub-acid-black-raised)' : 'var(--hub-paper-raised)',
        border: `1px solid ${onBlack ? 'var(--hub-line-on-black)' : 'var(--hub-line-on-paper)'}`,
        borderTop: rule
          ? '3px solid var(--hub-gold)'
          : `1px solid ${onBlack ? 'var(--hub-line-on-black)' : 'var(--hub-line-on-paper)'}`,
        padding: 16,
      }}
    >
      {children}
    </div>
  )
}

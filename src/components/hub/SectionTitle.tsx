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
    <div style={{ marginBottom: 36 }}>
      <div className="hub-title-kicker">{label}</div>
      <h1 className="hub-title">{title}</h1>
    </div>
  )
}

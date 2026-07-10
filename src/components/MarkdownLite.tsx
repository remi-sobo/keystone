/**
 * A deliberately small renderer for Keystone's own markdown bodies
 * (the charter, and whatever inherits it). Headings, lists, and
 * paragraphs; nothing else, no HTML passthrough, no dependency. The
 * source is trusted practice-authored text that already passed the
 * voice gate; this only shapes it.
 */

interface Block {
  kind: 'h2' | 'h3' | 'ul' | 'p'
  lines: string[]
}

function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length > 0) blocks.push({ kind: 'p', lines: para })
    para = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      flush()
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      blocks.push({ kind: 'h3', lines: [line.slice(4)] })
    } else if (line.startsWith('## ')) {
      flush()
      blocks.push({ kind: 'h2', lines: [line.slice(3)] })
    } else if (/^[-*] /.test(line)) {
      const prev = blocks[blocks.length - 1]
      if (para.length === 0 && prev?.kind === 'ul') prev.lines.push(line.slice(2))
      else {
        flush()
        blocks.push({ kind: 'ul', lines: [line.slice(2)] })
      }
    } else {
      para.push(line)
    }
  }
  flush()
  return blocks
}

export function MarkdownLite({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {toBlocks(text).map((b, i) => {
        if (b.kind === 'h2')
          return (
            <h2 key={i} className="mt-5 font-display text-2xl font-medium text-ink first:mt-0">
              {b.lines[0]}
            </h2>
          )
        if (b.kind === 'h3')
          return (
            <h3 key={i} className="mt-3 font-display text-lg font-medium text-ink">
              {b.lines[0]}
            </h3>
          )
        if (b.kind === 'ul')
          return (
            <ul key={i} className="ml-5 list-disc text-sm leading-relaxed text-ink">
              {b.lines.map((li, j) => (
                <li key={j}>{li}</li>
              ))}
            </ul>
          )
        return (
          <p key={i} className="whitespace-pre-line text-sm leading-relaxed text-ink">
            {b.lines.join('\n')}
          </p>
        )
      })}
    </div>
  )
}

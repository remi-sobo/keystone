'use client'

import { useRef, useState } from 'react'
import { MarkdownLite } from '@/components/MarkdownLite'

/**
 * The library's writing surface: a plain textarea with a formatting
 * toolbar (heading, bold, italic, lists, link) that inserts the
 * MarkdownLite marks at the cursor, and a preview tab that renders
 * exactly what the reader will see. It stays a named form field, so
 * the existing server-action forms use it without new plumbing.
 */

const TOOLS: Array<{ label: string; title: string; before: string; after: string; block?: boolean }> = [
  { label: 'H2', title: 'Section heading', before: '## ', after: '', block: true },
  { label: 'H3', title: 'Small heading', before: '### ', after: '', block: true },
  { label: 'B', title: 'Bold', before: '**', after: '**' },
  { label: 'I', title: 'Italic', before: '*', after: '*' },
  { label: 'Bullets', title: 'Bulleted list', before: '- ', after: '', block: true },
  { label: '1.2.3.', title: 'Numbered list', before: '1. ', after: '', block: true },
  { label: 'Link', title: 'Link', before: '[', after: '](https://)' },
]

export default function MarkdownEditor({
  name,
  defaultValue,
  rows = 18,
  placeholder,
}: {
  name: string
  defaultValue?: string
  rows?: number
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(defaultValue ?? '')
  const [preview, setPreview] = useState(false)

  function apply(tool: (typeof TOOLS)[number]) {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    const selected = value.slice(start, end)

    let next: string
    let caret: number
    if (tool.block) {
      // Prefix each selected line (or the current line) at its start.
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const scope = value.slice(lineStart, end || start)
      const prefixed = (scope || '')
        .split('\n')
        .map((l, i) =>
          tool.before === '1. ' ? `${i + 1}. ${l}` : `${tool.before}${l}`
        )
        .join('\n')
      next = value.slice(0, lineStart) + prefixed + value.slice(end || start)
      caret = lineStart + prefixed.length
    } else {
      const inner = selected || tool.title.toLowerCase()
      next = value.slice(0, start) + tool.before + inner + tool.after + value.slice(end)
      caret = start + tool.before.length + inner.length + tool.after.length
    }
    setValue(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            title={t.title}
            onClick={() => apply(t)}
            className="rounded border border-ink/15 bg-paper px-2 py-1 text-xs text-ink-dim transition-colors duration-200 hover:border-ink/30 hover:text-ink"
          >
            {t.label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setPreview((p) => !p)}
          className={`rounded border px-2 py-1 text-xs transition-colors duration-200 ${
            preview
              ? 'border-forest text-forest'
              : 'border-ink/15 text-ink-dim hover:border-ink/30 hover:text-ink'
          }`}
        >
          {preview ? 'Back to writing' : 'Preview'}
        </button>
      </div>

      {/* The field always submits, even while previewing. */}
      <textarea
        ref={ref}
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`rounded-lg border border-ink/15 bg-paper-raised p-3 text-sm leading-relaxed text-ink ${
          preview ? 'hidden' : ''
        }`}
      />
      {preview ? (
        <div className="rounded-lg border border-ink/10 bg-paper-raised p-4">
          {value.trim() ? (
            <MarkdownLite text={value} />
          ) : (
            <p className="text-sm text-ink-dim">Nothing to preview yet.</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

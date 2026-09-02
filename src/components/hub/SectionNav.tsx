'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * The five sections, nothing else in primary navigation
 * (docs/handoff/epayl/CLIENT-HUB-IA-REVISION-PROMPT.md). Mono 11px
 * uppercase, hairline borders, the active section a gold fill with
 * black type on a 3px gold rule. Each label is a question Kendra
 * already asks; the question renders as a title attribute so the nav
 * stays quiet.
 */
const SECTIONS = [
  { slug: '', label: 'Home', question: 'What matters right now' },
  { slug: 'people', label: 'People', question: 'Who are we moving' },
  { slug: 'plan', label: 'Plan', question: 'Where the money comes from' },
  { slug: 'money', label: 'Money', question: 'Are we funded' },
  { slug: 'work', label: 'Work', question: 'Can we actually do this' },
]

export default function SectionNav({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Hub sections"
      style={{ borderBottom: '3px solid var(--hub-gold)', display: 'flex', flexWrap: 'wrap' }}
    >
      {SECTIONS.map((s) => {
        const href = s.slug ? `/${orgSlug}/${s.slug}` : `/${orgSlug}`
        const active = s.slug
          ? pathname === href || pathname.startsWith(`${href}/`)
          : pathname === `/${orgSlug}`
        return (
          <Link
            key={s.label}
            href={href}
            title={s.question}
            style={{
              fontFamily: 'var(--hub-font-detail)',
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              padding: '10px 18px',
              color: active ? 'var(--hub-acid-black)' : 'var(--hub-bone-dim)',
              background: active ? 'var(--hub-gold)' : 'transparent',
              border: '1px solid var(--hub-line-on-black)',
              borderBottom: 'none',
              textDecoration: 'none',
            }}
          >
            {s.label}
          </Link>
        )
      })}
    </nav>
  )
}

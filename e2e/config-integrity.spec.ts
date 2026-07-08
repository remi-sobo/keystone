import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * The Keystone config-integrity gate, adapted from the Trellis gate
 * (e2e/config-integrity.spec.ts). Filesystem reads only, no browser,
 * intentionally fast. Three jobs:
 *
 *   1. Freeze the ten design tokens from specs/keystone.md section 6.1.
 *   2. Assert no hardcoded domains outside the named fallbacks in
 *      src/lib/env.ts (and .env.example documentation).
 *   3. The voice check: fail on any em dash, en dash, or banned word in
 *      shipped source (src/**), per the SOBO voice rules.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')

function walk(dir: string, ext: string[]): string[] {
  const out: string[] = []
  const root = path.join(process.cwd(), dir)
  if (!fs.existsSync(root)) return out
  const rec = (rel: string) => {
    for (const e of fs.readdirSync(path.join(process.cwd(), rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`
      if (e.isDirectory()) rec(child)
      else if (ext.some((x) => e.name.endsWith(x))) out.push(child)
    }
  }
  rec(dir)
  return out
}

// The ten tokens, frozen. Changing a value here requires a spec change
// first (specs/keystone.md 6.1), then this gate, then globals.css.
const FROZEN_TOKENS: Record<string, string> = {
  '--color-paper': '#FBF4EA',
  '--color-paper-raised': '#FFFBF3',
  '--color-paper-deep': '#F3EADC',
  '--color-forest': '#33503C',
  '--color-forest-deep': '#26402E',
  '--color-navy': '#3D4959',
  '--color-ink': '#2A2620',
  '--color-ink-dim': '#6E675C',
  '--color-brass': '#B08D3E',
  '--color-sage': '#7A9471',
}

const GLOBALS = 'src/app/globals.css'

test.describe('design tokens are frozen at the spec 6.1 values', () => {
  test('every token is present at its exact value', () => {
    const css = read(GLOBALS)
    for (const [token, value] of Object.entries(FROZEN_TOKENS)) {
      const re = new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6})`)
      const m = css.match(re)
      expect(m, `${token} missing from globals.css`).not.toBeNull()
      expect(m![1].toUpperCase(), `${token} drifted`).toBe(value)
    }
  })

  test('the @theme block declares no color beyond the ten', () => {
    const css = read(GLOBALS)
    const theme = css.match(/@theme\s*\{[\s\S]*?\n\}/)
    expect(theme, '@theme block missing').not.toBeNull()
    const colors = [...theme![0].matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1])
    const allowed = Object.keys(FROZEN_TOKENS).map((t) => t.replace('--color-', ''))
    const extras = colors.filter((c) => !allowed.includes(c))
    expect(extras, `Ten tokens. Resist more. Extra color token(s): ${extras.join(', ')}`).toEqual([])
    expect(colors.length).toBe(10)
  })

  test('the single easing is frozen in both @theme and lib/motion.ts', () => {
    expect(read(GLOBALS)).toContain('cubic-bezier(0.22, 1, 0.36, 1)')
    const motion = read('src/lib/motion.ts')
    expect(motion).toContain('cubic-bezier(0.22, 1, 0.36, 1)')
    expect(motion).toContain('[0.22, 1, 0.36, 1]')
  })

  test('the three type registers are wired as CSS variables', () => {
    const css = read(GLOBALS)
    expect(css).toContain('var(--font-cormorant)')
    expect(css).toContain('var(--font-jakarta)')
    expect(css).toContain('var(--font-jetbrains)')
    const layout = read('src/app/layout.tsx')
    expect(layout).toContain('Cormorant_Garamond')
    expect(layout).toContain('Plus_Jakarta_Sans')
    expect(layout).toContain('JetBrains_Mono')
  })

  test('the reduced-motion gate exists', () => {
    expect(read(GLOBALS)).toContain('prefers-reduced-motion: reduce')
  })
})

test.describe('no hardcoded domains', () => {
  // Domain literals live in exactly one place, the named fallbacks in
  // src/lib/env.ts, so a domain change (CONFIRM 1) is a one-file edit.
  const DOMAIN_RE = /soboconsulting\.com|\.vercel\.app|\.supabase\.co/i
  const ALLOWED = ['src/lib/env.ts']

  test('domain literals appear only in the env fallbacks', () => {
    const files = walk('src', ['.ts', '.tsx', '.css'])
    for (const f of files) {
      if (ALLOWED.includes(f)) continue
      expect(DOMAIN_RE.test(read(f)), `${f} hardcodes a domain; use env.ts`).toBe(false)
    }
  })
})

test.describe('the voice check on shipped source', () => {
  // src/lib/voice.ts necessarily contains the dash regexes and the
  // banned list itself; it is the validator, not a violation.
  const EXEMPT = ['src/lib/voice.ts']
  const BANNED = [
    'transformative',
    'holistic',
    'pivotal',
    'leverage',
    'unlock',
    'seamless',
    'robust',
    'elevate',
    'delve',
    'empower',
    'revolutionize',
    'synergy',
  ]

  test('no em dash or en dash anywhere in src', () => {
    const files = walk('src', ['.ts', '.tsx', '.css'])
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      if (EXEMPT.includes(f)) continue
      const src = read(f)
      expect(/—|–/.test(src), `${f} contains an em or en dash`).toBe(false)
    }
  })

  test('no banned word anywhere in src', () => {
    const files = walk('src', ['.ts', '.tsx', '.css'])
    for (const f of files) {
      if (EXEMPT.includes(f)) continue
      const lower = read(f).toLowerCase()
      const hits = BANNED.filter((w) => new RegExp(`(?<![a-z])${w}`).test(lower))
      expect(hits, `${f} contains banned word(s): ${hits.join(', ')}`).toEqual([])
    }
  })
})

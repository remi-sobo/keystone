import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { session1Meta, session1Slides } from '../src/lib/deck/session1'
import { SLIDE_TYPES } from '../src/lib/deck/types'

/**
 * The deck-fixture gate (Step 3a of the weekend runbook): the in-app
 * Session 1 fixture must stay VERBATIM against the standalone teaching
 * deck committed at docs/decks/SafeSpace_Session01_Teaching.html (the
 * build_deck.py output, the Tuesday safety net). Every visible string
 * in the fixture is asserted to appear in the HTML file, so the two
 * can never quietly drift apart; GATE 3's side-by-side run confirms
 * the rendering, this gate pins the words.
 */

const html = fs
  .readFileSync(
    path.join(process.cwd(), 'docs/decks/SafeSpace_Session01_Teaching.html'),
    'utf-8'
  )
  // Decode the numeric entities the deck builder emits (apostrophes,
  // the hair space, the times and middot glyphs).
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))

function mustAppear(text: string) {
  expect(html.includes(text), `fixture text drifted from the deck: "${text}"`).toBe(true)
}

test('the fixture is fourteen slides in the deck order', () => {
  expect(session1Slides).toHaveLength(14)
  expect(session1Slides[0].slide_type).toBe('cover')
  expect(session1Slides[13].slide_type).toBe('close')
  const counts: Record<string, number> = {}
  for (const s of session1Slides) counts[s.slide_type] = (counts[s.slide_type] || 0) + 1
  expect(counts).toEqual({
    cover: 1,
    agenda: 1,
    section: 3,
    tracks: 1,
    loop: 1,
    idea: 5,
    homework: 1,
    close: 1,
  })
  for (const s of session1Slides) expect(SLIDE_TYPES).toContain(s.slide_type)
})

test('the standalone deck carries the same fourteen slides', () => {
  expect(html.match(/class="slide[ "]/g)).toHaveLength(14)
  expect(html.match(/class="slide idea"/g)).toHaveLength(5)
  expect(html.match(/class="slide section"/g)).toHaveLength(3)
})

test('every fixture string appears verbatim in the standalone deck', () => {
  for (const s of session1Slides) {
    switch (s.slide_type) {
      case 'cover':
        mustAppear(s.eyebrow)
        mustAppear(s.title)
        mustAppear(s.subtitle)
        mustAppear(s.meta_when)
        break
      case 'section':
        mustAppear(s.num)
        mustAppear(s.title)
        if (s.sub) mustAppear(s.sub)
        break
      case 'idea':
        mustAppear(s.eyebrow)
        mustAppear(s.head)
        mustAppear(s.sup)
        break
      case 'agenda':
        mustAppear(s.title)
        s.items.forEach(mustAppear)
        if (s.footnote) mustAppear(s.footnote)
        break
      case 'tracks':
        mustAppear(s.title)
        for (const t of s.tracks) {
          mustAppear(t.label)
          t.chips.forEach(mustAppear)
        }
        if (s.note) mustAppear(s.note)
        break
      case 'loop':
        mustAppear(s.title)
        s.steps.forEach(mustAppear)
        if (s.note) mustAppear(s.note)
        break
      case 'homework':
        mustAppear(s.title)
        for (const r of s.rows) {
          mustAppear(r.who)
          mustAppear(r.task)
        }
        break
      case 'close':
        mustAppear(s.line1)
        mustAppear(s.line2)
        mustAppear(s.attr)
        break
    }
  }
  mustAppear(session1Meta.program)
})

test('the deck copy holds the voice rules', () => {
  const all = JSON.stringify(session1Slides)
  expect(/—|–/.test(all)).toBe(false)
  for (const w of ['leverage', 'unlock', 'seamless', 'holistic', 'transformative', 'robust', 'pivotal']) {
    expect(all.toLowerCase()).not.toContain(w)
  }
})

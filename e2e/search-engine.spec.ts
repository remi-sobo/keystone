import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { cleanTerm, likePattern, snippetAround } from '../src/lib/recordSearch'

/**
 * V2 engagement search (specs/keystone-v2-search.md). The pure helpers
 * unit-tested, and the standing exclusions pinned: the notes query
 * never touches transcript columns, and every query is
 * engagement-scoped on the caller's session.
 */

test('cleanTerm strips the reserved characters and keeps the words', () => {
  expect(cleanTerm('  giving "tree" \\ plan ')).toBe('giving tree  plan')
  expect(cleanTerm('donor, (top ten)')).toBe('donor, (top ten)')
})

test('likePattern escapes ILIKE wildcards inside the term', () => {
  expect(likePattern('100% rhythm_check')).toBe('%100\\% rhythm\\_check%')
  expect(likePattern('plain')).toBe('%plain%')
})

test('snippetAround cuts around the first match with honest ellipses', () => {
  const text = `${'a'.repeat(200)} the giving tree play ${'b'.repeat(200)}`
  const snip = snippetAround(text, 'giving tree')
  expect(snip).toContain('giving tree')
  expect(snip.startsWith('...')).toBe(true)
  expect(snip.endsWith('...')).toBe(true)
  expect(snip.length).toBeLessThan(220)
})

test('a term missing from the text still yields a bounded snippet', () => {
  const snip = snippetAround('c'.repeat(500), 'absent')
  expect(snip.length).toBeLessThanOrEqual(160)
})

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf-8')

test('the search queries never touch transcript columns (SECURITY.md 4.2)', () => {
  const src = read('src/lib/recordSearch.ts')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  expect(src).not.toMatch(/raw_transcript|transcript_path/)
})

test('every search query is engagement-scoped', () => {
  const src = read('src/lib/recordSearch.ts')
  const froms = src.match(/\.from\('/g) ?? []
  const scopes = src.match(/\.eq\('engagement_id', engagementId\)/g) ?? []
  expect(froms.length).toBeGreaterThanOrEqual(8)
  expect(scopes.length).toBe(froms.length)
})

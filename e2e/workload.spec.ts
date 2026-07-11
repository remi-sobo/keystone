import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * V2 4C (specs/keystone-v2-workload.md): ownership and the team view.
 * Columns ride standing walls, so the gate pins the shape: the
 * migration adds columns and NOTHING else (no policies, no grants),
 * the actions verify same-practice membership before writing, the
 * client surface never reads an owner, and the team page speaks our
 * vocabulary: descriptive, never a score on our own people.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

test('0026 adds the two owner columns and nothing else', () => {
  const mig = read('supabase/migrations/0026_v2_ownership.sql')
  expect(mig).toContain('alter table public.engagements')
  expect(mig).toContain('alter table public.workstreams')
  const refs = mig.match(/references public\.practice_members\(id\) on delete set null/g)
  expect(refs).toHaveLength(2)
  // Columns only: the walls that already stand do the enforcing.
  expect(mig).not.toContain('create policy')
  expect(mig).not.toContain('create table')
  expect(mig).not.toMatch(/\bgrant\b/i)
})

test('owner writes verify the assignee against the caller\'s own practice', () => {
  const actions = read('src/app/(practice)/engagements/[id]/actions.ts')
  const block = actions.slice(
    actions.indexOf('async function verifiedOwnerUpdate'),
    actions.indexOf('export async function saveWorkstreamNote')
  )
  expect(block).toContain("from('practice_members')")
  expect(block).toContain("eq('practice_id', viewer.practice!.practiceId)")
  expect(block).toContain("is('revoked_at', null)")
  expect(block).toContain('setEngagementOwner')
  expect(block).toContain('setWorkstreamOwner')
})

test('the client surface never reads ownership', () => {
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      const p = path.join(dir, d.name)
      return d.isDirectory() ? walk(p) : [p]
    })
  for (const f of walk(path.join(process.cwd(), 'src/app/(client)'))) {
    expect(
      fs.readFileSync(f, 'utf-8'),
      `${f} must not read owner_practice_member_id`
    ).not.toContain('owner_practice_member_id')
  }
})

test('the team page is descriptive: no capacity, utilization, score, or ranking', () => {
  const page = read('src/app/(practice)/team/page.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  expect(page).not.toMatch(/capacity|utilization|score|percent|rank|productivity|%/i)
  expect(page).toContain('No owner yet')
  expect(page).toContain('Unowned work is the first workload fact.')
  // The nav carries the room.
  expect(read('src/components/nav.ts')).toContain("href: '/team'")
})

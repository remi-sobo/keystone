import { test, expect } from '@playwright/test'
import { clientNav, practiceNav } from '../src/components/nav'
import fs from 'fs'
import path from 'path'

/**
 * One icon per room (Remi, 2026-07-11): every nav item on a surface
 * carries its own icon, distinct and correlative, never a reuse. The
 * gate also proves every declared icon name resolves in the Sidebar
 * map, so a typo cannot render an empty slot.
 */

test('no two nav items on a surface share an icon', () => {
  for (const [name, items] of [
    ['client', clientNav()],
    ['practice', practiceNav()],
  ] as const) {
    const icons = items.map((i) => i.icon)
    expect(new Set(icons).size, `${name} nav has a duplicated icon: ${icons.join(', ')}`).toBe(
      icons.length
    )
  }
})

test('every declared icon exists in the Sidebar map', () => {
  const sidebar = fs.readFileSync(
    path.join(process.cwd(), 'src/components/Sidebar.tsx'),
    'utf-8'
  )
  for (const item of [...clientNav(), ...practiceNav()]) {
    expect(sidebar, `Sidebar ICONS map is missing '${item.icon}'`).toMatch(
      new RegExp(`^\\s*${item.icon}: [A-Z]`, 'm')
    )
  }
})

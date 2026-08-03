/**
 * The nav lists for both surfaces. Deliberately NOT a client module:
 * the layouts are server components and Next 16 turns every export of
 * a 'use client' file into a client reference, so calling a nav
 * function that lived inside Sidebar.tsx threw at the first
 * authenticated render (the exact crash the first live login found).
 * Plain data lives in a plain module; Sidebar imports the type.
 */

export interface NavItem {
  href: string
  label: string
  icon: string
  mobile?: boolean
}

export function clientNav(): NavItem[] {
  return [
    { href: '/home', label: 'Home', icon: 'home', mobile: true },
    { href: '/sessions', label: 'Sessions', icon: 'sessions', mobile: true },
    { href: '/homework', label: 'Homework', icon: 'homework', mobile: true },
    { href: '/deliverables', label: 'Deliverables', icon: 'deliverables', mobile: true },
    { href: '/library', label: 'Library', icon: 'library' },
    // Desktop rail only, like Account: the archive is a reading page.
    { href: '/digests', label: 'Digests', icon: 'digests' },
    // Desktop rail only: the ending's room (V2 5A); quiet until published.
    { href: '/closeout', label: 'Closeout', icon: 'closeout' },
    { href: '/messages', label: 'Messages', icon: 'messages', mobile: true },
    // Desktop rail only: the mobile bar holds its five; phones reach
    // Account through the quiet line at the bottom of Home.
    { href: '/account', label: 'Account', icon: 'account' },
  ]
}

/**
 * The sales lead's surface (specs/keystone-sales.md). Two rooms in this
 * build, both mobile: he works from a phone. The board, the
 * qualification card and the materials shelf are Rings 2, 3 and 5, and
 * they join this list when they land.
 */
export function salesNav(): NavItem[] {
  return [
    { href: '/sales', label: 'Prospects', icon: 'prospects', mobile: true },
    { href: '/sales/commission', label: 'Commission', icon: 'commission', mobile: true },
  ]
}

export function practiceNav(role?: 'owner' | 'consultant'): NavItem[] {
  return [
    { href: '/today', label: 'Home', icon: 'home', mobile: true },
    { href: '/clients', label: 'Clients', icon: 'clients', mobile: true },
    { href: '/engagements', label: 'Engagements', icon: 'engagements', mobile: true },
    // Desktop rail only: the mobile bar keeps its five.
    { href: '/team', label: 'Team', icon: 'team' },
    // Reported issues from the help FAB. Owner only, by decision: the
    // triage screen is Remi's. Desktop rail only, so the mobile bar
    // stays at its five-item max.
    ...(role === 'owner'
      ? [{ href: '/issues', label: 'Issues', icon: 'issues' } as NavItem]
      : []),
    // /library belongs to the client surface; authoring sits beneath it
    // (the App Router cannot give two route groups the same path).
    { href: '/library/authoring', label: 'Library', icon: 'library', mobile: true },
    // Desktop rail only, owner only: the sales ledger, where a signed
    // deal and a payment received get recorded and commission liability
    // is read off (specs/keystone-sales.md, Ring 4).
    ...(role === 'owner'
      ? [{ href: '/sales-ledger', label: 'Sales', icon: 'ledger' } as NavItem]
      : []),
    { href: '/settings', label: 'Settings', icon: 'settings', mobile: true },
  ]
}

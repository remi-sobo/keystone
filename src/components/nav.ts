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
    { href: '/messages', label: 'Messages', icon: 'messages', mobile: true },
  ]
}

export function practiceNav(): NavItem[] {
  return [
    { href: '/today', label: 'Home', icon: 'home', mobile: true },
    { href: '/clients', label: 'Clients', icon: 'clients', mobile: true },
    { href: '/engagements', label: 'Engagements', icon: 'engagements', mobile: true },
    // /library belongs to the client surface; authoring sits beneath it
    // (the App Router cannot give two route groups the same path).
    { href: '/library/authoring', label: 'Library', icon: 'library', mobile: true },
    { href: '/settings', label: 'Settings', icon: 'settings', mobile: true },
  ]
}

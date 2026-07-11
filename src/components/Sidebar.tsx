'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  CalendarDays,
  ListChecks,
  Package,
  Library,
  MessageCircle,
  Users,
  Briefcase,
  Settings,
  Newspaper,
  Landmark,
  CircleUserRound,
  ClipboardList,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'

import type { NavItem } from './nav'

/**
 * The left sidebar, the room's spine (spec 6.3). 264px fixed on
 * desktop, collapsible to a 72px icon rail (state persisted per
 * browser). At 390px it does not shrink, it transforms: a bottom tab
 * bar, five items max, brass tick on top of the active tab.
 *
 * Active state is never a filled pill: a 3px brass tick on the left
 * edge, forest text, a whisper of paper-raised fill. The nav LISTS
 * live in components/nav.ts (a server-safe module) because the
 * layouts that call them are server components.
 */

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  sessions: CalendarDays,
  homework: ListChecks,
  deliverables: Package,
  library: Library,
  messages: MessageCircle,
  clients: Users,
  engagements: Briefcase,
  settings: Settings,
  // One icon per room, no doubles: the digest is the weekly paper,
  // the closeout is the structure that stands, the account is you,
  // the team view is who owns what.
  digests: Newspaper,
  closeout: Landmark,
  account: CircleUserRound,
  team: ClipboardList,
}

const COLLAPSE_KEY = 'keystone.sidebar.collapsed'

export default function Sidebar({
  items,
  practiceName,
  clientName,
  personEmail,
}: {
  items: NavItem[]
  practiceName: string
  clientName?: string
  personEmail: string
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Rehydrate the persisted preference once on mount. The server
    // renders expanded; a stored collapse applies after hydration.
    if (window.localStorage.getItem(COLLAPSE_KEY) === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true)
    }
  }, [])

  function toggle() {
    setCollapsed((c) => {
      window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      return !c
    })
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={`keystone-paper-grain sticky top-0 hidden h-screen shrink-0 flex-col border-r border-ink/10 bg-paper-deep transition-[width] duration-200 md:flex ${
          collapsed ? 'w-[72px]' : 'w-[264px]'
        }`}
      >
        <div className={`flex items-center py-6 ${collapsed ? 'justify-center' : 'px-6'}`}>
          {collapsed ? (
            <Image src="/logo-mark.png" alt="Keystone" width={34} height={32} />
          ) : (
            <div>
              <Image src="/logo-full.png" alt="Keystone" width={126} height={88} />
              <div className="eyebrow mt-2">by {practiceName}</div>
            </div>
          )}
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const Icon = ICONS[item.icon]
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center gap-3 py-2.5 text-[0.92rem] transition-colors duration-200 ${
                  collapsed ? 'justify-center px-0' : 'px-6'
                } ${
                  active
                    ? 'bg-paper-raised font-medium text-forest'
                    : 'text-ink-dim hover:bg-paper-raised hover:text-ink'
                }`}
              >
                {active ? (
                  <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] bg-brass" />
                ) : null}
                <Icon size={18} strokeWidth={1.75} aria-hidden />
                {collapsed ? null : <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className={`border-t border-ink/10 py-4 ${collapsed ? 'px-2 text-center' : 'px-6'}`}>
          {collapsed ? null : (
            <>
              {clientName ? (
                <div className="mb-1 inline-block rounded-full border border-ink/15 px-2 py-0.5 text-xs text-ink-dim">
                  {clientName}
                </div>
              ) : null}
              <div className="truncate text-xs text-ink-dim">{personEmail}</div>
            </>
          )}
          <form action="/auth/signout" method="post" className={collapsed ? '' : 'mt-2'}>
            <button
              type="submit"
              aria-label="Sign out"
              className={`flex items-center gap-2 text-xs text-ink-dim transition-colors duration-200 hover:text-ink ${
                collapsed ? 'mx-auto' : ''
              }`}
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden />
              {collapsed ? null : <span>Sign out</span>}
            </button>
          </form>
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="mt-3 text-ink-dim transition-colors duration-200 hover:text-ink"
          >
            {collapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.75} />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.75} />
            )}
          </button>
        </div>
      </aside>

      {/* The 390px transform: bottom tab bar, five items max. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink/10 bg-paper-deep pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {items
          .filter((i) => i.mobile)
          .slice(0, 5)
          .map((item) => {
            const Icon = ICONS[item.icon]
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[0.65rem] ${
                  active ? 'font-medium text-forest' : 'text-ink-dim'
                }`}
              >
                {active ? (
                  <span aria-hidden className="absolute inset-x-3 top-0 h-[3px] bg-brass" />
                ) : null}
                <Icon size={20} strokeWidth={1.75} aria-hidden />
                <span>{item.label}</span>
              </Link>
            )
          })}
      </nav>
    </>
  )
}

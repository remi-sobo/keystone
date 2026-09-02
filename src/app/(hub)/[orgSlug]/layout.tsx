import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Abril_Fatface, Archivo, Space_Mono } from 'next/font/google'
import { getViewer } from '@/lib/membership'
import { createServerSupabase } from '@/lib/supabase/server'
import { hubThemeStyle, type HubVocabulary } from '@/lib/hubTheme'
import Door from '@/components/hub/Door'
import Wordmark from '@/components/hub/Wordmark'
import SectionNav from '@/components/hub/SectionNav'
import { signInToHub, signOutOfHub } from './actions'
import './hub-print.css'

/**
 * The client hub shell (specs/epayl-fundraising-hub.md).
 *
 * This layout is the whole architecture instruction: the hub renders
 * NONE of Keystone's chrome. No shared layout above it but the bare
 * root html/body, no Keystone sidebar, no Keystone type or color. It
 * is a full-bleed themed surface that happens to live at this route.
 *
 * The theme is a row: hub_orgs.theme resolves to CSS custom
 * properties on the wrapper here, and every component below reads
 * variables only. The fonts are the one build-time registration; the
 * theme maps its three roles onto the registered families.
 *
 * Signed out, the layout renders the org's own locked door (the one
 * deliberate pre-auth surface, presentation only, SECURITY.md).
 * Signed in without THIS org's membership, it redirects to the root
 * router, which sends every population to its own home: a hub member
 * has exactly one destination and no navigation that suggests
 * otherwise.
 */

const abril = Abril_Fatface({
  weight: '400',
  subsets: ['latin'],
  variable: '--hub-font-abril',
})
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--hub-font-archivo',
})
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--hub-font-space-mono',
})

export const metadata: Metadata = {
  title: 'Fundraising Hub',
  robots: { index: false, follow: false },
}

function hubWrapperStyle(theme: Record<string, unknown>): React.CSSProperties {
  return {
    // Font role defaults; a theme with a fonts map overrides them.
    ['--hub-font-display' as string]: 'var(--hub-font-abril)',
    ['--hub-font-body' as string]: 'var(--hub-font-archivo)',
    ['--hub-font-detail' as string]: 'var(--hub-font-space-mono)',
    ...hubThemeStyle(theme),
  }
}

export default async function HubLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}) {
  const { orgSlug } = await params
  const fontVars = `${abril.variable} ${archivo.variable} ${spaceMono.variable}`
  const viewer = await getViewer()

  if (!viewer.user) {
    // The door. A request with no session gets the org's name and
    // dress and NOTHING else: no figure, no count, no donor anything
    // exists in this response.
    const supabase = await createServerSupabase()
    const { data } = await supabase.rpc('keystone_hub_door', { p_slug: orgSlug })
    const org = Array.isArray(data) ? data[0] : null
    if (!org) notFound()
    return (
      <div className={`hub-root ${fontVars}`} style={hubWrapperStyle(org.theme ?? {})}>
        <Door
          vocabulary={(org.vocabulary ?? {}) as HubVocabulary}
          action={signInToHub.bind(null, orgSlug)}
        />
      </div>
    )
  }

  if (!viewer.hub || viewer.hub.orgSlug !== orgSlug) {
    // Signed in, but this is not their room. The root router sends
    // every population home; nothing here confirms what this slug is.
    redirect('/')
  }

  const vocab = viewer.hub.vocabulary as HubVocabulary
  const segments = vocab.wordmark ?? [{ text: viewer.hub.orgName }]

  return (
    <div
      className={`hub-root ${fontVars}`}
      style={{
        ...hubWrapperStyle(viewer.hub.theme),
        minHeight: '100vh',
        background: 'var(--hub-paper)',
        color: 'var(--hub-acid-black)',
        fontFamily: 'var(--hub-font-body)',
      }}
    >
      <header style={{ background: 'var(--hub-acid-black)', paddingTop: 32 }}>
        <div style={{ maxWidth: 1320, margin: '0 auto', padding: '0 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <form action={signOutOfHub}>
              <button
                type="submit"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--hub-stone)',
                  fontFamily: 'var(--hub-font-detail)',
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  padding: '6px 0',
                }}
              >
                Sign out
              </button>
            </form>
          </div>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 24,
              paddingBottom: 24,
            }}
          >
            <Wordmark segments={segments} tagline={vocab.tagline ?? 'Fundraising Hub'} size={19} />
            {vocab.intro ? (
              <p
                style={{
                  maxWidth: 520,
                  fontSize: 15,
                  lineHeight: 1.6,
                  color: 'var(--hub-bone-dim)',
                  margin: 0,
                }}
              >
                {vocab.intro}
              </p>
            ) : null}
          </div>
          <SectionNav orgSlug={orgSlug} />
        </div>
      </header>
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '34px 40px 80px' }}>
        {children}
      </main>
      <footer
        style={{
          maxWidth: 1320,
          margin: '0 auto',
          padding: '0 40px 40px',
          fontFamily: 'var(--hub-font-detail)',
          fontSize: 10,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'var(--hub-stone-ink)',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span>{vocab.door_footer ?? 'Not public · Not indexed'}</span>
        {/* The quiet overflow: never primary navigation. */}
        <a
          href={`/${orgSlug}/export`}
          style={{ color: 'var(--hub-gold-ink)', textDecoration: 'none' }}
        >
          Take everything with you · one zip
        </a>
      </footer>
    </div>
  )
}

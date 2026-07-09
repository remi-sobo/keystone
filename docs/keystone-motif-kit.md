# Keystone Motif Kit

## Design language

The authenticated app should borrow from the login art through architectural fragments, not repeated illustration.

The kit has five small pieces:

1. Keystone Wedge
2. Single Arch Line
3. Nested Arch Watermark
4. Corner Arch Fragment
5. Paper Grain Layer

Use these as React/CSS components across the app.

## 1. Keystone Wedge

Use this as the tiny signature mark.

Good places:

- next to section headers
- stage-complete markers
- current engagement state
- active detail on important cards
- divider ornament

```tsx
export function KeystoneWedge({
  className = '',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 28"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M4 2h16l-3 24H7L4 2Z"
        fill="var(--color-brass)"
      />
      <path
        d="M4 2h16l-3 24H7L4 2Z"
        stroke="var(--color-ink)"
        strokeOpacity="0.18"
        strokeWidth="1"
      />
    </svg>
  )
}
```

Usage:

```tsx
<KeystoneWedge className="h-3 w-3" />
```

Rule: small only. This should feel like a brass pin, not a logo.

## 2. Single Arch Line

This is the basic architectural line from the login artwork.

Good places:

- behind page headers
- empty states
- right rail cards
- loading/blank views

```tsx
export function SingleArchLine({
  className = '',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 240 320"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M40 320V120C40 75.8 75.8 40 120 40s80 35.8 80 80v200"
        stroke="var(--color-forest)"
        strokeOpacity="0.16"
        strokeWidth="2"
      />
      <path
        d="M72 320V126c0-26.5 21.5-48 48-48s48 21.5 48 48v194"
        stroke="var(--color-brass)"
        strokeOpacity="0.16"
        strokeWidth="1"
      />
    </svg>
  )
}
```

Usage:

```tsx
<SingleArchLine className="pointer-events-none absolute right-8 top-8 h-64 w-48" />
```

Rule: background only. Never let it compete with real content.

## 3. Nested Arch Watermark

This is the main continuity piece. It echoes the login illustration without copying it.

Good places:

- `RoomShell` background
- client home
- practice dashboard
- engagement detail page

```tsx
export function NestedArchWatermark({
  className = '',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 520 720"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M80 720V250C80 150.6 160.6 70 260 70s180 80.6 180 180v470"
        stroke="var(--color-forest)"
        strokeOpacity="0.10"
        strokeWidth="34"
      />
      <path
        d="M145 720V270c0-63.5 51.5-115 115-115s115 51.5 115 115v450"
        stroke="var(--color-sage)"
        strokeOpacity="0.10"
        strokeWidth="26"
      />
      <path
        d="M208 720V286c0-28.7 23.3-52 52-52s52 23.3 52 52v434"
        stroke="var(--color-navy)"
        strokeOpacity="0.07"
        strokeWidth="20"
      />
      <path
        d="M236 49h48l-8 76h-32l-8-76Z"
        fill="var(--color-brass)"
        fillOpacity="0.18"
      />
    </svg>
  )
}
```

Usage:

```tsx
<NestedArchWatermark className="pointer-events-none fixed -right-24 top-20 h-[720px] w-[520px]" />
```

Rule: opacity should feel almost like a watermark. It should be noticed only after a few seconds.

## 4. Corner Arch Fragment

This one is for special cards, empty states, and page sections.

Good places:

- latest deliverable card
- next session card
- empty states
- client home right rail
- proposal/digest cards

```tsx
export function CornerArchFragment({
  className = '',
}: {
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 220 180"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      <path
        d="M20 180V90C20 51.3 51.3 20 90 20s70 31.3 70 70v90"
        stroke="var(--color-forest)"
        strokeOpacity="0.13"
        strokeWidth="18"
      />
      <path
        d="M58 180V96c0-17.7 14.3-32 32-32s32 14.3 32 32v84"
        stroke="var(--color-brass)"
        strokeOpacity="0.18"
        strokeWidth="1.5"
      />
      <path
        d="M80 10h20l-3 36H83L80 10Z"
        fill="var(--color-brass)"
        fillOpacity="0.26"
      />
    </svg>
  )
}
```

Usage inside card:

```tsx
<div className="relative overflow-hidden rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5">
  <CornerArchFragment className="pointer-events-none absolute -right-10 -bottom-8 h-40 w-48" />
  <div className="relative">
    {/* card content */}
  </div>
</div>
```

Rule: use this on feature cards only, not every card.

## 5. Paper Grain Layer

This helps the app feel connected to the login illustration's printed-paper texture.

Add this globally or inside `RoomShell`.

```css
.keystone-paper-grain {
  position: relative;
}

.keystone-paper-grain::after {
  content: "";
  pointer-events: none;
  position: absolute;
  inset: 0;
  opacity: 0.28;
  background-image:
    radial-gradient(circle, rgba(42, 38, 32, 0.08) 0.6px, transparent 0.8px);
  background-size: 18px 18px;
  mix-blend-mode: multiply;
}
```

Rule: keep it subtle. If users notice "a pattern," it is too strong.

## The core wrapper: RoomShell

This is the big one. Claude Code should create this and use it across authenticated pages.

```tsx
import { NestedArchWatermark } from '@/components/keystone-motifs'

export function RoomShell({
  eyebrow,
  title,
  children,
  className = '',
}: {
  eyebrow?: string
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`keystone-paper-grain relative min-h-screen overflow-hidden bg-paper ${className}`}>
      <NestedArchWatermark className="pointer-events-none fixed -right-28 top-16 hidden h-[720px] w-[520px] lg:block" />

      <div className="relative mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12">
        {(eyebrow || title) ? (
          <header className="mb-10">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            {title ? (
              <h1 className="text-page-title mt-2 text-ink">
                {title}
              </h1>
            ) : null}
          </header>
        ) : null}

        {children}
      </div>
    </div>
  )
}
```

Then your current page:

```tsx
<div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
  <p className="eyebrow">The week</p>
  <h1 className="text-page-title mt-2 text-ink">Home</h1>
  ...
</div>
```

becomes:

```tsx
<RoomShell eyebrow="The week" title="Home">
  ...
</RoomShell>
```

That one change creates continuity everywhere.

## The upgraded card: KeystoneCard

```tsx
export function KeystoneCard({
  children,
  feature = false,
  className = '',
}: {
  children: React.ReactNode
  feature?: boolean
  className?: string
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-5 shadow-[var(--shadow-soft)] ${className}`}
    >
      {feature ? (
        <div
          aria-hidden="true"
          className="absolute left-5 right-5 top-0 h-px bg-gradient-to-r from-transparent via-brass/60 to-transparent"
        />
      ) : null}

      <div className="relative">{children}</div>
    </section>
  )
}
```

Usage:

```tsx
<KeystoneCard feature>
  <p className="eyebrow">Next session</p>
  <p className="mt-3 text-sm text-ink-dim">Nothing booked.</p>
</KeystoneCard>
```

## The empty state: ArchEmptyState

```tsx
import { SingleArchLine, KeystoneWedge } from '@/components/keystone-motifs'

export function ArchEmptyState({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius)] border border-ink/10 bg-paper-raised p-8 text-center shadow-[var(--shadow-soft)]">
      <SingleArchLine className="pointer-events-none absolute left-1/2 top-4 h-52 w-40 -translate-x-1/2 opacity-70" />

      <div className="relative mx-auto flex max-w-sm flex-col items-center">
        <KeystoneWedge className="h-4 w-4" />
        <h2 className="font-display mt-5 text-2xl font-medium text-ink">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-dim">
          {body}
        </p>
      </div>
    </div>
  )
}
```

Example:

```tsx
<ArchEmptyState
  title="Your first deliverable lands after kickoff."
  body="Once something is ready for review, it will appear here with the date, context, and next step."
/>
```

## Final Claude Code prompt

Give Claude this:

```text
We need to extend the login-page keystone artwork into the authenticated Keystone app as a restrained motif system.

Do not reuse the full login illustration throughout the app. Instead, translate its language into code-based components: arch linework, faint watermarks, a brass keystone wedge, paper texture, and subtle architectural fragments.

Create a new file:
src/components/keystone-motifs.tsx

Add these components:
- KeystoneWedge
- SingleArchLine
- NestedArchWatermark
- CornerArchFragment

Create:
src/components/RoomShell.tsx
src/components/KeystoneCard.tsx
src/components/ArchEmptyState.tsx

Use the exact existing design tokens:
--color-paper
--color-paper-raised
--color-paper-deep
--color-forest
--color-forest-deep
--color-navy
--color-ink
--color-ink-dim
--color-brass
--color-sage

Do not add new colors.

Add a subtle paper grain utility to globals.css:
.keystone-paper-grain

Use RoomShell on the main authenticated pages:
- practice today page
- client home page
- clients page
- engagements page
- sessions page
- homework page
- deliverables page
- library page
- messages page
- settings page

Replace repeated rounded border card classes with KeystoneCard where appropriate.

Use CornerArchFragment only on feature cards or empty states, not every card.

Use NestedArchWatermark once per RoomShell, fixed in the background, hidden on small screens if it hurts clarity.

Keep the app calm, professional, and expensive-feeling. It should feel like the interior of a luxury consulting room or architect's studio. The login artwork remains the strongest art moment. The authenticated app should feel connected, not decorated.
```

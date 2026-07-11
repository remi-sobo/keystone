# DESIGN.md

Spec section 6, distilled. Keystone should feel like walking into the architect's studio: warm paper, drawings pinned with intention, one brass detail. Calm, dense, quietly expensive. A stressed ED should exhale when it loads.

## Tokens (frozen by the config-integrity gate)

Ten tokens in the `@theme` block of `src/app/globals.css`. Resist more. No new colors without a spec change.

| Token | Value | Job |
|---|---|---|
| `--color-paper` | `#FBF4EA` | page canvas, the SOBO family cream |
| `--color-paper-raised` | `#FFFBF3` | cards, panels |
| `--color-paper-deep` | `#F3EADC` | sidebar, wells, hover fills |
| `--color-forest` | `#33503C` | primary structure, active states |
| `--color-forest-deep` | `#26402E` | hover/active of primary |
| `--color-navy` | `#3D4959` | ink for headings, secondary structure |
| `--color-ink` | `#2A2620` | body text, warm near-black, never `#000` |
| `--color-ink-dim` | `#6E675C` | secondary text, AA-checked on paper |
| `--color-brass` | `#B08D3E` | THE metallic: hairlines, keystone marks, focus glints, stage-complete ticks. Sparingly and only thin. |
| `--color-sage` | `#7A9471` | organic accent: progress fills, quiet success |

Brass is the expensive signal: rules, the active-nav tick, a focus ring glint, the dot on the wordmark. Never a fill.

## Type (three registers, each one job, never mixed)

- **Cormorant Garamond** (400/500/600, plus italic): page titles, engagement names, the big numerals (sessions held, deliverables shipped). The italic-serif signature: section headers set roman with one word italic in brass or forest.
- **Plus Jakarta Sans** (400/500/600/700): body, UI, tables, buttons.
- **JetBrains Mono** (400/500): eyebrows, stage labels (`DIAGNOSE / DESIGN / BUILD`), timestamps, file sizes, the footer micro-line. Mono is what makes it read engineered, not decorated.

Fluid tokens: `--text-page: clamp(1.9rem, 3.2vw, 2.6rem)` at 1.05 leading with negative tracking; eyebrows at `0.72rem`, `letter-spacing: 0.24em`, uppercase, mono (`.eyebrow`). Numerals in Cormorant at display sizes for the progress view (`.display-number`).

## The left sidebar (the room's spine)

- 264px fixed on desktop, collapsible to a 72px icon rail; state persisted per user. Background `--color-paper-deep`, a 1px warm hairline on its right edge, no shadow.
- Top: the full logo image (`/logo-full.png`, the green arch mark over the navy wordmark with the brass period); the mark alone (`/logo-mark.png`) on the collapsed rail. When SOBO is the practice, a small "by Sobo Consulting" mono micro-line beneath.
- Nav items: lucide icon plus Jakarta label at 0.92rem. Active state is NOT a filled pill: a 3px brass tick on the left edge, forest text, a whisper of `--color-paper-raised` fill. Hover raises the fill only.
- Client surface nav: Home, Sessions, Homework, Deliverables, Library, Messages. Practice surface adds Clients, Engagements, Library (authoring), Settings.
- Bottom: the signed-in person, a client name badge (client surface), a quiet "Message Remi" shortcut on the client side.

## The 390px commitment

The sidebar does not shrink on mobile, it transforms: a bottom tab bar, five items max, the active tab gets the brass tick on top. Every surface is verified at 390px before a ring counts as shipped. Shipped = deployed plus one real 390px run against live data, not merged plus green.

## Signature screens

- **Login** (the actual front door; the fee's first impression). Full-bleed paper canvas, the full Keystone logo image (`/logo-full.png`), one quiet Jakarta line beneath ("Where your engagement lives"), the email-first sign-in card on paper-raised with a hairline border, the logo dot-row watermark under 9% opacity behind. No marketing copy, no feature list, no stock imagery. "by Sobo Consulting" in mono in the footer. Auth-flow shape quarried from the Team Esface login; the skin is this system.
- **Client Home, the progress view** (the screen the $25k lives on). Engagement title in Cormorant. One row per workstream: name, then the five-stage arc as five connected segments; completed stages filled sage, the current stage stroked forest with the slow breathing pulse (2.4s, opacity only), future stages hairline. A brass keystone-shaped tick on any stage completed this week. Right rail: next session card, homework due, latest deliverable. The screen answers "where are we" in five seconds without jargon.
- **Session detail.** Date and attendees in mono eyebrow, decisions as a Cormorant-led block, action items as the work-spine card, the transcript folded behind a disclosure, prep resources surfaced above upcoming sessions.
- **Deliverables.** A vertical timeline down a brass hairline, newest first; each artifact a paper-raised card with kind icon, workstream tag in mono, delivered date. An unrolling of receipts for the fee, dense and proud.

## Motion (the vocabulary, and nothing outside it)

One easing everywhere, CSS and JS: `cubic-bezier(0.22, 1, 0.36, 1)` (`src/lib/motion.ts`, `--ease-keystone`).

- 250ms fade-rise section reveals (8px)
- 400ms left-to-right stage-fill sweep when a stage advances
- 200ms sidebar collapse
- button press `active:scale-[0.98]`
- optimistic homework check-off with a sage sweep
- ONE celebration: when a workstream reaches Stabilize, the arc glints brass once

No parallax. No loops; the breathing pulse is the sole exception and it dies under reduced motion. Everything renders complete and still under `prefers-reduced-motion`.

## Voice in the product

All UI copy passes the voice gate (`src/lib/voice.ts`): no em dashes, no banned words, warm and direct. Empty states do work: Deliverables empty reads "Your first deliverable lands after the kickoff session." Homework empty reads "Nothing due. See you Thursday." The voice sweep runs on AI output at the boundary (digest drafts, extracted action items) with the violation log. Stage displays stay descriptive, never scored; no red/yellow/green on a human or their org.

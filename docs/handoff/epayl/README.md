# Handoff: EPA Young Life Fundraising Hub

## Overview

A gated fundraising and finance workspace for Kendra Sobomehin, Area Director of East Palo Alto and East
Menlo Park Young Life. It ships at `soboconsulting.com/fundraising-hub/epayl` inside the existing
`remi-sobo/sobo-consulting` Next.js app.

It answers three questions on one page. What do I need to raise. Where is it coming from. What do I do
this week. It is a planning tool, not a ledger. BloomOS and Young Life Connect stay the system of record
for gifts.

## About the design files

`Fundraising Hub.dc.html` in this bundle is a **design reference built in HTML**, not production code.
It runs standalone in a browser and shows the intended look, copy, and behavior with real data loaded.
Do not port the file. Recreate it in the repo's existing environment: Next.js App Router, React server
components by default, Tailwind v4 with tokens in the `@theme` block of `src/app/globals.css`, content in
typed modules under `src/content`, per `CLAUDE.md` and `docs/architecture.md`.

`spec-epayl-fundraising-hub.md` is the build spec. It is written in the repo's spec format and should land
at `specs/epayl-fundraising-hub.md`. It carries the data model, the auth decision, the parsing rules, and
the six-phase build order. **Read it first.** This README covers the UI; the spec covers the system.

`epa-prospects.js` is the parsed Young Life donor export, 100 households, the seed data the design runs on.

## Fidelity

**High fidelity.** Colors, type, spacing, and copy are final. The visual system is the EPA Young Life
design system ("Acid Wash Gospel"), already documented in the repo's sibling design-system project. Every
value below is exact.

One caution: the copy is not placeholder. It was written to a strict voice, described below. Do not
rewrite it to sound more like a nonprofit.

## Design tokens

Colors, all used as CSS custom properties in the reference file:

```
--acid-black        #211F1C   ground for loud surfaces, header, locked screen
--acid-black-raised #2B2823   raised panels on black
--bone              #E9E1D1   type on black
--bone-dim          #CFC6B2   secondary type on black
--paper             #F2EBDB   ground for the working surface
--paper-raised      #F7F1E4   cards and panels on paper
--gold              #C9A03F   accent on black, 3px section rules, active tab
--gold-ink          #A8842C   accent on paper, section labels
--forest            #2C4736
--forest-ink        #21402E   positive states, donor-facing quoted lines
--terracotta        #B4553A   gaps, overdue, unsettled numbers
--stone             #9C927D   muted type on black
--stone-ink         #8A8171   muted type on paper
--line-on-black     #3A362F   1px hairlines on black
--line-on-paper     #D8CDB4   1px hairlines on paper, bar tracks
```

Rules that matter: never pure black or pure white. Gold behaves like a foil stamp, small marks and rules,
never a background fill except the active tab and primary buttons. Terracotta stays small. Corners are
square everywhere. No drop shadows, no gradients, no rounded anything.

Type:

```
Display   Abril Fatface, line-height .98 to 1.05, uppercase, letter-spacing .005em
          42px section heads, 26 to 34px card heads, 22px inline
Body      Archivo, 400 / 600 / 700
          16 to 17px lead paragraphs, 14 to 15px body, line-height 1.6
Detail    Space Mono, uppercase, letter-spacing .18 to .2em
          10 to 12px labels, dates, all money figures and stats
```

Money is always Space Mono. Section labels are always Space Mono uppercase in gold-ink. Headlines are
always Abril Fatface uppercase.

Spacing: 40px page gutters, max width 1320px, 44px between the two columns on Start here, 34px between
task groups, 12 to 16px inside cards, 8 to 10px between stacked rows.

## Design system components

The reference mounts real components from the bound design system bundle. In the Next app, recreate these
as React components with the same props:

- `Wordmark({volume, size, inline, tagline})`: the campaign name set in Abril Fatface with "So Loved" in
  gold. There is no logo file. The wordmark is the mark. Used in the header at size 19 inline with tagline
  "Fundraising Hub", and on the locked screen. Needs a container at least 480px wide or the tagline
  collides with the wrapped second line.
- `Stat({value, label, trust, volume})`: display-size figure over a mono uppercase label, with an
  optional trust clause in gold after a middle dot.
- `Card({volume, raised, rule})`: 1px hairline box, optional 3px gold top rule.
- `Tag({tone, volume})`: mono uppercase pill with a hairline border. Tones: gold, muted, terracotta.
- `Button({variant, volume, size, onClick})`: variants primary (gold fill), outline, ghost. Hover shifts
  color only, no scale or shadow.

## Screens

### 1. Locked screen

Full-viewport acid-black. Centered column, max 520px. Wordmark, 60px gold rule, then:

- Headline, Abril 34px uppercase bone: "This page is for East Palo Alto Young Life leadership"
- Body, 15px bone-dim: explains the magic link in plain words
- One email field on `--acid-black-raised` with a hairline border
- Primary gold button: "Send me the link"
- Footer, mono 10px stone: "Not public · Not indexed · Kendra and Remi only"

No password field, no hint, no numbers. Nothing about the ministry's finances appears in the HTML
response before auth. That is a hard requirement, see the spec.

### 2. Link sent screen

Same shell. "Check your email." Copy reads: "If {email} is on the list, a sign-in link is on its way."
An address not on the allowlist sees this exact screen and gets no email. The page never confirms who has
access.

The reference includes a simulated inbox panel so the flow can be demoed. **Do not build that.** It exists
only so Remi can show Kendra what happens.

### 3. Signed-in header, on every tab

Acid-black, 32px top padding, max 1320px.

- Top row, right aligned: primary "Log a gift" button, ghost "Sign out"
- Wordmark left, at size 19 in a 480px min-width container; intro paragraph right, max 520px
- Six Stat tiles in a 1px-gapped grid on `--line-on-black`, each clickable, each with a mono gold
  "What this means" affordance at the bottom:
  1. To raise this year: $199,245
  2. In so far this year: sum of logged cash gifts
  3. Promised, not in yet: sum of logged pledges
  4. Last year's donors: $108,187, 11 households, verified
  5. Still to find: goal minus cash minus pledges
  6. In the bank: $28,295, stated not reconciled
- Tab strip: 13 tabs, mono 11px uppercase, hairline borders, active tab is gold fill with black type,
  sitting on a 3px gold rule

### 4. Stat explainer modal

Clicking any stat opens a centered modal, max 660px, on a `rgba(33,31,28,.86)` scrim. Black header band
with the label and the figure; paper body with a bold one-line summary, two or three plain-language
paragraphs, a "The numbers behind it" table, and a trust line in mono at the bottom. Click the scrim or
Close to dismiss.

This is the educational layer. Kendra is not a development officer. Every big number explains itself.

### 5. Tabs

Thirteen: Start here, To do, Budget, Gift table, Donors, Prospects, Donor research, Monthly, Brunch,
Grants, Churches, Calendar, Stewardship.

**Start here**: two columns, 1.25fr / 1fr. Left: the year in one sentence, a two-segment goal bar
(black for what is committed, terracotta for the gap), and the seven income strands as labeled bars.
Right: "The next thing" card showing the single highest-priority open task, three area count chips, a
primary button to the to-do list, and a terracotta-labeled warning about the cash calendar.

**To do**: the task surface. Tasks are grouped by area, each group headed by a mono label on a 3px gold
rule with a count, and **each group shows only three at a time.** Check one off and the next in that group
appears. A "Show everything" ghost button expands all groups. Below: an add box, an area count strip, and
a collapsed done list. Task rows are 22px checkboxes plus title, reason, and a mono "when · owner" line.

**Budget**: two columns. Left: expense breakdown with bars, then the gross-up table showing how $191,869
of cost becomes a $199,245 goal. Right: a 12-bar cumulative cash-out chart with a gold line at the
$28,295 opening balance and bars turning terracotta past it, the functional-expense split bar, and the
three-year arc. Below, full width: six unsettled-number cards each tagged with a trust level, then the
"What a gift pays for" table with full cost and direct cost columns.

**Gift table**: 55 gifts across seven levels, each row showing count, subtotal, names needed at three
candidates per intended gift, and a coverage bar.

**Donors**: the 11 households that gave last year, expandable. Collapsed row: name, a seven-bar giving
sparkline, last gift, ask, next step. Expanded: a facts column from the export, a "why they give" column,
and an editable notes and next-step column.

**Prospects**: the 100-name export, searchable, with five filter buttons. Same expand pattern, plus a
plain-language read of what the record means and a caution line about contact flags.

**Donor research**: the ten-section profile. Gary and Michelle Dillabough is built out as the working
example and the schema reference. Sections: the short version, what is public, capacity ladder,
relationship read, the case that lands, ten questions to ask, six proposal options as cards, the first
move, the sequence, and the exact words to use. Below, a queue of six profiles still to write.

**Monthly, Brunch, Grants, Churches, Calendar, Stewardship**: all render from one generic page shape:
a headline, a lead paragraph, then blocks that are either a four-column table, a paragraph, or a row of
stat cards.

Every tab except Start here and To do ends with a quick-add box that files a to-do under that tab's label
automatically.

### 6. Log a gift

A panel that drops from the header. Six fields: who gave, how much, when, cash in hand or pledged, which
strand it came through, what it is for. On save it updates the stat tiles, appends to a running gift list
on Start here, and generates tasks. That generation is the point of the feature:

- Cash gift: a thank-you task, due in 7 days, marked overdue if the gift date is older
- Cash gift over $10,000: also a report task, due in 90 days
- Gift marked for camp: a task to confirm it was designated camp, since camp gifts skip the 17 percent
- Pledge: a task to get the amount and date in writing

## Interactions

- Tab switching is client state, no navigation
- Stat click opens the modal; scrim click or Close dismisses
- Donor and prospect rows expand in place; multiple can be open
- Checkboxes, notes, next steps, added donors, added prospects, logged gifts, and to-dos all persist
  (localStorage in the reference; Supabase in production, see the spec)
- No animation anywhere. This is a print-first brand. If motion is added, opacity fades only.
- Hover: links and buttons shift color, gold to bone or bone to gold. No scale, no shadow.

## State

Reference state, which maps to the spec's tables:

```
auth        locked | sent | open           -> Supabase session
tab         current tab id                 -> URL segment or client state
logged      array of gift entries          -> hub_gifts + hub_touches
todos       array of manual tasks          -> hub_tasks (source: manual)
checks      map of taskKey -> done         -> hub_tasks.done_at
notes       map of donorKey -> text        -> hub_donors notes / hub_touches
nexts       map of donorKey -> text        -> hub_tasks tied to a donor
extraDonors added by hand                  -> hub_donors (source: manual)
extraPros   added by hand                  -> hub_donors (status: prospect)
```

Derived, never stored: the gap, the coverage percentages, the runway, the auto-generated tasks. Compute
them. Storing a derived number is how the numbers start disagreeing.

## Voice

Every word follows the EPA Young Life house voice, and it is stricter than usual because the audience is
one person who is not a fundraiser:

- Plain, short, declarative. Explain the thing, do not perform it.
- No em dashes. Contractions always.
- Never describe the community by what it lacks. No "at-risk," "underserved," "give back."
- Every number carries its trust level: verified, estimated, stated, or placeholder. Never fill a gap with
  a plausible figure. A blank is better than a guess.
- No nonprofit development jargon. "Moves management" and "cultivation" do not appear anywhere a user can
  see.
- No emoji, no icons. Typographic marks only: the gold middle dot, mono labels, gold rules.

## Assets

None. No images, no icons, no logo files. The wordmark is set in type. Fonts are Abril Fatface, Archivo,
and Space Mono, already available in the design system's `assets/fonts` and loadable through `next/font`.

## Files in this bundle

- `Fundraising Hub.dc.html`: the design reference, opens in any browser
- `spec-epayl-fundraising-hub.md`: the build spec, belongs at `specs/` in the repo
- `epa-prospects.js`: parsed Young Life export, 100 households, the seed data

## Where to start

Read the spec's build order. Phase one is the gate and the shell, phase two is donors and gifts. Those two
phases are the whole product in miniature, and if work stops after them Kendra still has something better
than four disconnected spreadsheets.

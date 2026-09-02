# EPA Young Life art direction, "Acid Wash Gospel"

DERIVED DOCUMENT. The build prompt names `art-direction.md` as a committed
spec, but the file did not arrive in the handoff bundle. This version is
assembled from the handoff README's design token and screen sections, which
carry the exact values, and from the visual reference at
`docs/handoff/epayl/fundraising-hub.dc.html`. When the original arrives it
replaces this file wholesale.

The hub wears this system and shares nothing with Keystone's. Keystone's ten
tokens stay frozen in `src/app/globals.css`; the hub's tokens live in
`hub_orgs.theme` and resolve to CSS custom properties at the hub layout.
No hex value appears in a hub component, ever.

## Tokens (exact, seeded as the first org theme)

```
--hub-acid-black        #211F1C   ground for loud surfaces, header, locked screen
--hub-acid-black-raised #2B2823   raised panels on black
--hub-bone              #E9E1D1   type on black
--hub-bone-dim          #CFC6B2   secondary type on black
--hub-paper             #F2EBDB   ground for the working surface
--hub-paper-raised      #F7F1E4   cards and panels on paper
--hub-gold              #C9A03F   accent on black, 3px section rules, active section
--hub-gold-ink          #A8842C   accent on paper, section labels
--hub-forest            #2C4736   positive states
--hub-forest-ink        #21402E   donor-facing quoted lines
--hub-terracotta        #B4553A   gaps, overdue, unsettled numbers
--hub-stone             #9C927D   muted type on black
--hub-stone-ink         #8A8171   muted type on paper
--hub-line-on-black     #3A362F   1px hairlines on black
--hub-line-on-paper     #D8CDB4   1px hairlines on paper, bar tracks
```

Rules that matter: never pure black or pure white. Gold behaves like a foil
stamp, small marks and rules, never a background fill except the active
section and primary buttons. Terracotta stays small. Corners are square
everywhere. No drop shadows, no gradients, no rounded anything.

## Type

```
Display   Abril Fatface, line-height .98 to 1.05, uppercase, letter-spacing .005em
          42px section heads, 26 to 34px card heads, 22px inline
Body      Archivo, 400 / 600 / 700
          16 to 17px lead paragraphs, 14 to 15px body, line-height 1.6
Detail    Space Mono, uppercase, letter-spacing .18 to .2em
          10 to 12px labels, dates, all money figures and stats
```

Money is always Space Mono. Section labels are always Space Mono uppercase in
gold-ink. Headlines are always Abril Fatface uppercase. There is no logo file;
the wordmark is set in type, with "So Loved" in gold.

## Spacing

40px page gutters, max width 1320px, 44px between the two columns on the home
surface, 34px between task groups, 12 to 16px inside cards, 8 to 10px between
stacked rows.

## Motion

None. This is a print-first brand. If motion is ever added, opacity fades
only. Hover shifts color only, gold to bone or bone to gold. No scale, no
shadow.

## The theme layer

The values above are EPA's, and they are data, not code. `hub_orgs.theme`
holds the full token set; the hub layout resolves it to CSS custom properties
scoped to the org route; components read variables only. The one theme
element that needs a code touch for a future org is the font registration,
because next/font loads at build time; the theme maps font roles onto the
registered families. The second client's hub should be a row in a table, not
a branch in the code.

import type { DeckMeta, DeckSlide } from './types'

/**
 * lib/deck/session1.ts
 *
 * Session 1's fourteen slides, verbatim from the standalone teaching
 * deck (SafeSpace_Session01_Teaching.html, the build_deck.py output).
 * This is the static fixture GATE 3 compares against the HTML file, and
 * the source the seed graduates into session_slides rows. Typographic
 * apostrophes and the hair space in the meta time are preserved exactly.
 */

export const session1Meta: DeckMeta = {
  footerLeft: 'SOBO × SafeSpace',
  program: 'The Six-Month Build',
  sessionNumber: '01',
}

export const session1Slides: DeckSlide[] = [
  {
    slide_type: 'cover',
    eyebrow: 'The Six-Month Build',
    title: 'Session One',
    subtitle: 'Getting set up, and the executive mindset.',
    meta_left: 'SafeSpace',
    meta_right: 'SOBO',
    meta_when: 'Tuesday, 1:00 PM',
  },
  {
    slide_type: 'agenda',
    eyebrow: 'Today',
    title: 'What we’ll do today',
    items: [
      'Get set up in Keystone, where we track the work together',
      'Walk the map: the six-month scope and sequence',
      'The executive mindset, our teaching for today',
      'Begin the learning phase, department by department',
    ],
    footnote: 'Your pre-work went out in the welcome email.',
  },
  {
    slide_type: 'section',
    num: '01',
    title: 'Where we’re headed',
  },
  {
    slide_type: 'tracks',
    eyebrow: 'The Shape of It',
    title: 'Two tracks, braided together',
    tracks: [
      { label: 'Build', chips: ['Program plan', 'Budget', 'Fundraising plan', 'Operations'] },
      {
        label: 'Reps',
        alt: true,
        chips: ['Donor journeys', 'Live asks', 'Weekly pitch', 'Working the season'],
      },
    ],
    note: 'We build the system in order. We practice from week two. You need both.',
  },
  {
    slide_type: 'loop',
    eyebrow: 'Every Week',
    title: 'The same loop, every session',
    steps: ['Philosophy', 'Build', 'Rhythm', 'Homework', 'Review'],
    note: 'Six months of this, and the pieces add up to the whole system.',
  },
  {
    slide_type: 'section',
    num: '02',
    title: 'The executive mindset',
  },
  {
    slide_type: 'idea',
    eyebrow: 'Mindset 01',
    head: 'A nonprofit is still a business.',
    sup: 'The only difference: you don’t own it, and you can’t profit from it personally. You still have to bring money in.',
  },
  {
    slide_type: 'idea',
    eyebrow: 'Mindset 02',
    head: 'You carry a double bottom line.',
    sup: 'Impact and dollars. Almost everything you do has to serve both. That’s the job, and it’s harder than either one alone.',
  },
  {
    slide_type: 'idea',
    eyebrow: 'Mindset 03',
    head: 'From program leader to executive.',
    sup: 'A different role, not just a higher one. It’s the step the two of you said you want to make.',
  },
  {
    slide_type: 'idea',
    eyebrow: 'Mindset 04',
    head: 'The donor is a partner.',
    sup: 'You bring the work, they bring the funding, and you both want the same outcome. There’s no power dynamic. You’re in the same boat.',
  },
  {
    slide_type: 'section',
    num: '03',
    title: 'The learning phase',
    sub: 'We’ll walk every department, program, fundraising, finance, impact, through one lens: what does a fundraiser need to understand here?',
  },
  {
    slide_type: 'idea',
    eyebrow: 'Our Workspace',
    head: 'Keystone is where we work together.',
    sup: 'You’ll see the workstreams, the notes, and every artifact we build, in one place. We set it up today.',
  },
  {
    slide_type: 'homework',
    eyebrow: 'This Week',
    title: 'Before we meet again',
    rows: [
      {
        who: 'Everyone',
        task: 'A current-state brain dump: your program, and the relationships that matter most.',
      },
      { who: 'Susan', task: 'Pull the top-donor list so we can start mapping it Thursday.' },
      { who: 'Thursday', task: 'Come ready to build.' },
    ],
  },
  {
    slide_type: 'close',
    line1: 'It’s usually not the heart.',
    line2: 'It’s the system.',
    attr: 'See you Thursday.',
  },
]

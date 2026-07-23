import type { DeckMeta, DeckSlide } from './types'

/**
 * lib/deck/session2.ts
 *
 * Session 2's twenty-one slides, verbatim from the standalone teaching
 * deck (SafeSpace_Session02_Teaching.html, the v2 file for the Jul 23
 * session). The source the seed graduates into session_slides rows,
 * the session1.ts discipline. One layout note lives in the seed
 * header: the sort slide's big-chip flow rides the tracks layout with
 * an empty label, content verbatim, layout approximate.
 */

export const session2Meta: DeckMeta = {
  footerLeft: 'SOBO × SafeSpace',
  program: 'The Six-Month Build',
  sessionNumber: '02',
}

export const session2Slides: DeckSlide[] = [
  {
    "slide_type": "cover",
    "eyebrow": "The Six-Month Build",
    "title": "Session Two",
    "subtitle": "The three-year program plan starts today.",
    "meta_left": "SafeSpace",
    "meta_right": "SOBO",
    "meta_when": "Thursday, 3:00 PM"
  },
  {
    "slide_type": "idea",
    "eyebrow": "The Ritual",
    "head": "Start with a win.",
    "sup": "One each, from the last two days. Small counts. This is how every session opens from now on."
  },
  {
    "slide_type": "agenda",
    "eyebrow": "Today",
    "title": "What we’ll do today",
    "items": [
      "Your baseline: the check-in and your first pitch",
      "Your organization, in your words",
      "The teaching: fewer things, done well",
      "The sort: everything you do, on the wall",
      "Five answers I can’t write the plan without",
      "Your Bloom"
    ]
  },
  {
    "slide_type": "idea",
    "eyebrow": "Baseline · Do",
    "head": "Your first pitch.",
    "sup": "Sixty seconds each: what does SafeSpace do, and why does it matter? No notes. Rough is the point, this is the before picture."
  },
  {
    "slide_type": "section",
    "num": "01",
    "title": "What we heard",
    "sub": "Your organization, in your words."
  },
  {
    "slide_type": "idea",
    "eyebrow": "The Mirror",
    "head": "Here’s what you told us.",
    "sup": "I’ll walk it back department by department. Stop me where I’m wrong, add what we missed. What you confirm today is what the plan gets built from."
  },
  {
    "slide_type": "section",
    "num": "02",
    "title": "The teaching",
    "sub": "Fewer things, done well."
  },
  {
    "slide_type": "idea",
    "eyebrow": "Program 01",
    "head": "The mission is the mission. How we get there is the question.",
    "sup": "Nobody here needs convincing that SafeSpace matters. The question is which few things you’ll do so well that funders keep paying for them."
  },
  {
    "slide_type": "idea",
    "eyebrow": "Program 02",
    "head": "Do fewer things, done well.",
    "sup": "Sprawl burns out a small team and blurs the story. Nobody funds twelve things. A flagship focuses your money, your people, and your pitch."
  },
  {
    "slide_type": "idea",
    "eyebrow": "Program 03",
    "head": "You can’t budget what you haven’t defined.",
    "sup": "Next week Shannon builds your three-year budget. She can’t price a program nobody has defined. That’s why today comes first."
  },
  {
    "slide_type": "section",
    "num": "03",
    "title": "The sort",
    "sub": "Everything you do, on the wall."
  },
  {
    "slide_type": "tracks",
    "eyebrow": "Build · Do",
    "title": "Everything on the wall.",
    "tracks": [
      {
        "label": "",
        "chips": [
          "Flagship",
          "Core",
          "Supporting",
          "Release",
          "Not sure"
        ]
      }
    ],
    "note": "Your full list, all of it. We sort it together, and nothing gets released today without the reason said out loud."
  },
  {
    "slide_type": "section",
    "num": "04",
    "title": "Five answers",
    "sub": "What I can’t write the plan without."
  },
  {
    "slide_type": "idea",
    "eyebrow": "Answer 01 · The floor",
    "head": "What does every SYAB member get, guaranteed?",
    "sup": "Not what varies. What’s promised. Hours, weeks, and what they walk out with."
  },
  {
    "slide_type": "idea",
    "eyebrow": "Answer 02 · The shape",
    "head": "Deeper, or wider?",
    "sup": "Same schools, done deeper. Or more schools. Pick one."
  },
  {
    "slide_type": "idea",
    "eyebrow": "Answer 03 · Who delivers",
    "head": "How much of this should the kids run?",
    "sup": "Susan said eighty percent, once. Is seventy-five the three-year target, or was that thinking out loud?"
  },
  {
    "slide_type": "idea",
    "eyebrow": "Answer 04 · The ceiling",
    "head": "At what number does each program break?",
    "sup": "Kids, schools, events in a month. The number where it stops working."
  },
  {
    "slide_type": "idea",
    "eyebrow": "Answer 05 · The leak",
    "head": "A student does one workshop. Then what?",
    "sup": "Right now it ends there. On purpose, or a gap you’d close if you could?"
  },
  {
    "slide_type": "idea",
    "eyebrow": "Your System",
    "head": "Your Bloom.",
    "sup": "A first look at yours, built from your own words this week. We’ll live in it together from here."
  },
  {
    "slide_type": "homework",
    "eyebrow": "This Week",
    "title": "Before Tuesday",
    "rows": [
      {
        "who": "Everyone",
        "task": "The draft program plan lands tomorrow. Read it Monday. Mark what’s wrong, what’s missing, and what you won’t commit to for three years."
      },
      {
        "who": "Susan",
        "task": "The financials package for Shannon: last two years of actuals and the current budget. The three-year budget starts next week."
      },
      {
        "who": "Aris & Jasmine",
        "task": "Pitch practice, five minutes together. Rep three."
      }
    ]
  },
  {
    "slide_type": "close",
    "line1": "Fewer things.",
    "line2": "Done well. Funded fully.",
    "attr": "See you Tuesday."
  },
]

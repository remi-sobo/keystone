# CURRENT.md

The live operational doc. If it is happening and it is not here, it is not happening. Weekly ritual per SOBO_PLAYBOOK.md section 8.

Last updated: 2026-07-08 (Ring 0).

## State

- **Ring 0 (Preflight): in progress on branch `claude/nextjs-setup-verify-w0b2qx`.** Scaffold, platform layer, design tokens, operating docs, agents, and CI gate scaffolds landing as staged commits. Findings in `docs/keystone-preflight.md` (opens with FLAGS; review them before Ring 1).
- Engagement status: proposal out to SafeSpace, decision expected Thu Jul 9. Ring 1 should land at kickoff, not after it.
- Vercel project and Supabase project: not yet provisioned (Ring 0 is repo-only; provision before Ring 1 ships).

## The ring queue

| Ring | Contents | Status |
|---|---|---|
| 0 | Preflight: repo, platform layer, tokens, docs, agents, gate scaffolds, preflight doc | in progress |
| 1 | The spine: practices, clients, members, email-keyed invites, engagements, workstreams with the parallel arc, stage events, permission authority, RLS, the seeded cross-practice and cross-client isolation matrix, sidebar shell both surfaces, client progress view, login page, "Client Login" nav PR in sobo-consulting | queued (blocked on FLAG review + spec amendments) |
| 2 | Sessions and scheduling: availability windows, slot picking, Google Calendar OAuth, tz-correct sync, reschedule | queued |
| 3 | Notes and homework: paste transcript, AI proposes (inert), consultant accepts, client checks off, review queue, session detail, readiness panel | queued |
| 3.5 | Practice Home, the Monday screen | queued |
| 4 | Deliverables and library | queued |
| 5 | Messages plus Resend notifications | queued |
| 6 | The weekly digest (cron, approval queue, refuses an empty week) | queued |

Then stop and run SafeSpace on it for two weeks before any Ring 7 talk.

## CONFIRM gates (nothing ships assumed)

The spec numbers these 1 through 12 and 14; there is no gate 13 in the spec (flagged in the preflight doc).

| # | Question | Status |
|---|---|---|
| 1 | Domain: app.soboconsulting.com, or a keystone domain from day one? | open |
| 2 | SafeSpace logins: susan@, liesl@, aris@, jasmine@ (all safespace.org); confirm the four and whether anyone else joins | open |
| 3 | Library access after the engagement ends: keeps or lapses? | open |
| 4 | Shannon: practice login in v1? | open |
| 5 | SafeSpace workstream names: confirm or rename with the client's language (spec lists five seeds but the gate says "the four seeded above"; flagged) | open |
| 6 | Digest day and hour (proposal: Friday 3pm Pacific) | open |
| 7 | Name clearance: trademark plus domain check on "Keystone" before public use | open |
| 8 | Session locations: video link source (Meet from the calendar event, or Zoom)? | open |
| 9 | Fee visibility: does the engagement show the $25,000 anywhere in-app, or never? | open |
| 10 | Liesl's posture: full login plus digest, or digest-first given the advisory move? | open |
| 11 | Stall threshold: three weeks proposed; twice-weekly month-one cadence may want two | open |
| 12 | Readiness notes: consultant-only forever, or shareable per note as a deliberate act? | open |
| 14 | Nav label on soboconsulting.com: "Client Login" until gate 7 clears | open |

## Blocked

- Ring 1 start: blocked on FLAG review in `docs/keystone-preflight.md` and any spec amendments where the flags win.
- Domain wiring: blocked on CONFIRM 1.

## Recently shipped

- Nothing yet. Ring 0 commits land on this branch; this section starts filling when Ring 0 merges.

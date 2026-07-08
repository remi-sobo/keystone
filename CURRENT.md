# CURRENT.md

The live operational doc. If it is happening and it is not here, it is not happening. Weekly ritual per SOBO_PLAYBOOK.md section 8.

Last updated: 2026-07-08 (Ring 1 built).

## State

- **Ring 0 (Preflight): done.** Findings in `docs/keystone-preflight.md`; FLAGS reviewed, spec amended where they won (`ring1: spec amendments`).
- **Ring 1 (The spine): BUILT on branch `claude/nextjs-setup-verify-w0b2qx`, not yet shipped.** Schema, permission authority, RLS, the seeded cross-practice AND cross-client matrix (passing live against a scratch Postgres 16), login (magic link + email-keyed claim), the sidebar shell on both surfaces, the client progress view, and the SafeSpace seed. Merged + green is not shipped: shipped needs the Supabase and Vercel projects provisioned, migrations + seed applied, a deploy, and one real 390px run against live data. The login page has had a real 390px render locally (screenshot in the session); the data screens render empty states until a live project exists.
- Engagement status: proposal out to SafeSpace, decision expected Thu Jul 9.
- **Still owed before "shipped": provision Supabase + Vercel, set env vars, apply `0001_keystone_spine.sql` and `supabase/seed.sql`, configure the Supabase auth email redirect to `/auth/callback`, deploy, run the 390px pass on live data.**
- The "Client Login" nav link on soboconsulting.com is a one-line PR in that repo; it ships as its own separately approved change (spec section 10 note), not from this session.

## The ring queue

| Ring | Contents | Status |
|---|---|---|
| 0 | Preflight: repo, platform layer, tokens, docs, agents, gate scaffolds, preflight doc | done |
| 1 | The spine: practices, clients, members, email-keyed invites, engagements, workstreams with the parallel arc, stage events, permission authority, RLS, the seeded cross-practice and cross-client isolation matrix, sidebar shell both surfaces, client progress view, login page | built; deploy owed |
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

- Ring 1 "shipped": blocked on Supabase + Vercel provisioning (a cost and account decision, not a code task).
- Domain wiring: blocked on CONFIRM 1 (`src/lib/env.ts` is the one-file change).
- Invite sends: blocked on CONFIRM 2 (the seeded SafeSpace emails are the spec's proposal).

## Recently shipped

- Nothing deployed yet. Built on this branch, in order: `ring0: platform layer` through `ring0: preflight findings`, `ring1: spec amendments`, `ring1: the spine schema, permission authority, and seeded isolation matrix`, `ring1: login, shell, and the client progress view`. The live RLS matrix passes against a scratch Postgres 16; all 35 static gate assertions pass; build and typecheck green.

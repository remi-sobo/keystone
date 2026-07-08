# CURRENT.md

The live operational doc. If it is happening and it is not here, it is not happening. Weekly ritual per SOBO_PLAYBOOK.md section 8.

Last updated: 2026-07-08 (Ring 2 built; infrastructure live).

## State

- **Ring 0 (Preflight): done.** Findings in `docs/keystone-preflight.md`.
- **Ring 1 (The spine): built and applied to live infrastructure.** The pre-provisioned Supabase project (`keystone`) carries migrations 0001, 0002, and the SafeSpace seed (1 practice, 3 practice members, 1 client, 4 client members, 1 engagement, 5 workstreams). The pre-provisioned Vercel project (`keystone`, git-linked to this repo) builds previews from this branch with the public env values in vercel.json.
- **Ring 2 (Sessions and scheduling): built.** Migration 0003 applied locally and in CI; sessions, availability windows, the encrypted Google connection store, the pure slot engine (DST-pinned unit tests), client booking/reschedule/cancel (pure RLS plus the DB exclusion constraint), practice settings (windows, connect, sync).
- Engagement status: proposal out to SafeSpace, decision expected Thu Jul 9.

## Manual dashboard steps owed (nothing else blocks the 390px live run)

1. Supabase auth: set the Site URL to the production domain and add the Vercel URLs (`https://keystone-blue-tau.vercel.app/**` and the preview pattern) to the auth redirect allow-list, so magic links land on `/auth/callback`.
2. Vercel env (server-only, dashboard): `SUPABASE_SERVICE_ROLE_KEY` (rate limiting, audit, calendar), and before their rings: `KEYSTONE_TOKEN_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `CRON_SECRET`.
3. Merge this branch to `main` when reviewed: the Vercel production domain builds from main.
4. The "Client Login" nav link on soboconsulting.com stays a separately approved one-line PR in that repo.

## The ring queue

| Ring | Contents | Status |
|---|---|---|
| 0 | Preflight: repo, platform layer, tokens, docs, agents, gate scaffolds, preflight doc | done |
| 1 | The spine: practices, clients, members, email-keyed invites, engagements, workstreams with the parallel arc, stage events, permission authority, RLS, the seeded cross-practice and cross-client isolation matrix, sidebar shell both surfaces, client progress view, login page | built; live DB seeded; 390px live run owed |
| 2 | Sessions and scheduling: availability windows, slot picking, Google Calendar OAuth, tz-correct sync, reschedule | built; Google end-to-end run owed (needs env) |
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

- The live 390px data run: blocked on manual step 1 above (auth redirect allow-list), then any seeded email can sign in with a magic link.
- Calendar end-to-end: blocked on manual step 2 (Google OAuth creds + token secret).
- Domain wiring: blocked on CONFIRM 1 (`src/lib/env.ts` is the one-file change).
- Invite sends: blocked on CONFIRM 2 (the seeded SafeSpace emails are the spec's proposal).

## Recently shipped

- Nothing deployed yet. Built on this branch, in order: `ring0: platform layer` through `ring0: preflight findings`, `ring1: spec amendments`, `ring1: the spine schema, permission authority, and seeded isolation matrix`, `ring1: login, shell, and the client progress view`. The live RLS matrix passes against a scratch Postgres 16; all 35 static gate assertions pass; build and typecheck green.

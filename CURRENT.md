# CURRENT.md

The live operational doc. If it is happening and it is not here, it is not happening. Weekly ritual per SOBO_PLAYBOOK.md section 8.

Last updated: 2026-07-08 (Ring 4 built; infrastructure live).

## State

- **Ring 0 (Preflight): done.** Findings in `docs/keystone-preflight.md`.
- **Ring 1 (The spine): built and applied to live infrastructure.** The pre-provisioned Supabase project (`keystone`) carries migrations 0001, 0002, and the SafeSpace seed (1 practice, 3 practice members, 1 client, 4 client members, 1 engagement, 5 workstreams). The pre-provisioned Vercel project (`keystone`, git-linked to this repo) builds previews from this branch with the public env values in vercel.json.
- **Ring 2 (Sessions and scheduling): built.** Migration 0003 applied locally and in CI; sessions, availability windows, the encrypted Google connection store, the pure slot engine (DST-pinned unit tests), client booking/reschedule/cancel (pure RLS plus the DB exclusion constraint), practice settings (windows, connect, sync).
- **Ring 3 (Notes, AI extraction, homework): built.** Migration 0005 applied to the live project. Transcript paste, opus extraction into an inert ai_proposals row, the single accept path publishing notes and creating assigned homework, client check-off (assignment-scoped RLS), session detail on both surfaces, the readiness panel. The extraction end-to-end run waits on ANTHROPIC_API_KEY (setup checklist item 2); the request builder and parse are unit-tested and every AI call rides the Ring 0 chokepoint (spend guard, ledger, refusal fallback, voice sweep).
- **Ring 3.5 (Practice Home): built.** `/today` composes the week across every client: sessions in the next seven days, homework awaiting review, digest and messages placeholders (Rings 6 and 5), and the three-week stall section (descriptive, never red-badged; threshold sits under CONFIRM 11). Practice members now land on /today from the root and the auth callback; practice mobile tabs are at the five-item max. No new tables, migrations, or env vars.
- **Ring 4 (Deliverables and library): built.** Migration 0006 applied to the live project: deliverables (file or link, kind-constrained), resources (the practice-wide catalog, the documented no-client_id case), session_prep_resources (flagged spec addition; the join behind prep surfacing), two private storage buckets with path-scoped read policies and zero write policies. Practice ships from the engagement page (signed-upload direct-to-storage), the client watches the brass timeline at /deliverables and downloads through their own session (pure RLS end to end); resource authoring at /library/authoring (voice-swept), client read at /library; prep attaches on the run of show and surfaces above upcoming sessions and on session detail. Live matrix extended (storage stub added to the scratch Postgres); 78 gate assertions green. No new env vars.
- Engagement status: proposal out to SafeSpace, decision expected Thu Jul 9.

## Manual steps

Every operational step (env vars, API setups, dashboard switches) lives
in **`docs/setup-checklist.md`**, maintained per ring and done in one
sweep after the full build. Note: branch previews build green on every
push but sit behind Vercel SSO (open them while logged into Vercel; the
build session's sandbox cannot reach vercel.app hosts, so its visual
runs were against the identical commit locally).

## The ring queue

| Ring | Contents | Status |
|---|---|---|
| 0 | Preflight: repo, platform layer, tokens, docs, agents, gate scaffolds, preflight doc | done |
| 1 | The spine: practices, clients, members, email-keyed invites, engagements, workstreams with the parallel arc, stage events, permission authority, RLS, the seeded cross-practice and cross-client isolation matrix, sidebar shell both surfaces, client progress view, login page | built; live DB seeded; 390px live run owed |
| 2 | Sessions and scheduling: availability windows, slot picking, Google Calendar OAuth, tz-correct sync, reschedule | built; Google end-to-end run owed (needs env) |
| 3 | Notes and homework: paste transcript, AI proposes (inert), consultant accepts, client checks off, review queue, session detail, readiness panel | built; live AI run owed (needs env) |
| 3.5 | Practice Home, the Monday screen | built |
| 4 | Deliverables and library | built |
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

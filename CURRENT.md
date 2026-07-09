# CURRENT.md

The live operational doc. If it is happening and it is not here, it is not happening. Weekly ritual per SOBO_PLAYBOOK.md section 8.

Last updated: 2026-07-09 (Ring 6 built; the full ring queue is built; infrastructure live).

## State

- **Ring 0 (Preflight): done.** Findings in `docs/keystone-preflight.md`.
- **Ring 1 (The spine): built and applied to live infrastructure.** The pre-provisioned Supabase project (`keystone`) carries migrations 0001, 0002, and the SafeSpace seed (1 practice, 3 practice members, 1 client, 4 client members, 1 engagement, 5 workstreams). The pre-provisioned Vercel project (`keystone`, git-linked to this repo) builds previews from this branch with the public env values in vercel.json.
- **Ring 2 (Sessions and scheduling): built.** Migration 0003 applied locally and in CI; sessions, availability windows, the encrypted Google connection store, the pure slot engine (DST-pinned unit tests), client booking/reschedule/cancel (pure RLS plus the DB exclusion constraint), practice settings (windows, connect, sync).
- **Ring 3 (Notes, AI extraction, homework): built.** Migration 0005 applied to the live project. Transcript paste, opus extraction into an inert ai_proposals row, the single accept path publishing notes and creating assigned homework, client check-off (assignment-scoped RLS), session detail on both surfaces, the readiness panel. The extraction end-to-end run waits on ANTHROPIC_API_KEY (setup checklist item 2); the request builder and parse are unit-tested and every AI call rides the Ring 0 chokepoint (spend guard, ledger, refusal fallback, voice sweep).
- **Ring 3.5 (Practice Home): built.** `/today` composes the week across every client: sessions in the next seven days, homework awaiting review, digest and messages placeholders (Rings 6 and 5), and the three-week stall section (descriptive, never red-badged; threshold sits under CONFIRM 11). Practice members now land on /today from the root and the auth callback; practice mobile tabs are at the five-item max. No new tables, migrations, or env vars.
- **Ring 6 (Weekly digest): built.** Migration 0008 applied to the live project. The Friday cron (vercel.json, 22:00 UTC as the CONFIRM 6 proposal of Friday 3pm Pacific) gathers each active engagement's real week (sessions held, deliverables shipped, homework done, stage changes, what is scheduled next), refuses an empty week before any model call, drafts on the digest tier through the one AI chokepoint, voice-sweeps, and writes an inert ai_proposals row. The approval queue on /today is live: read the draft, approve and send (one branded email per client member; the record marks 'sent' only when every send succeeded) or dismiss. The end-to-end run waits on ANTHROPIC_API_KEY, RESEND_API_KEY, and CRON_SECRET (setup checklist).
- **Ring 5 (Messages): built.** Migration 0007 applied to the live project: one thread per engagement (unique constraint says so honestly), author-stamped messages whose insert policy demands self-authorship on the right side of the wall inside your own scope, bodies immutable to every session (column-level grant limits updates to read_at), no delete path. Client sends at /messages and the practice owners get a deep-linked email (targets via keystone_message_notify_targets, the minimal-disclosure definer RPC, since the pure-RLS client surface cannot read practice_members); the practice replies from the engagement page and the thread's client participants get one back. The /today messages card is live: unanswered threads with age. Email failure states are honest on both sides; the live send run waits on RESEND_API_KEY (setup checklist section 4).
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
| 5 | Messages plus Resend notifications | built; live email run owed (needs RESEND_API_KEY) |
| 6 | The weekly digest (cron, approval queue, refuses an empty week) | built; live run owed (needs env) |

Then stop and run SafeSpace on it for two weeks before any Ring 7 talk.

## CONFIRM gates (nothing ships assumed)

The spec numbers these 1 through 12 and 14; there is no gate 13 in the spec (flagged in the preflight doc).

| # | Question | Status |
|---|---|---|
| 1 | Domain: app.soboconsulting.com, or a keystone domain from day one? | decided: app.soboconsulting.com (DNS CNAMEd to Vercel 2026-07-09; attach the domain to the Vercel project, checklist section 1) |
| 2 | SafeSpace logins: susan@, liesl@, aris@, jasmine@ (all safespace.org); confirm the four and whether anyone else joins | decided: the four confirmed by Remi 2026-07-09, exactly as seeded; nobody else joins for now |
| 3 | Library access after the engagement ends: keeps or lapses? | open |
| 4 | Shannon: practice login in v1? | decided: yes (Remi 2026-07-09); shannon@ambitionangels.org, consultant |
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
- Google sign-in: code is live on the login page; the door opens after checklist section 3b (dedicated sign-in OAuth client) plus the Supabase provider switch in section 1. Until then the button shows its honest could-not-start state.
- Calendar end-to-end: blocked on manual step 2 (Google OAuth creds + token secret).
- Domain wiring: CONFIRM 1 decided (app.soboconsulting.com). Code and vercel.json now carry the domain; the remaining step is attaching it to the Vercel project (checklist section 1) and updating the Supabase allow-list and Google redirect URIs to match.
- Invite sends: unblocked (CONFIRM 2 decided; the four seeded SafeSpace emails are confirmed as-is). The four can sign in as soon as the auth allow-list step lands.

## Recently shipped

- 2026-07-09: the practice roster corrected in the live DB (pending rows updated, no schema change): Kendra signs in as kendrasobo@gmail.com and Shannon as shannon@ambitionangels.org; the seeded soboconsulting.com guesses for the two are retired. CONFIRM 2 and CONFIRM 4 decided the same day: the four SafeSpace addresses confirmed exactly as seeded, and Shannon gets a v1 consultant login.
- 2026-07-09: the front door grew a second option: "Continue with Google" under the email form, magic link stays first and is the fail-safe (Remi's call). Spec 6.4 amended in place; SECURITY.md section 3 records the two-doors-one-credential story; the claim RPC needed no change because Google also presents a verified email. Checklist section 3b added: sign-in gets its OWN Google OAuth client (the calendar client's consent screen is Testing-mode with sensitive scopes and would refuse client members). Passwords considered and declined: set and reset both need an email link anyway, so they remove no dependency and add a stuffable credential; recorded in login/actions.ts and SECURITY.md.
- 2026-07-09: main fast-forwarded to the full build (f4dc98b); production is live. Features that need keys stay dormant until the setup checklist sweep.
- 2026-07-09: app.soboconsulting.com is live (CONFIRM 1 decided; domain attached in Vercel by Remi, NEXT_PUBLIC_APP_URL updated). Found and fixed a launch blocker in the same pass: the Vercel project predated the app, its framework preset stuck at "Other", and every deployment served the platform 404 on every path (masked by the SSO wall on preview URLs). "framework": "nextjs" in vercel.json (972688f) fixed it; the login page confirmed serving 200 on the public domain. Built on this branch, in order: `ring0: platform layer` through `ring0: preflight findings`, `ring1: spec amendments`, `ring1: the spine schema, permission authority, and seeded isolation matrix`, `ring1: login, shell, and the client progress view`. The live RLS matrix passes against a scratch Postgres 16; all 35 static gate assertions pass; build and typecheck green.

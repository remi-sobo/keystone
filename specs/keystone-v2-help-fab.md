# Keystone V2: the help FAB (coach plus report)

Harvest-born epic. Remi asked for the BloomOS floating button brought
over to Keystone: a small window a leader can open from any room that
holds two things, an AI coach that helps them see where the engagement
stands, and a way to report an issue. This spec covers both halves and
names what is genuinely new.

## What BloomOS has, and what Keystone already has

BloomOS carries two features behind floating buttons that share the
same real estate: a guided "report an issue" flow that files a task and
emails Remi, and "Reed," a read-only AI assistant that explains and
drafts but never sends or changes anything.

Keystone already has Reed's twin. The 2E engagement Q&A
(`src/lib/qa.ts`, `src/lib/qaCorpus.ts`, `askQuestion` in
`src/app/(client)/ask/actions.ts`) answers only from that engagement's
own record, cites its sources, and refuses honestly when the record is
silent. That is the coach. The FAB reuses it unchanged; the coach half
adds no AI plumbing, no new table, and no new rule. It stays inside the
existing spend cap, rate limit, voice sweep, and the deny-all
`qa_exchanges` accountability copy.

So the only net-new storage is the report.

## Scope decisions (defaulted pending Remi, all reversible)

These four shaped the build. They are the safe path; Remi may reword any
of them and the change is small.

- **Surface: the client side first.** The FAB mounts on
  `app/(client)/**`, so any SafeSpace leader gets the coach and the
  report button on every room. Mirroring it to the practice side later
  is a second mount, not a rebuild.
- **Report destination: a dedicated table plus an email to the practice
  owners.** New `issue_reports` table, scoped and isolation-tested, that
  the practice can read; plus a Resend email per report through the
  existing honest-degrade path. This matches BloomOS filing a task and
  emailing Remi, without mixing support into the Messages thread.
- **Report form: simple.** Type (bug, confusing, idea), a description,
  filed directly through pure RLS. No second AI surface in the report
  path (BloomOS runs an AI intake interview; that can come later as its
  own gated AI surface). A screenshot attachment is the first follow-up.
- **Coach UX: chat-style display over the single-shot grounded engine.**
  The window shows a running list of question and answer, but each
  answer is an independent, grounded 2E call that cites its sources. No
  multi-turn conversational memory in v1; that would be new AI plumbing.

## The report table (migration 0036)

`issue_reports`, shaped like the decision log and messages:

- Both scope ids on the row (`practice_id` denormalized per spec 5.1),
  `engagement_id`, `kind` in (bug, confusing, idea), `body` (1 to 4000
  chars), `reported_side` naming the wall, `created_by`, `created_at`.
- RLS on. Read admits both walls inside their own scope
  (`is_practice_member` or `is_member_of_client`). Insert demands the
  author be the caller, on the wall they stand behind, inside their own
  scope, the client branch riding `keystone_can(practice_id, client_id,
  'issue.write')`. A new `issue.write` permission is granted to
  `client_member`, `owner`, and `consultant` in `role_permissions`.
- No update policy, no delete policy. A filed report is a record;
  triage reads it, never edits the client's words.

The per-feature gate is met in the same PR: the table ships with its
cross-practice AND cross-client isolation block in
`supabase/tests/isolation-seed.sql` and the pinning spec
`e2e/issue-reports-isolation.spec.ts` (both scope walls, the
self-authorship wall, the cross-client forge refusal, immutability).

## The report action (client surface, pure RLS)

`src/app/(client)/report/actions.ts`, mirroring the Ring 5 client
message send: resolve the viewer and the active engagement on the
session, rate-limit, insert on the session client (the insert policy is
the wall), then email the practice owners with targets from
`keystone_message_notify_targets` (the minimal-disclosure RPC, since the
client surface cannot and must not read `practice_members`). A failed
email is said out loud; the report itself still stands. No
`supabaseAdmin` in the file, enforced by the no-service-role gate.

## The FAB and the window

A single floating button mounted in `app/(client)/layout.tsx`, above the
390px bottom tab bar and its z-index. It opens a small window with two
tabs, Coach and Report. The window is the first modal primitive in the
codebase, so it follows the frozen tokens and the one easing, no new
colors: paper-raised panel, forest primary, brass hairline, the
`active:scale-[0.98]` motion vocabulary. Escape and a scrim close it;
focus is trapped while open; it is verified at 390px before it ships.

## Out of scope for v1 (named, not forgotten)

- Screenshot or photo attachment on a report (first follow-up; a private
  bucket with a path-scoped read policy like the homework-evidence one).
- The BloomOS-style AI intake interview that drafts a developer brief
  (a second AI surface, gated on its own).
- The practice-side mount of the FAB.

## Built after the first merge

- The practice-side triage screen (`/issues`, on Remi's ask). Owner
  only: the nav item and the page both gate to the practice owner, and a
  consultant who reaches the URL is sent back to Home. Reads
  `issue_reports` on the owner's own session under RLS. It reads the
  rows, never edits them (the table is immutable by policy). One honest
  limit, flagged rather than hidden: the RLS read policy still admits any
  practice member, so the owner-only wall here is at the app layer; a
  data-layer owner-only lock is a later change if the pilot wants it.
  `RESEND_API_KEY` is flagged on the setup checklist so the per-report
  email actually sends; until then the report saves and shows on this
  screen with no email.

# Keystone: Read AI import

Status: built on branch `claude/keystone-read-ai-kufizr`, not merged, not deployed, migration 0050 not applied.

## What it does

When a recorded call ends, Read AI posts the meeting to Keystone. Keystone decides whose call it was and puts it in the right place without anything reaching a client until a consultant publishes.

- **A client call during that client's booked session** attaches on its own. The transcript is saved on the session (practice only). Read AI's summary and action items become one proposal in the existing review workspace on `/sessions/[id]/notes`, marked `read.ai`. The consultant edits, assigns homework, logs decisions, and publishes exactly as with Keystone's own extraction. The "Extract action items" button still works on the imported transcript for Keystone's own wall-aware extraction.
- **A call that is probably a client call but not certain** waits in the Read AI inbox at `/settings/read-ai`: a client was on the call but no session was booked then, people from two clients were on it, or it happened during a session but nobody from the client was on the invite. The consultant picks the session or marks it "Not a client call", which wipes the content.
- **Every other call** (other ventures, family, ministry, internal) is skipped. Keystone keeps only the Read AI id and the time, so a replay is a no-op. No title, no people, no words.

## How the match works (`src/lib/readai/match.ts`)

Two signals. A participant email that is a client member's email or shares a client member's work domain (public mail domains and the practice's own domain never count). And time: a meeting that overlaps a booked or held session, with 20 minutes of slack. A practice can never have two live sessions at once (`sessions_no_overlap`), so time is a strong pointer. Both signals together attach. One signal parks the meeting for review. Neither skips it.

## The transcript wall (fixed in the same change)

Before this change, a transcript rode `session_notes.raw_transcript`, whose read policy admits every client member once the note is shared, and the client session page rendered it behind a "Transcript" disclosure. That contradicts SECURITY.md 4.5: every client member reads the record, and the exclusion wall exists to keep confidences out of it. Migration 0050 moves transcripts to `session_transcripts`, a table with no client-member policy at all, copies existing transcripts across, empties the old column, and adds a check constraint so it stays empty. The client page no longer shows a transcript.

FLAG: spec section 6.4 (and the Ring 3 build note) describes "the transcript folded behind a disclosure" on the client session page. This change removes that. If Remi wants clients to see a transcript, it should be a deliberate, edited excerpt published through the review step, not the raw call.

## Read AI's integration options (checked Oct 30, 2026)

- **Webhooks** (support.read.ai, "Getting Started with Webhooks"): Pro and Enterprise plans. Set under the account menu, Integrations, Add Webhook. Fires once per meeting on `meeting_end` when the report is ready, for any meeting the account can view. Payload: `session_id`, `trigger`, `title`, `start_time`, `end_time`, `participants` (name, email), `owner`, `summary`, `action_items`, `key_questions`, `topics`, `report_url`, `chapter_summaries`, `transcript.speaker_blocks`. No signature, no custom header, and past meetings cannot be resent. After 25 consecutive failures Read AI stops the webhook.
- **REST API** (support.read.ai, "API Reference", open beta): `GET https://api.read.ai/v1/meetings` and `/v1/meetings/{id}` with OAuth bearer tokens (self-serve client registration at `/oauth/register`, scope `meeting:read`). Not used in this build: it needs a token store and refresh, and the webhook already carries everything. It is the path for a later backfill of past meetings.

This build uses the webhook. Because Read AI does not sign it, the secret rides the URL (`?key=`), is compared in constant time, and the route is rate limited per IP before the check. The practice comes from config, never from the request.

## What it does not do

- **Deliverables.** Read AI produces notes, action items and a transcript, not documents. Action items flow into homework or internal tasks through the review workspace. Deliverable files are still uploaded on the engagement as today.
- **The exclusion wall in Read AI's own summary.** Read AI writes its summary without Keystone's exclusion rules (seed section 12). The human review step is the enforcement, as SECURITY.md 4.5 already says: read the proposal before publishing, or run Keystone's own extraction on the transcript instead.
- **One practice per deploy.** `READAI_PRACTICE_ID` names one practice. A second tenant needs a per-practice secret table; the route and import already take the practice id as an argument.

## Setup (only Remi can do these)

1. Approve and merge the branch.
2. Apply migration `supabase/migrations/0050_readai_import.sql` to the keystone Supabase project, then deploy right away. Order matters: until the new code is live, the old paste box would fail to save (the constraint refuses the old column), which is the safe failure.
3. In Vercel (project keystone, Production), set:
   - `READAI_WEBHOOK_SECRET`: a long random value, at least 32 characters (for example the output of `openssl rand -hex 32`).
   - `READAI_PRACTICE_ID`: the SOBO Consulting practice id. `/settings/read-ai` shows it while the webhook is not configured.
   - `CRON_SECRET`, if not already set, so the digest, notify, and calendar crons run (they no longer bounce to the login page).
4. Redeploy so the variables load.
5. In Read AI (Pro plan or above), open the account menu, Integrations, Add Webhook. Name it Keystone. URL: `https://<your Keystone domain>/api/readai/webhook?key=<READAI_WEBHOOK_SECRET>`. Send the test request (Keystone answers it and stores nothing).
6. After the next client call, open `/settings/read-ai` and the session's notes page to review the proposal.

To rotate the secret, change `READAI_WEBHOOK_SECRET`, redeploy, and update the URL in Read AI.

## Files

- `supabase/migrations/0050_readai_import.sql`: `session_transcripts`, `readai_meetings`, the transcript move.
- `src/app/api/readai/webhook/route.ts`: the machine route.
- `src/lib/readai/payload.ts`, `match.ts`: pure parse and match.
- `src/lib/readai/import.ts`: the one writer (service role, after the caller's check).
- `src/app/(practice)/settings/read-ai/`: the inbox.
- Gates: `e2e/readai-engine.spec.ts`, `e2e/readai-isolation.spec.ts`, and the Read AI block at the end of `supabase/tests/isolation-seed.sql`.

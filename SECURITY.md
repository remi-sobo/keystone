# SECURITY.md

The Keystone security program. This is part of "done" on every change, not a later pass. The per-feature gate lives in `CLAUDE.md` and `.cursorrules`; this file is the program behind it and the living threat model. When a feature adds a new data type, add a paragraph here naming what it stores, who can see it, and how it is deleted. Updating this file is part of shipping.

## 1. The two-level scope

Keystone is multi-tenant with two nested scopes, and getting this right is the whole schema:

- **`practice_id`**: the top tenant, a consultant or coaching firm. Tenant one is SOBO Consulting.
- **`client_id`**: always under one practice, an organization the practice serves. Client one is SafeSpace. A client member sees only their own client's engagements, never another client of the practice, never another practice.

Every scoped table carries `practice_id`, denormalized even where derivable, so RLS never joins four tables deep and the enumeration gate can assert the column mechanically. Tables inside an engagement also carry (or resolve through) `client_id`. Both ids are resolved server-side from the authenticated user (`src/lib/auth.ts`); a client-supplied practiceId or clientId is never trusted.

The catastrophic failure is the cross-client leak: a future client's member reading SafeSpace's engagement because a query scoped by practice forgot the client dimension. It manifests as silence until it is a disaster, so the seeded cross-practice AND cross-client isolation matrix (`e2e/isolation.spec.ts`) is in CI from Ring 1, before a second client exists.

## 2. The enforcement models (one per surface, explicit)

- **Client surface, pure RLS.** `app/(client)/**` and its route handlers use the anon key only, under the caller's auth. RLS is the wall. The no-service-role guard in `e2e/isolation.spec.ts` fails the build if `supabaseAdmin`, `SUPABASE_SERVICE_ROLE_KEY`, or `service_role` appears anywhere in the surface. Strangers log into this surface, so it gets the hardest, least-forgettable wall.
- **Practice surface, service-role-after-check.** Routes resolve and verify practice membership (`requirePracticeMember`), then may use the service role; every query still scopes by the resolved `practice_id`, and RLS stays enabled as defense in depth.

One permission authority, `private.keystone_can(p_practice, p_client, p_perm)` (SECURITY DEFINER, pinned search_path; Ring 1), is called by BOTH the RLS policies and the app's clean-403 checks, so changing access is a data change and the two layers cannot drift.

## 3. Membership and invites

Members are rows in `practice_members` (roles `owner | consultant`) and `client_members` (role `client_member`). Invites are email-keyed pending membership rows (`user_id` null, `email` set), claimed automatically by the verified JWT email on first sign-in via a SECURITY DEFINER RPC (the Pathway `pathway_claim_membership` pattern). The verified email is the credential; a URL alone grants nothing. No bearer-token invites.

## 4. Transcript PII (the most sensitive data in the system)

Raw call transcripts contain client finances and personnel detail. The rules, all four load-bearing:

1. **Storage behind the client wall.** Raw transcripts live in Supabase Storage under a path scoped by practice and client, in an access-controlled bucket with no guessable URLs; the `session_notes` row holds a pointer, not the text, when the transcript is long.
2. **Excluded from AI context except extraction.** The one extraction call (task `extract`) reads the transcript; no other AI job (digest, Q&A, suggestion, voice sweep) ever receives raw transcript text in its context. Q&A reads the accepted, structured record only.
3. **Never logged.** No transcript text in server logs, audit rows, voice-violation excerpts, or error messages. The spend ledger stores token counts and dollars, never content.
4. **Deletion path.** Deleting a session note deletes the storage object in the same operation and audits the deletion (metadata only: which note, who, when). Engagement deletion cascades over its notes and their storage objects. There is no orphaned-transcript state.

## 5. AI surfaces

Every AI input is untrusted (a pasted transcript can contain instructions; treat it as data, never as directives). Every AI endpoint is rate-limited per user and per practice (`src/lib/rateLimit.ts`) and spend-capped through the call-count ceilings plus the month-to-date dollar gate and per-engagement cost ledger (`src/lib/spend.ts`). Every AI write lands in `ai_proposals` with a status; a single human accept route is the only code path into live tables. Output that humans read passes the voice gate, and drift is recorded in `voice_violations` (model output excerpts only, capped, never the user's prompt). There is no path from ingested content to cross-scope data or to changing a job's instructions.

## 6. Audit: metadata, not values

`audit_log` is append-only, actor-stamped, service-role-only (RLS on, zero policies). It records WHICH fields changed, who, and when. It never records values: no note text, no message bodies, no readiness prose, no transcript content. Practice-surface mutations log through `src/lib/audit.ts` after the auth gate passes; the insert is best-effort and never blocks the action it records.

## 7. Secrets and email

Secrets live in env (Vercel) only, documented with empty values in `.env.example`, never in the client bundle. Google OAuth tokens (Ring 2) are encrypted at the app layer (AES-256-GCM) in a service-role-only table with RLS deny-all, decrypted server-side just in time. OAuth state is HMAC-signed with a TTL. Resend failures surface as real errors and are logged; the UI never shows "sent" on a failed send.

## 8. The CI gates (all ship together, green from Ring 0)

1. **`e2e/isolation.spec.ts`**: static checks on migrations and routes (RLS on, scope columns present, client-supplied scope ids never read) plus, from Ring 1, the seeded matrix: two practices, each with one client, asserting cross-practice AND cross-client reads return zero rows at the RLS layer. Includes the no-service-role guard for the client surface.
2. **`e2e/isolation-coverage.spec.ts`**: the enumeration ratchet. A scoped table or migration that ships unregistered fails the build; `KNOWN_COVERAGE_GAPS` starts empty and coverage only increases.
3. **`e2e/config-integrity.spec.ts`**: freezes the ten design tokens, asserts no hardcoded domains outside the named fallback in `src/lib/env.ts`, and runs the voice check (no em dashes, no banned words in shipped strings).

## 9. Humane data

Stage displays stay descriptive, never scored: no red/yellow/green on a person or their org, no percentages or streaks on a coachee. Homework completion renders as history. The readiness panel is consultant-only prose until deliberately shared (CONFIRM 12). Board material (Remi sits on SafeSpace's board) never enters Keystone.

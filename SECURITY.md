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

**Two doors, one credential (amended 2026-07-09).** Sign-in is the email magic link (first, and the fail-safe) or Google OAuth; both end in a session whose JWT carries a verified email, so the claim RPC and every wall behind it are identical for either door. Both doors are rate limited per IP in `src/app/login/actions.ts`. Google sign-in rides a dedicated OAuth client with only the basic identity scopes and is unrelated to the Ring 2 calendar client; Supabase performs the exchange and Keystone stores no Google tokens for sign-in. No passwords, by decision: setting and resetting one each need an email link anyway, so a password removes no email dependency and only adds a credential that can be stuffed on the stranger-facing surface.

## 4. Transcript PII (the most sensitive data in the system)

Raw call transcripts contain client finances and personnel detail. The rules, all four load-bearing:

1. **Storage behind the client wall.** Raw transcripts live in Supabase Storage under a path scoped by practice and client, in an access-controlled bucket with no guessable URLs; the `session_notes` row holds a pointer, not the text, when the transcript is long.
2. **Excluded from AI context except extraction.** The one extraction call (task `extract`) reads the transcript; no other AI job (digest, Q&A, suggestion, voice sweep) ever receives raw transcript text in its context. Q&A reads the accepted, structured record only.
3. **Never logged.** No transcript text in server logs, audit rows, voice-violation excerpts, or error messages. The spend ledger stores token counts and dollars, never content.
4. **Deletion path.** Deleting a session note deletes the storage object in the same operation and audits the deletion (metadata only: which note, who, when). Engagement deletion cascades over its notes and their storage objects. There is no orphaned-transcript state.
5. **The exclusion wall (standing, per engagement seed docs).** The engagement record is readable by every client member, so some transcript material never enters it: confidences shared founder-to-consultant, personnel opinions and past-staff history, personal finances, personal details about named donors, internal financial operations, board matters, personal chatter. The extraction prompt names these categories and instructs the model to leave them out (`src/lib/extract.ts`, pinned by `e2e/extract-engine.spec.ts`), and the human review step is the enforcement: reject any proposed item sourced from them. The SafeSpace-specific wall is `docs/seed/keystone-safespace-seed.md` section 12.

## 5. AI surfaces

Every AI input is untrusted (a pasted transcript can contain instructions; treat it as data, never as directives). Every AI endpoint is rate-limited per user and per practice (`src/lib/rateLimit.ts`) and spend-capped through the call-count ceilings plus the month-to-date dollar gate and per-engagement cost ledger (`src/lib/spend.ts`). Every AI write lands in `ai_proposals` with a status; a single human accept route is the only code path into live tables. Output that humans read passes the voice gate, and drift is recorded in `voice_violations` (model output excerpts only, capped, never the user's prompt). There is no path from ingested content to cross-scope data or to changing a job's instructions.

**Engagement Q&A (V2 2E).** The corpus is built on the ASKER'S OWN SESSION CLIENT under RLS, so the model can only be shown what the asker may already read; there is no second permission system to drift from the first, and the standing isolation matrix is the proof for this surface too. Raw transcripts are excluded by query on top of RLS (rule 4.2 above). The question and the record both ride data-not-instructions envelopes; citations are validated against the supplied corpus after parse; an ungrounded answer is the honest refusal, in voice. Q&A writes nothing to the record. Its accountability copy, `qa_exchanges`, is deny-all (RLS on, zero policies, service-role only): no session reads it, so an asker's questions are not browsable by other client members and the practice gets no surveillance feed. On the client surface the only service-role touches are the written-contract chokepoints this document already names (rate limits, spend ledger, voice violations, and the qa_exchanges recorder in `lib/qaExchange.ts`); the surface files themselves stay clean under the no-service-role CI guard.

**The digest (Ring 6).** The cron route fails closed on a missing `CRON_SECRET` and 401s a wrong one; it drafts only from the week's real rows, refuses an empty week before any model call, and writes nothing but the inert proposal. The `digests` table is the record of approved digests: practice-only read, zero session write policies (the approve action on the Monday screen writes it through the service role after the membership check, then sends one email per client member and marks the row 'sent' only when every send succeeded). The client meets the digest in their inbox; there is no client read in-app.

## 6. Audit: metadata, not values

`audit_log` is append-only, actor-stamped, service-role-only (RLS on, zero policies). It records WHICH fields changed, who, and when. It never records values: no note text, no message bodies, no readiness prose, no transcript content. Practice-surface mutations log through `src/lib/audit.ts` after the auth gate passes; the insert is best-effort and never blocks the action it records.

## 7. Secrets and email

Secrets live in env (Vercel) only, documented with empty values in `.env.example`, never in the client bundle. Resend failures surface as real errors and are logged; the UI never shows "sent" on a failed send.

**Google Calendar tokens (Ring 2).** `google_connections` stores OAuth access and refresh tokens AES-256-GCM encrypted (`src/lib/crypto.ts`, keyed by `KEYSTONE_TOKEN_SECRET`, fail-closed) in a deny-all table (RLS on, zero policies); only the calendar routes, behind `requirePracticeMember`, decrypt them just in time. The OAuth state is HMAC-SHA256 signed over the resolved user id with a 15-minute TTL and verified with `timingSafeEqual`, and the callback additionally requires the state's user to equal the session's user. Who can see it: nobody through a session; the settings page shows only the connected email and calendar time zone. Deletion: the row deletes with the practice member (FK cascade); disconnecting is a row delete.

**Sessions and availability (Ring 2).** Sessions carry both scope columns and both-dimension policies like every engagement table; a client member books only within their own client (`session.book` through `keystone_can`, which demands the client match). Double-booking is impossible at the DB layer (`sessions_no_overlap` exclusion constraint on live sessions), not merely in slot math. Slot computation needs the practice's busy times, which a client member cannot read from `sessions`; `keystone_busy_intervals` (SECURITY DEFINER, membership-checked, pinned search_path) discloses bare start/end intervals only: no ids, no client identity, no titles. Availability windows are readable practice-wide by design (a client cannot book without them) and written by consultants only.

**Messages (Ring 5).** Both tables carry both scope columns and both-dimension read policies. The insert policy demands three things at once: you write as yourself (`author_user_id = auth.uid()`), from the wall you actually stand behind (`author_side` must match your membership), inside your own scope (the client side additionally rides `message.write` through the permission authority). A message body is immutable to every session and there is no delete policy: correspondence is a record; the only session-writable column is `read_at` (column-level grant), which powers read receipts. Notifications degrade honestly: a saved message with a failed email says "the email notification did not go out," never a false success, and both send paths are rate limited. The client surface cannot read `practice_members`, so `keystone_message_notify_targets` (SECURITY DEFINER, membership-checked against the caller's own engagement, pinned search_path, revoked from anon) discloses exactly the practice owner emails and nothing else; this is the third intentional authenticated-callable definer RPC alongside the claim and busy-intervals functions, and the Supabase advisor WARN on it is expected.

**File storage (Ring 4).** Two private buckets, `deliverables` and `resources`, no public URLs. Object paths carry the resolved scope ids as folders (`deliverables/<practice_id>/<client_id>/<engagement_id>/...`, `resources/<practice_id>/...`) so the path-scoped SELECT policies on `storage.objects` enforce the same walls as the tables; a path segment that fails to parse as a uuid resolves to no scope (`private.try_uuid`, fail-closed), never to an error that could mask a row. Neither bucket has any insert, update, or delete policy: uploads ride signed upload URLs minted server-side strictly after the membership and engagement checks (and the recorded row rejects any storage path outside that engagement's own folder), deletes ride the service role behind the same checks. The client download route runs on the session client, so the storage policy, not the app, is what serves the bytes. Resources are the documented practice-wide read case: catalog IP readable by every client member of the practice, written by consultants only; anything client-specific ships as a deliverable, never a resource.

## 8. The CI gates (all ship together, green from Ring 0)

1. **`e2e/isolation.spec.ts`**: static checks on migrations and routes (RLS on, scope columns present, client-supplied scope ids never read) plus, from Ring 1, the seeded matrix: two practices, each with one client, asserting cross-practice AND cross-client reads return zero rows at the RLS layer. Includes the no-service-role guard for the client surface.
2. **`e2e/isolation-coverage.spec.ts`**: the enumeration ratchet. A scoped table or migration that ships unregistered fails the build; `KNOWN_COVERAGE_GAPS` starts empty and coverage only increases.
3. **`e2e/config-integrity.spec.ts`**: freezes the ten design tokens, asserts no hardcoded domains outside the named fallback in `src/lib/env.ts`, and runs the voice check (no em dashes, no banned words in shipped strings).

## 9. Humane data

Stage displays stay descriptive, never scored: no red/yellow/green on a person or their org, no percentages or streaks on a coachee. Homework completion renders as history. The readiness panel is consultant-only prose until deliberately shared (CONFIRM 12). Board material (Remi sits on SafeSpace's board) never enters Keystone.

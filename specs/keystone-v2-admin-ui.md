# Spec: Keystone V2 1A, the practice admin UI (members and access)

**Parent:** `specs/keystone-v2.md` Phase 1, epic 1A. First standalone V2 spec, written during the pilot per CONFIRM V2-1.
**Grounded against:** the live V1 codebase (migrations 0001 to 0008, `src/lib/auth.ts`, the settings surface, the spine isolation matrix). Every claim about V1 below was read from the code, not remembered.
**Status:** approved by Remi 2026-07-09; the four CONFIRM gates in section 9 decided as recommended the same day, and Remi pulled the build forward from the pilot window. Built as migration 0009 plus `/settings/members`.
**Date:** 2026-07-09

---

## 1. Purpose

Today a practice member, client, client member, or engagement is born from SQL. This epic gives the practice owner a members-and-access surface so tenant two never requires an engineer. It is deliberately the smallest slice of operability: people in, people out, access visible. Creating engagements stays in 1B; this epic only opens the doors.

What ships: add and remove practice members, change role, add a client, invite a client member, resend an invite, deactivate anyone softly, see pending-invite status and last sign-in. Plus the invite email as a designed artifact.

What does not ship here: engagement creation (1B), templates (1C), first-run onboarding (1D), any client-surface change beyond what revocation implies.

## 2. What V1 already has (the foundation this builds on)

- **The invite-and-claim model exists in the schema.** `practice_members` and `client_members` are email-keyed with nullable `user_id` and `claimed_at`. `keystone_claim_membership()` links a pending row to the caller on first sign-in by the VERIFIED JWT email. The email is the credential; a URL alone grants nothing. The spine matrix pins this ("no bearer invites").
- **The permission authority is ready.** `role_permissions` already carries `members.manage` for owner only, and `private.keystone_can` is called by both RLS and the app's clean-403 checks. This epic adds no new permission model; it finally uses the one that exists.
- **Membership predicates are the single wall.** `private.is_practice_member`, `private.is_member_of_client`, `private.is_client_member_of_practice`, `private.keystone_can`, `private.owns_client_membership`, plus `keystone_claim_membership()` and `keystone_message_notify_targets()`. Every RLS policy resolves scope through these. This is what makes soft revocation cheap and total (section 5).
- **Email degrades honestly** (`src/lib/email.ts`), and the digest already has the warm paper-toned shell (inline in `today/actions.ts`).
- **Settings covers availability and Google only** (`app/(practice)/settings`). There is no members surface anywhere.
- **No hard-delete paths exist** on membership tables, and the standing rule keeps it that way.

## 3. The surface

One new practice-surface page: **`/settings/members`** (settings grows a second tab; the sidebar label stays "Settings"). Owner-only: `requirePracticeMember('owner')`, clean 403 for consultants through the same `keystone_can` authority RLS uses.

Three sections, top to bottom:

1. **The practice team.** Each member: name-less email row (V1 has no display-name column; adding one is out of scope), role chip (owner or consultant), status (invited, active since claim, deactivated), last sign-in. Actions: add member (email plus role), change role, deactivate, reactivate.
2. **Clients and their people.** Per client: name, status, engagement count, then its members with the same row shape (email, invite status, last sign-in, deactivate, reactivate, resend invite). Actions: add client (name only; everything else is 1B's job), invite client member (email).
3. **Pending invites.** Every unclaimed, unrevoked membership row across both tables: email, side, invited when, last invite email sent when, resend button. This is the owner's "who has not come in yet" view.

Rules that shape the surface:

- **Last sign-in is operational, never a signal.** Shown to the owner only, plain timestamp, no recency coloring, no sort-by-idle. Never client-facing anywhere (humane-data law).
- **The last-owner rule.** The UI refuses to demote or deactivate the final active owner of a practice, and the server enforces it independently. A practice can never lock itself out.
- **Deactivation is calm.** No confirmation theater beyond one clear sentence: access ends now, the record and history stay, reactivation is one click. No email is sent to the deactivated person (CONFIRM 1A-2).
- **Mobile first.** Designed at 390px: rows become cards, actions collapse into a sheet, the three sections stack. The owner will do this from a phone between sessions.

## 4. Schema delta (migration 0009)

Four columns on each membership table, no new tables:

```sql
alter table practice_members add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users(id) on delete set null,
  add column invited_by uuid references auth.users(id) on delete set null,
  add column last_invite_sent_at timestamptz;
-- same four on client_members
```

- `revoked_at` is the soft-deactivation mark. Null means live. Reactivation nulls it again; history of the flip lives in `audit_log`, not in more columns.
- `last_invite_sent_at` powers resend throttling and the pending view. It records sends of the invite EMAIL; the row itself is the invite.
- `clients` needs nothing: `status` (active, paused, ended) already exists.

**The predicate hardening, the security heart of this migration:** every membership predicate listed in section 2 gains `and revoked_at is null` on its membership reads, in the same migration that adds the column. One edit per function, and revocation instantly closes every RLS policy, both resolvers, the claim path, and the message notify targets. No policy is edited individually; the wall stays one wall. `keystone_claim_membership()` additionally skips revoked rows so a revoked email cannot re-claim by signing in again.

The two app resolvers in `src/lib/auth.ts` add the same filter to their membership reads (`.is('revoked_at', null)`), so a revoked member gets the honest 403 instead of a half-alive session.

## 5. Mutations (practice surface: service-role-after-check, all audited, all rate-limited where they send)

| Action | Check | Writes | Notes |
|---|---|---|---|
| Add practice member | owner | insert pending row | duplicate email in practice: honest error, no upsert |
| Change role | owner | update role | last-owner rule server-side |
| Deactivate / reactivate (either table) | owner | set or null `revoked_at`, `revoked_by` | never deletes; audit records which row, who, when |
| Add client | owner | insert `clients` row | name only |
| Invite client member | owner | insert pending row | CONFIRM 1A-1 may open this to consultants later |
| Send or resend invite email | owner | update `last_invite_sent_at` | rate-limited per practice and per target row (one send per target per 10 minutes through `rateLimit.ts`); send failure is shown honestly, the row stays pending |

Every mutation logs through `src/lib/audit.ts`: metadata only (table, row id, field names, actor), never email bodies, never values.

## 6. The invite email (a designed artifact, the client's first impression)

- Built on the same warm shell as the digest email; this epic extracts that inline shell into a shared `emailShell()` in `lib/email.ts` and the digest adopts it, so there is exactly one branded frame.
- **Carries no credential.** The email says who invited you, what room you are walking into (practice name, and client name for client members), and links to `/login` with the email prefilled. Sign-in stays magic link or Google; the claim happens exactly as today, keyed on the verified JWT email. This preserves the "no bearer invites" law the isolation matrix already pins.
- Copy is voice-checked at the gate like all shipped strings: warm, plain, no em dashes, no urgency theater. Client-member copy says what Keystone is in one sentence; practice-member copy skips the tour.
- Reply-to is the inviter's email (CONFIRM 1A-3), so a confused invitee lands with a person, not a noreply void.

## 7. The per-feature gate walk (SOBO_PLAYBOOK section 10)

- **New scoped table:** none. New columns land on already-matrixed tables; the matrix still extends (next item) because the ACCESS semantics changed.
- **Isolation matrix extension, same PR:** revocation cases on both walls. A revoked practice member reads zero rows on every practice-scoped table; a revoked client member reads zero rows on every client-visible table; a revoked email cannot re-claim; the notify-targets RPC excludes revoked owners; the last-owner rule holds under concurrent demotion attempts (two owners demoting each other: exactly one succeeds).
- **New routes:** all under the practice surface, owner-gated server-side, scope resolved from the session, service role only after the check.
- **New person-data:** none beyond timestamps (`last_invite_sent_at`, and last sign-in read live from `auth.users` via the service role after the owner check, never stored app-side, never client-facing).
- **New AI surface:** none.
- **Secrets:** none new.
- **Copy:** invite email plus surface strings through the voice gate.
- **Mobile:** shipped means deployed plus one real 390px run of add-invite-resend-deactivate-reactivate.

## 8. Build shape (one ring-style PR)

1. Migration 0009: columns plus predicate hardening plus matrix extension (red first on the revocation cases, then green).
2. `auth.ts` resolver filters; honest-403 check.
3. `emailShell()` extraction; digest adopts it (no visual change).
4. `/settings/members` surface plus actions plus audit plus rate limits.
5. Invite email content, both variants.
6. Typecheck, lint, full gates, 390px run, deploy.

Estimated as one focused ring. Nothing here blocks on external keys except the invite email send itself (RESEND_API_KEY, already on the setup checklist).

## 9. CONFIRM gates for 1A

| # | Question | Recommendation |
|---|---|---|
| 1A-1 | Can consultants invite client members, or owner-only in v1? | Owner-only, matching the existing `members.manage` grant; widen later by adding one `role_permissions` row, which is a data change, not a rewrite |
| 1A-2 | Does deactivation notify the deactivated person by email? | No. Access ends quietly; the human conversation belongs to the humans |
| 1A-3 | Invite email reply-to | The inviter's address |
| 1A-4 | Do consultants get read access to `/settings/members` (view without mutation)? | Not in v1; the roster is the owner's room until a real need shows up in the pilot |

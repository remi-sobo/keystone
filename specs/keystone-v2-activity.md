# Spec: Keystone V2 activity view, the per-engagement trail

**Parent:** `specs/keystone-v2.md` section "My additions" item 5: an activity view over the audit log; a light per-engagement activity surface for the owner. Phase 4, near the action queue.
**Grounded against:** the live codebase after 4C. `audit_log` has been append-only metadata since Ring 1 (actor, action, target identifier, small detail, NEVER values), deny-all (RLS on, zero policies, service role only). What it lacked was scope: no column said which engagement a row belongs to.
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing finish-Phase-4 instruction (gates taken as recommended).
**Date:** 2026-07-11

---

## 1. What it is

- **Migration 0027:** nullable `practice_id` and `engagement_id` on audit_log, NO foreign keys (an audit row must outlive whatever it describes, untouched even by a cascade), plus the feed index. The table stays deny-all.
- **The stamp:** `logAuditAction` accepts optional scope; every engagement-scoped caller (engagement actions, session actions, charter actions: 28 sites) now stamps it. Rows older than the migration carry null scope and do not appear; the trail is honest about when it started.
- **The feed:** `listEngagementAudit` in lib/audit.ts (service role, called only behind the practice check), rendered as a quiet fold at the bottom of the engagement page: action, when, who. Detail payloads are NOT rendered, even though they are metadata; the fold answers "what happened here lately," not "show me the parameters."

## 2. What it is not

Not a client surface, not exportable, not a monitoring feed on client members (client members never appear as actors here; audit records practice-surface actions). The client-surface guard keeps lib/audit.ts off the pure-RLS side.

## 3. CONFIRM gates (taken as recommended under the standing instruction)

| # | Question | Recommendation |
|---|---|---|
| AV-1 | Scope columns with no FKs, table stays deny-all? | Yes. Audit rows outlive their subjects; the walls stay as Ring 1 built them |
| AV-2 | The fold renders action, when, who; never detail payloads? | Yes. Metadata discipline applied twice over |
| AV-3 | Practice engagement page only? | Yes. The trail is the consultant's memory, not a client-facing ledger |

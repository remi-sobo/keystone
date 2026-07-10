# Spec: Keystone V2 2D, "Your Next Moves"

**Parent:** `specs/keystone-v2.md` Phase 2 epic 2D: small build, large felt value, especially on mobile.
**Grounded against:** the live codebase after 2F (migrations 0001 to 0014). Everything this surface shows already exists behind walls that already hold: assigned homework (Ring 3), pending sign-offs (5D), prep resources on upcoming sessions (Ring 4), unread practice replies (Ring 5), the next booked session (Ring 2). 2D is composition; no migration.
**Status:** draft for Remi. CONFIRM gates in section 5.
**Date:** 2026-07-10

---

## 1. What 2D is

Home answers "where are we." 2D answers the second question a person actually logs in with: **"what needs me?"** A calm personal action strip at the top of the client Home, above the arc, holding at most a handful of lines:

1. **Sign-offs waiting on you:** pending 5D approvals ("Read and sign the charter"). The single highest-value line today, since Susan's first login has one waiting.
2. **Your homework due:** items assigned to YOUR membership, open, nearest due first (top three).
3. **Prep for your next session:** when the next booked session carries prep resources.
4. **Unread replies:** practice messages you have not read, as one line with a count.
5. **Your next session,** when nothing above needs you, so the strip never reads as "you have no purpose here."

Empty state, in voice: "Nothing needs you right now. See you at the next session." The strip is calm by construction: no badges, no red, no counts screaming; lines that exist only when true.

## 2. The posture question, answered by data

The V2 spec wants Aris and Jasmine to see homework and prep while Susan and Liesl see approvals and decisions. V1 models no buyer/coachee distinction, and 2D does not need one: **the list is personal because the data is personal.** Homework shows only items assigned to your membership row; sign-offs show because any member may decide (5D-1, decided); prep and sessions are shared facts. Susan sees the charter line and no homework because none is assigned to her; Aris sees pitch practice and no sign-off pressure once someone signs. Stakeholder modes as explicit postures arrive with 3G; 2D takes none of that on (CONFIRM 2D-1).

## 3. What 2D leaves out, honestly

- **Deliverables awaiting your review:** there is no acceptance mechanic until 3D. The line arrives with 3D (CONFIRM 2D-2).
- **Decisions needed from you** beyond sign-offs: no client-decidable object exists other than approvals in v1; the approvals line IS this line today.
- **The practice side:** "what needs me today" for Remi is 4A's action queue, a separate epic on the Today screen. 2D is client-only.

## 4. Build shape

No migration, no new route, no new RLS. One section component rendered at the top of the client Home (above the grid on every width, compact; CONFIRM 2D-3), reading: pending approvals for the client, my open assigned items, prep join on the next booked session, unread practice-authored messages, next session. All session-client reads under existing policies. Copy through the voice gate; 390px first, where this strip is the first thing the phone shows.

## 5. CONFIRM gates for 2D

| # | Question | Recommendation |
|---|---|---|
| 2D-1 | Postures: by data now, explicit modes later? | By data. Assigned homework is already personal; sign-offs are any-member by 5D-1. Explicit stakeholder modes arrive with 3G and this strip inherits them free |
| 2D-2 | Deliverable-review line waits for 3D? | Yes. No acceptance mechanic exists; a fake "review this" line would be theater |
| 2D-3 | Placement: above the arc on every width, or mobile only? | Every width, one compact strip. The desktop rail already holds the standing cards; the strip holds what needs YOU, and that distinction should not depend on screen size |

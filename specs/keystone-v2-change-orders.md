# Spec: Keystone V2 5E, scope context and change orders

**Parent:** `specs/keystone-v2.md` Phase 5 epic 5E: not billing. The scope boundary, and a change-order request when a client asks for something outside it. The pressure valve for the BloomOS-bleed problem: not a flat no, not a quiet yes, but "that is outside the five workstreams; here is a change order."
**Standing decision:** CONFIRM V2-6. The fee half was decided 2026-07-09 (fee appears in the charter only). The change-order half is taken as recommended here: a change order carries a SCOPE DESCRIPTION and never a number; the fee conversation stays a conversation, and money stays in Trellis and off-platform.
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing move-to-Phase-5 instruction.
**Date:** 2026-07-11

---

## 1. What 5E is

- **Migration 0033:** `change_orders`: the ask (title, description, who asked), the decision (agreed|declined, response in writing, when), and structurally NO fee column. Both teams read (the whole point is one shared page); the client insert policy admits only a self-authored, open, unanswered ask on their own engagement; only the practice decides; nobody deletes, because a declined ask is a boundary held and that is worth keeping.
- **Client surface:** the "Outside the lines" section at the bottom of /charter, where the scope lives: the ask form and the list with answers. Pure RLS.
- **Practice surface:** the Change orders section on the engagement page: open asks with an answer box (the response is REQUIRED either way; a yes explains what it means, a no says where the thing lives instead, usually BloomOS), decided ones showing the answer. Notifications ride 4F both directions (change_order_requested to the practice, change_order_decided to the client team).

## 2. CONFIRM gates for 5E (V2-6 fee half already decided; the rest taken as recommended)

| # | Question | Recommendation |
|---|---|---|
| 5E-1 | No fee column, structurally; scope words only? | Yes. The V1 no-payments law and the Trellis bright line, kept by the schema |
| 5E-2 | The answer is required in writing, agree or decline? | Yes. A silent yes erodes the boundary as surely as a silent no erodes trust |
| 5E-3 | Nobody deletes a change order? | Yes. A boundary held is a record worth keeping |

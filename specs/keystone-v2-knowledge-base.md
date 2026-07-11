# Spec: Keystone V2 4H, the practice knowledge base container

**Parent:** `specs/keystone-v2.md` Phase 4 epic 4H: the reusable internal knowledge base: SOPs, frameworks, proposal language, agenda and homework and deliverable templates, diagnostic questions, prompt recipes. Product-tier; build the container in Phase 4, fill it as templates (1C) prove out.
**Grounded against:** the live codebase after 4G. The library (Ring 4 + the V2 authoring upgrades) is one practice-scoped catalog readable by every client member of the practice. 3F's split (client learning path vs practice knowledge base) was decided but only the client half existed.
**Status:** BUILT 2026-07-11, same day as the spec, under Remi's standing finish-Phase-4 instruction (gates taken as recommended).
**Date:** 2026-07-11

---

## 1. What 4H is

- **Migration 0029:** `resources.audience` ('client'|'practice', default 'client' so every existing row keeps its meaning), the kind list grown with the knowledge-base shapes (sop, agenda_template, homework_template, deliverable_template, prompt_recipe, diagnostic), and the read policy narrowed: practice members read everything; a client session reads client-audience rows only. The action_items audience pattern applied to the catalog; the matrix proves the wall from both sides.
- **Authoring:** the form gains the audience choice ("Client learning path" / "Knowledge base, practice only") and the new kinds. The authoring index groups the two halves so the split reads at a glance.
- **The client library is byte-identical in code:** pure RLS means the page changes nothing; the policy is the wall. Practice-audience rows simply never arrive.
- **Container only.** No seeding of SOBO playbooks: whether they live here or stay in Trellis is Remi's standing decision to make deliberately, later. The room exists; moving in is a choice.

## 2. CONFIRM gates for 4H (taken as recommended under the standing instruction)

| # | Question | Recommendation |
|---|---|---|
| 4H-1 | Same table plus an audience wall, not a second resources table? | Yes. One catalog, one authoring surface, one policy; the split is a wall, not a fork |
| 4H-2 | Default 'client' so existing rows keep their meaning? | Yes. No migration of meaning, no surprise disappearances from client libraries |
| 4H-3 | Container only; SOBO playbooks stay in Trellis until decided? | Yes. Build the room, do not move the furniture uninvited |

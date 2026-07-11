# Spec: Keystone V2 3E, contextual message anchors

**Parent:** `specs/keystone-v2.md` Phase 3 epic 3E: keep the single calm thread, but let a message carry its context. The 3E law from the harvest list holds on both ends: one thread per engagement, and the inbox stays a reading surface; anchors add context to the one place people already write, never a second place to write.
**Grounded against:** the live codebase after 3D. Messages are one thread per engagement, self-authored inserts, bodies immutable to every session with `read_at` as the only updatable column (the 0007 column grant). That grant is this epic's free lunch: anchor columns set at send time become immutable the same way the body is, with zero new machinery. Every anchorable artifact now exists: sessions with purposes, homework items with loops, deliverables with acceptance, workstreams, decisions.
**Status:** draft for Remi. CONFIRM gates in section 7.
**Date:** 2026-07-10

---

## 1. What 3E is

"Ask a question" grows hands. From a deliverable, a homework item, a session, a decision, or a workstream, one tap opens the message box with the artifact attached as an anchor; the sent message renders with a chip ("about: the board deck") that links back to the artifact on whichever side is reading. The question travels with its context, the answer lands in the one thread, and nobody ever writes anywhere new.

## 2. Schema (migration 0023)

```sql
alter table public.messages
  add column anchor_type text
    check (anchor_type in ('session','action_item','deliverable','workstream','decision')),
  add column anchor_id uuid,
  add column anchor_label text,
  add constraint messages_anchor_whole
    check ((anchor_type is null) = (anchor_id is null)
       and (anchor_type is null) = (anchor_label is null));
```

- **Immutable for free (gate 3E-1):** the 0007 column grant already limits every session UPDATE on messages to `read_at`; the anchor columns are covered by the same revoke the moment they exist. Set at send, sealed at send, like the words themselves.
- **The label is denormalized and SERVER-DERIVED (gate 3E-2):** the send action resolves the anchor id inside the engagement's own scope, reads the artifact's real title (or date, for a session) itself, and writes that. The browser sends only a type and an id; a forged or out-of-scope id fails the send. The chip therefore renders without joins and survives the artifact's later deletion honestly ("about: the board deck", even if the deck was removed).
- **Digest anchors are DEFERRED (gate 3E-3):** the V2 sketch lists digests, but digests have no client surface until 3G's archive; an anchor nobody can follow is a dead link by design. The check constraint grows the value when 3G lands.
- **Isolation matrix, same PR:** an anchored insert with an out-of-scope anchor id is refused by the send action (app-layer, asserted in the static gate) while the RLS walls stay byte-identical and re-asserted; anchor immutability asserted (a session UPDATE touching anchor_label fails on the column grant); the existing self-authorship and wall cases re-run over the new columns. Static gate `message-anchors.spec.ts`.

## 3. Surfaces

**Entry points (gate 3E-4), each one tap, each prefilling the one composer:**
- Client side: "Ask about this" on a deliverable card (/deliverables), on a homework item page, on a session detail page, and on a decision (/decisions). Each links to `/messages?anchor=<type>:<id>`; the composer shows the chip ("about: ...", with a plain remove link) and sends with the anchor.
- Practice side: the same links on the engagement page thread (deliverables, decisions, items), prefilling the reply box there.

**Rendering:** an anchored message shows its chip above the body on both surfaces, linking side-appropriately (the `CLIENT_HREFS` discipline from the Q&A engine: the client goes to /deliverables, /homework/:id, /sessions/:id, /decisions; the practice to the engagement page and its subpages). A chip whose artifact is gone renders as plain text, no dead link.

**No composer picker (gate 3E-5):** the message box itself stays one calm box. Coming FROM an artifact is the picker; a dropdown enumerating every artifact in the engagement is a filing cabinet bolted to a conversation.

**4F:** no new emissions; the existing message_reply rows and emails carry on, and the chip shows up wherever the message does.

## 4. What this hands the later epics

3G's digest archive adds the digest anchor value and its chip. 4A's queue can group "client waiting on us" by what the question is about. 5A's closeout reads anchored questions as the engagement's FAQ raw material.

## 5. AI

None. (The Q&A engine stays separate and unchanged: Ask the record answers from the record; messages reach the human.)

## 6. The per-feature gate walk

- No new tables; three columns on an already-matrixed table whose walls and column grant are re-asserted; the whole-anchor check constraint keeps partial anchors out at the schema.
- New person-data: none; an anchor is a pointer plus a label the recipient could already read.
- Client surface stays pure RLS: the send action resolves and validates the anchor through the SESSION client, so a client member can only ever anchor what their own wall admits (an internal practice task, for instance, cannot be resolved and therefore cannot be anchored).
- Copy voice-swept; chips are quiet mono labels, not badges.
- Mobile: the chip wraps under the composer at 390px; entry-point links are full-width taps.

## 7. CONFIRM gates for 3E

| # | Question | Recommendation |
|---|---|---|
| 3E-1 | Anchors immutable once sent, riding the existing messages column grant? | Yes. Correspondence is a record; an anchor that can be repointed later rewrites what a question was about |
| 3E-2 | The label denormalized at send and derived server-side, never trusted from the browser? | Yes. The chip renders joinlessly, survives artifact deletion honestly, and a forged label never lands |
| 3E-3 | Digest anchors deferred until 3G gives digests a client surface? | Yes. An anchor nobody can follow is a dead link by design |
| 3E-4 | Entry points on the artifacts (deliverable, homework item, session, decision, workstream fold), one tap into the one composer? | Yes. This is the whole epic: context travels, the thread stays singular |
| 3E-5 | No anchor picker inside the composer at launch? | Yes. The box stays calm; coming from an artifact IS the picker. Revisit only if the pilot shows people hunting for it |

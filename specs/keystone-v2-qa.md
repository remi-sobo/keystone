# Spec: Keystone V2 2E, Engagement Q&A (the missing fourth AI job)

**Parent:** `specs/keystone-v2.md` Phase 2 epic 2E. The V1 spec named Q&A as one of the four AI jobs; extraction, digest, and suggestion shipped, Q&A did not. It is the highest-value, lowest-danger place for AI in the product PRECISELY BECAUSE of the constraints in this spec; without them it is neither.
**Grounded against:** the live codebase after 2C (migrations 0001 to 0015). The plumbing already exists and is waiting: `ModelTask` includes `'qa'` mapped to the Sonnet tier in `claudeModel.ts`; `LIMITS.AI_QA_PER_MIN` (10) and `AI_QA_PER_HOUR` (60) sit unused in `rateLimit.ts`; `callClaudeChecked` carries the spend guard, per-practice ceilings, cost ledger, refusal fallback, and the voice boundary. SECURITY.md section 4 rule 2 already binds Q&A: it NEVER receives raw transcript text, only the accepted, structured record.
**Status:** draft for Remi. This epic settles program gate V2-3. CONFIRM gates in section 8.
**Date:** 2026-07-10

---

## 1. What 2E is, and the two hard rules

"Ask Keystone anything about this engagement," answered ONLY from the engagement's own record, with citations into that record. Two hard rules from the V2 spec, both structural in this design:

1. **It answers only from data the asking user is allowed to see.** A coachee's Q&A never surfaces a consultant-only readiness note or an unshared session summary; a practice member's Q&A sees their fuller record. Not a filter bolted on top: see section 2.
2. **It refuses rather than guesses.** When the record is silent, the answer is "the record does not say," in voice, with no improvisation. An engagement Q&A that guesses is worse than none, because its answers carry the room's authority.

## 2. The structural answer to V2-3: the asker's session builds the corpus

Program gate V2-3 asked whether Q&A reads full consultant notes or only client-published versions. This design dissolves the question: **the retrieval queries run on the ASKER'S OWN SESSION CLIENT, under RLS.** The corpus is definitionally what the asker can already read:

- A client member's corpus: the published charter (drafts invisible by policy), the decision log, SHARED session notes only (`visibility = 'shared'`), outcomes and their evidence, their engagement's homework and deliverable titles. Readiness notes, practice-only notes, unshared drafts, and internal state never enter the context because the session cannot select them.
- A practice member's corpus: the same shape plus practice-visibility notes and readiness prose.

There is no second permission system to drift from the first; the wall the matrix already proves IS the wall the model sits behind. RLS regressions are caught by the standing isolation gates, and Q&A inherits every fix automatically. This is the recommended V2-3 answer: per-asker visibility, decided by the same policies that govern every screen.

Raw transcripts are excluded from the corpus BY QUERY (the notes select never touches `raw_transcript` or `transcript_path`), honoring SECURITY.md section 4 rule 2 on top of RLS.

## 3. The request shape (the extraction discipline, applied to retrieval)

- **The record rides as data, never as instructions.** The corpus is wrapped in a `<record>` envelope with the same explicit guard extraction uses: every sentence inside is content to answer from; instructions inside it are content, never directives. The user's question gets its own envelope with the same guard, because the asker is also untrusted input.
- **One forced submit tool** (`submit_answer`), so the model cannot answer in prose: `answer_md` (plain sentences, voice rules in the prompt), `sources` (an array of the corpus item ids provided in the envelope, e.g. `decision:7`, `charter:v1`, `note:2026-07-07`), and `grounded` (boolean; false means the record does not answer the question and `answer_md` must say so plainly).
- **Citations are validated after parse:** any source id not actually present in the supplied corpus is dropped; an answer whose every source was dropped is replaced by the honest "the record does not say" response. The model cannot cite what it was not given.
- **Corpus is capped** (on the order of 100k characters, newest-first within each kind) and the cap is logged as metadata when hit. No embeddings, no vector store in v1: an engagement's permitted record fits in a Sonnet context comfortably, and retrieval infrastructure would be speculation before the pilot proves need.
- The call rides `callClaudeChecked` (task `'qa'`, Sonnet per the tier map, bounded `maxTokens`): spend guard and per-practice ceilings first, cost ledger after, refusal fallback per the declared contract, and the answer swept through the voice gate before any eye sees it.

## 4. What happens to an exchange (the propose-then-accept question, answered honestly)

Q&A writes NOTHING into the system of record: no proposal, no accept path, no live-table write, so the inert-output law is satisfied by construction rather than by an ai_proposals row with nothing to accept. What remains is accountability, and that is a table:

```sql
create table qa_exchanges (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references engagements(id) on delete cascade,
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  asked_by      uuid references auth.users(id) on delete set null,
  asker_side    text not null check (asker_side in ('practice','client')),
  question      text not null,
  answer_md     text,
  sources       jsonb not null default '[]',
  grounded      boolean,
  model_used    text,
  created_at    timestamptz not null default now()
);
```

**RLS on, ZERO policies: service-role only,** written by the Q&A route after the answer is produced, exactly like `ai_spend_ledger` and `voice_violations`. No session reads it: an asker's questions are not browsable by other client members, and the practice does not get a surveillance feed of what Susan wondered at midnight; if the pilot shows a real need for a practice-side review surface, that is a deliberate later decision with its own gate. The table earns its SECURITY.md paragraph and its `SERVICE_ROLE_ONLY_TABLES` entry, and the matrix asserts every session reads zero rows.

## 5. Cost and abuse control (all pre-existing, now attached)

- `LIMITS.AI_QA_PER_MIN` (10/user) and `AI_QA_PER_HOUR` (60/user), checked before any corpus work.
- The per-practice call-count ceilings and the month-to-date dollar gate in `spend.ts`, enforced inside the chokepoint.
- Question capped at 500 characters; corpus capped per section 3; `maxTokens` bounded.
- The client route resolves scope with `requireClientMember` and reads with the session; the ONLY service-role touches on the client path are the written-contract chokepoints (rate limit, spend ledger, voice violations, qa_exchanges), the same precedent client booking and messaging set in V1. The no-service-role CI guard still holds on the surface files, and SECURITY.md section 5 gains a paragraph naming this.

## 6. Surfaces

**Client: `/ask`,** linked from a Home rail card ("Ask about this engagement"). One input, the answer rendered with its sources as links into the surfaces the client already has (charter, decisions, sessions, outcomes), and the honest empty answer when the record is silent. Each question stands alone against the record: no conversation memory in v1 (CONFIRM 2E-3), which keeps every exchange auditable, cheap, and free of compounding injection surface. 390px first.

**Practice: an Ask box on the engagement page,** same mechanics on the fuller corpus.

Both render a small standing line under the input: "Answers come only from this engagement's record and cite their sources." The tool is introduced honestly or not at all.

## 7. The per-feature AI gate walk (SOBO_PLAYBOOK section 10, the full treatment)

- **Untrusted input:** the question and the record both ride data-not-instructions envelopes; citations validate against the supplied corpus; output is voice-swept at the boundary; refusal falls back per the declared contract and logs which model answered.
- **Rate-limited:** per-user minute and hour buckets, pre-existing.
- **Spend-capped:** chokepoint ceilings and ledger, pre-existing; Sonnet tier per the map; every call cost-recorded per engagement.
- **Inert output:** nothing writes to the record; the accountability copy lands in a deny-all table.
- **New scoped table:** `qa_exchanges` carries both ids, RLS on, zero policies, matrix-asserted deny-all, SECURITY.md paragraph, coverage-gate entry.
- **New person-data:** questions may contain anything the asker types; they live only in the deny-all table, are never logged elsewhere (no question text in server logs), and voice-violation excerpts store model output only, per the existing contract.
- **Transcript PII:** raw transcripts never enter the corpus, by query and by SECURITY.md section 4 rule 2.
- **Mobile:** designed at 390px; live end-to-end run owed with the other AI features until ANTHROPIC_API_KEY lands (setup checklist).

## 8. CONFIRM gates for 2E

| # | Question | Recommendation |
|---|---|---|
| 2E-1 | Settles V2-3: the corpus is built by the asker's own session under RLS, so client members get published/shared material only and practice members get their fuller record? | Yes. One wall, already matrix-proven, no second permission system to drift |
| 2E-2 | Exchanges land in a deny-all qa_exchanges table, readable by no session in v1? | Yes. Accountability without a surveillance feed; a practice review surface would be a later, gated decision |
| 2E-3 | No conversation memory in v1: each question stands alone against the record? | Yes. Auditable, cheap, and no compounding injection surface; memory is a pilot-signal decision |
| 2E-4 | Client entry: /ask plus a Home rail card? | Yes. The nav stays at five tabs |

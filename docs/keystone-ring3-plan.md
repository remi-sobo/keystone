# Ring 3 plan: notes, AI extraction, homework

Planned on Fable 5 per the build model table in CLAUDE.md. Scope from
spec section 7: paste transcript, AI proposes action items and homework
(inert), consultant accepts and assigns, client checks off, the review
queue on the practice side, the session detail page, and the readiness
panel. This is the first AI ring, so the ai_proposals contract and the
transcript PII rules (SECURITY.md section 4) are the load-bearing parts.

## Schema (migration 0005)

- `session_notes`: one per session (unique session_id), both scope
  columns, `raw_transcript` text in-row (paste cap enforced in the
  action; `transcript_path` exists for the long-transcript storage
  offload, wired when a real transcript exceeds the cap), `summary_md`,
  `decisions_md`, `visibility` ('practice' until accept publishes
  'shared'). Read: practice members always; client members only when
  shared AND their client. Write: engagement.write.
- `action_items` (the spec's action_items / homework, one table): both
  scope columns, optional workstream/session links, title, assignment to
  a client member OR a practice member, `due_on`, `timing`
  (before_session | after_session | standing), status open | done,
  done_at, source (accepted_proposal | manual), proposal_id. Read: both
  dimensions (all four SafeSpace people see the same picture). Write:
  engagement.write; PLUS a client check-off policy: a client member may
  update only rows assigned to their own membership (helper
  `private.owns_client_membership`), which under RLS means check-off,
  the one client write.
- `ai_proposals`: kind, payload jsonb, status proposed | accepted |
  dismissed, both scope columns, session link, actor columns. Read:
  practice members only (a client never sees proposals). NO
  insert/update policies for sessions: the AI writes through the service
  role in the extraction route, and the single accept route is the only
  path into live tables. Inert by construction, not convention.
- `readiness_markers`: engagement plus pillar (philosophy | system |
  execution) unique, note_md prose. Consultant-only read and write
  (CONFIRM 12 default); never scored, never client-visible until a
  deliberate share ships later.

## AI plumbing

- `src/lib/extract.ts`: a PURE request builder (system prompt, forced
  submit tool with the JSON schema, transcript as data) plus the parse
  and coercion step (Zod re-validation; drop assignee hints that name no
  real member). The transcript is untrusted input: the system prompt
  instructs the model to treat it as a record to extract from, never as
  instructions; nothing from the transcript reaches any other AI
  context (SECURITY.md section 4).
- Extraction route (practice surface): requirePracticeMember, Zod, rate
  limits (AI_EXTRACT per min/hour), callClaudeChecked (task `extract`,
  so claude-opus-4-8, the spend guard, per-engagement ledger, and the
  refusal fallback all apply), voice sweep on prose fields with drift
  logging, then ONE write: an ai_proposals row.
- Accept route (practice surface): requirePracticeMember, Zod, load the
  proposal scoped by practice, write summary/decisions to session_notes
  (visibility shared), insert action_items with the consultant's
  (possibly adjusted) assignments, mark the proposal accepted, audit
  metadata. Dismiss sets status dismissed. This is the single human
  accept path.

## Surfaces

- Practice session detail `/sessions/[id]`: the run of show. Paste
  transcript, extract, review the proposal (editable assignments),
  accept or dismiss; the accepted note and items render below.
- Practice engagement detail `/engagements/[id]`: workstreams, sessions
  linking to detail, the homework ledger per person, the review queue
  (items done in the last 14 days), and the readiness panel (three
  pillars, prose, saved through the session client under RLS).
- Client homework page: open items grouped by due date, check-off
  (pure-RLS update through the assignment policy), done history.
- Client session detail `/sessions/[id]`: mono eyebrow header, decisions
  as the led block, their homework, the transcript folded behind a
  disclosure (shared notes only).
- Client home right rail: homework due count goes real.

## Gates

- `e2e/ring3-isolation.spec.ts`: static pins for the four tables (both
  dimensions on reads, proposals invisible to clients, readiness
  consultant-only, the client check-off policy shape, no client path
  writes proposals) and route checks (extract writes ai_proposals only;
  accept is the one insert path into action_items from proposals).
- Live matrix additions: notes visibility flips on accept; cross-client
  zero on notes/items/proposals/readiness; a client member checks off
  their OWN item and cannot touch a teammate's or another client's;
  clients read zero proposals and zero readiness rows.
- Pure unit spec for the extraction builder and coercion.

## Out of scope (held for their rings)

Practice Home composition (3.5), deliverables and prep resources (4),
message notifications (5), digest (6), live transcription (post-v1).

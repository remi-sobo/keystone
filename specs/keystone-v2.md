# Spec: Keystone V2 (program spec)

**Product:** Keystone, client delivery platform for coaches and consultants.
**This document:** the V2 roadmap. It sequences and frames the work; it does not implement it. Every epic below becomes its own research → design → spec → build cycle when its turn comes, using the `spec` skill, landing as `specs/keystone-v2-<epic>.md`.
**Grounded against:** the V1 codebase at Rings 1 through 6 (migrations 0001 to 0008), inspected directly.
**Status:** draft for Remi. No build starts until the pilot has run (Phase 0) and each epic is individually specced.
**Date:** 2026-07-09

---

## 0. The V2 thesis

V1 is a secure room where a client sees the engagement. V2 is the operating room where the engagement is run, remembered, and handed off so it stands without you. Every feature below is judged against that sentence and against four standing laws that do not bend for any feature:

1. **Propose-then-accept.** Any new AI surface proposes into an inert table; a human accepts. No autonomous writes, ever. (V1 pattern: `ai_proposals`.)
2. **Humane data.** Keystone never scores a person or an organization. No grades, no leaderboards, no health labels shown to the client about themselves. Growth is rendered as history, never as a percentage on a human. The coachee's work is walled from the buyer's view (see the privacy wall, §3C).
3. **The boundary holds.** Keystone holds the engagement. BloomOS holds the client's operation. A feature that helps the client run their nonprofit belongs in BloomOS. Additions to Keystone require an edit to the boundary table in the V1 spec first.
4. **Isolation is proven, not assumed.** Every new scoped table carries `practice_id` and `client_id`, and extends the seeded cross-practice and cross-client isolation matrix in the same PR that creates it. This is a build law, not a feature.

Plus the always-on gates from V1: mobile-first at 390px, the voice gate (no em dashes, no banned words, no client or person framed as broken), audit on every mutation, spend-capped and rate-limited AI.

---

## Phase 0: Pilot and harvest (a discipline, not a build)

Before one line of V2, run V1 with SafeSpace for a real stretch (proposal: three to four weeks, the Diagnose and early Design period). The point is to let the pilot tell you which V2 features are real and which are speculation, and to surface gaps this document cannot predict.

- **Do:** use every V1 surface with the real four-person team, keep a running list of friction, note every time you reach for the database to do something the UI should do.
- **Do not:** start Phase 1 speculatively. The admin gap is already proven, so Phase 1 is safe to spec during the pilot, but everything downstream waits on real signal.
- **Definition of done:** a harvested gap list, and a confirmed or corrected priority order for Phases 2 through 5.
- **Seed first:** before the pilot starts, enter the SafeSpace seed (`docs/seed/keystone-safespace-seed.md`): rename workstreams to the proposal's four, load the decision log content as an early deliverable or notes, seed homework starters and the deliverables ledger, and honor its §12 exclusion wall in every transcript extraction from day one.

**CONFIRM V2-1:** how long the pilot runs before Phase 1 ships, and whether Phase 1 specs are written during the pilot or after.

---

## Phase 1: Operability (what opens tenant two)

The blocker the consultant correctly named first. Today a practice, client, member, or engagement is born from SQL. Keystone cannot be run by a non-engineer, cannot onboard a second client without you in the database, and cannot become a product. This phase is what opens the entire "sell it later" thesis, so it comes first.

### 1A. Practice admin UI
**V1 has:** `client_members` is email-keyed with a nullable `user_id` and `claimed_at`, so the invite-and-claim model exists in the schema. There is no UI to create or manage any of it. Settings covers availability and Google only.
**The V2 move:** a members and access surface. Add and remove practice members, change role (owner or consultant), add a client, invite a client member, resend invite, deactivate, see pending-invite status and last login.
**My additions:** the invite email is the client's first impression, so it is a designed artifact, not a raw magic link; route it through the same warm template system as the digest. Deactivation is soft (revoke access, keep the record and the audit trail), never a hard delete, per the standing no-hard-delete rule.
**Boundary or humane check:** "last login" is operational, not a score; show it to the owner only, never as a client-facing signal.
**Depends on:** nothing. First build after the pilot.

### 1B. Engagement Builder (light)
**V1 has:** a seed script that builds SafeSpace. Nothing in the UI.
**The V2 move:** create an engagement from the UI: client basics, people and roles, workstreams, stage config, cadence, digest settings, invites out.
**My additions:** build it as a resumable draft, not a wizard that must finish in one sitting, because scoping a real engagement takes days and conversations. The builder writes a draft engagement that is invisible to any client member until you publish it. Pair the last step with the Charter draft (2A) once that exists, so creating an engagement and stating its constitution are one motion.
**Depends on:** 1A.

### 1C. Engagement templates
**V1 has:** nothing.
**The V2 move:** capture the SafeSpace shape (its workstreams, default stages, common sessions, prep resources, homework patterns, digest tone) as a reusable template the builder starts from.
**My additions:** do not design templates in the abstract. Build exactly one, extracted from SafeSpace after the pilot, and prove the builder can instantiate it. The library of templates (nonprofit ops, coaching sprint, and so on) comes only once you have run two real engagements, or you will encode guesses as defaults. This is your "first build is R&D, replay is margin" principle applied to the product itself.
**Depends on:** 1B, and at least one real completed engagement shape.
**CONFIRM V2-2:** is a template practice-private, or eventually a shareable/sellable asset across practices? (Affects the schema now.)

### 1D. Client first-run onboarding
**V1 has:** a login page, then a cold drop into Home.
**The V2 move:** a first-login sequence: who you are here, what this room holds, your people, and your first next move.
**My additions:** anchor it on the Charter (2A) and Your Next Moves (2D) rather than a generic tour, so the first thing a client sees is their own engagement's purpose, not a product walkthrough. Keep it skippable and it never repeats.
**Depends on:** ideally 2A and 2D, so this may land at the Phase 1/2 seam.

---

## Phase 2: The engagement becomes legible (the Charter spine)

The Charter is the constitution, and most of V2's client value hangs off it: outcomes derive from its success measures, the decision log and Q&A read against it, roles feed stakeholder modes, closeout closes against it. So it is the backbone of this phase, and its dependents follow.

### 2A. Engagement Charter
**V1 has:** nothing. Scope and intent live in your head and in email.
**The V2 move:** a client-facing shared agreement: why this engagement exists, outcomes, scope, workstreams, timeline, roles, cadence, what success looks like, what is explicitly not included, key risks, decision owners.
**Seed exists:** the full SafeSpace charter content is already drafted in `docs/seed/keystone-safespace-seed.md` (extracted from the proposal, the recap email, and the July 7 call), so 2A's build starts from real content, not lorem ipsum. **My additions:** the "not included" section is the most valuable and most skipped; it is your standing answer to scope creep and to the BloomOS-bleed problem (grant tracking is "not included," it is a change order, §5E). Make the Charter versioned from day one, because scope changes and you want the history. The Charter is the one document both sides sign off on (ties to Approvals, §5D).
**Boundary check:** the Charter describes the engagement, never the client's operational plan.
**Depends on:** nothing structural; wants Approvals (5D) for sign-off but can ship read-first.

### 2B. Decision Log
**V1 has:** decisions live inside `session_notes.decisions_md`, unstructured.
**The V2 move:** decisions as first-class rows: decision, date, who, context, related session, related workstream, revisit date.
**My additions:** decisions are mostly born inside the AI proposal review (3A), so wire the two together: accepting a proposed decision writes a decision-log row, no double entry. The log is the primary source for Q&A (2E). Keep decisions immutable once logged, with an explicit "superseded by" link rather than edits, so the history of how thinking changed is preserved.
**Depends on:** pairs with 3A; can ship standalone with manual entry first.

### 2C. Outcomes and success measures
**V1 has:** nothing. Progress is shown as stage, not as value.
**The V2 move:** the engagement's own success measures (weekly rhythm adopted, dashboard live, staff trained, owner named per workflow), each with a target and current evidence.
**My additions:** these must derive from the Charter's success section, not be a separate invented list, or the two drift. Evidence links to real artifacts (a deliverable, a session, a completed homework), never a self-reported number. Confidence is descriptive prose, never a score. This is explicitly the engagement's outcomes, never the client's business metrics, which are BloomOS.
**Depends on:** 2A.

### 2D. Client "Your Next Moves"
**V1 has:** Home shows where things stand, not what the client personally must do.
**The V2 move:** a calm personal action center: homework due, session prep, deliverables awaiting your review, decisions needed from you, unread replies, upcoming sessions.
**My additions:** this is per-person, so it respects the two postures: Aris and Jasmine see homework and prep; Susan and Liesl see approvals and decisions, not a coachee's task list. On mobile this is the top of Home, above the arc, because the phone is where the coachees live. It reads from existing tables, so it is mostly composition, a small build with high felt value.
**Depends on:** light; grows richer as 3C, 3D, 2B land.

### 2E. Engagement Q&A (the missing fourth AI job)
**V1 has:** the spec named Q&A as an AI job; it is not built. Only extraction and digest AI surfaces exist.
**The V2 move:** "ask Keystone anything about this engagement," answered only from the engagement's own record (charter, decisions, notes, homework, deliverables, digests), with in-app source citations.
**My additions:** this is the highest-value, lowest-danger place for AI in the product, precisely because it is retrieval over a closed, permissioned record and cites its sources. Two hard rules: it answers only from data the asking user is allowed to see (a coachee's Q&A never surfaces a consultant-only readiness note), and it refuses rather than guesses when the record is silent. Runs on Sonnet per the tier map. Build it after the Charter and Decision Log exist, because those are the corpus that makes answers good.
**Depends on:** 2A, 2B, and the existing notes/deliverables.
**CONFIRM V2-3:** does Q&A read consultant-authored session notes in full, or only the client-published version? (Permission-scoping decision.)

### 2F. Workstream detail and "why we're here"
**V1 has:** `WorkstreamArc.tsx` shows the stage. `workstreams` has no explanatory note field.
**The V2 move:** an expandable panel per workstream: stage meaning, why this stage now, recent decisions, related homework and deliverables, the next session tied to it, and a one-line consultant note ("we are in Build because the intake workflow is drafted and being tested").
**My additions:** the "why we're here" note is a small text field with outsized effect; it is the difference between a dashboard and understanding. Draftable by AI from recent stage events and decisions (propose-then-accept), approved by you, so it stays current without being a chore.
**Depends on:** reads better with 2B; the note itself is standalone.

---

## Phase 3: Delivery craft (the working surfaces get depth)

The surfaces exist and are thin. This phase gives them the texture real consulting needs, one surface at a time.

### 3A. Editable AI proposal review
**V1 has:** `extract.ts` proposes summary, decisions, action items into `ai_proposals`; accept is coarse (accept or dismiss, assign people and dates).
**The V2 move:** a review workspace. Edit the summary, edit decisions, delete or rewrite or split action items, convert an item into homework or an internal task or a parking-lot note, save as draft, publish selectively (summary only, or summary plus decisions, or plus homework).
**My additions:** this is where decisions (2B) and internal tasks (4B) are born, so it is a hub, not a leaf; sequence it early in Phase 3. Preserve the original AI proposal alongside the edited version in the audit trail, so "what the AI said" versus "what you published" is always recoverable.
**Depends on:** pairs with 2B and 4B.

### 3B. Session Run of Show
**V1 has:** solid scheduling (availability, timezone-correct, no double-book, Google sync, book/reschedule/cancel). Sessions are calendar events, not structured meetings.
**The V2 move:** structure per session. Upcoming: purpose, agenda, prep resources, attendees, decisions targeted, homework due before. Completed: summary, decisions, action items, follow-up, related deliverables.
**My additions:** the run of show is the bridge between the arc and the calendar: a session's purpose should name the workstream and stage it intends to move ("this session moves Program Rhythm from Design to Build"). Add light reschedule structure (minimum notice, optional reason, and a note that moving the session moves its prep and homework dates), which keeps scheduling calm but professional.
**Depends on:** reads prep resources from the library (3F) and homework (3C).

### 3C. Homework accountability loop (with the privacy wall)
**V1 has:** `action_items.status` is only `open` or `done`. Client checks off; practice sees completion.
**The V2 move:** richer statuses (assigned, in progress, submitted, needs revision, accepted, blocked), client comments, consultant feedback, evidence attachment, reminders. The client action shifts from "check off" to "submit"; the consultant "accepts" or "sends back with a note."
**My additions, and this is a hard design constraint the consultant's report misses:** the submission-and-revision cycle is between the coachee and the consultant only. Susan and Liesl must never see Aris or Jasmine's "needs revision" history, because that turns a coaching loop into a performance file the boss can read. The buyer view shows engagement-level progress, never a named coachee's revision record. Build the wall into the read policy, not just the UI. Reminders route through the notifications layer (4F), which therefore must exist before this ships its nudges.
**Depends on:** 4F for reminders. The privacy wall is non-negotiable.
**CONFIRM V2-4:** confirm the buyer-view wall: founders see completion at the workstream level only, never a coachee's per-item revision history. (I recommend yes, firmly.)

### 3D. Deliverable lifecycle
**V1 has:** `deliverables` are file or link, attached to a workstream, on a client timeline, via signed URLs. No preview, version, or acceptance.
**The V2 move:** preview, version history, "what this is for" and "how to use this" fields, related session and decisions, and acceptance (accept, request revision, ask a question).
**My additions:** acceptance is an action the client takes, so it is humane and useful; keep it. Cut passive per-person "viewed by" tracking, which is surveillance-adjacent and adds anxiety, not value. Versioning matters most for the artifacts you iterate (a deck, a workflow doc); do not force it on link deliverables. Acceptance ties to Approvals (5D) and to closeout (5A).
**Depends on:** 5D for the approval mechanic; can ship acceptance inline first.

### 3E. Contextual message anchors
**V1 has:** one immutable thread per engagement, email notify, read receipts.
**The V2 move:** keep the single calm thread, but let a message optionally anchor to a session, homework item, deliverable, workstream, decision, or digest, so context travels with the question.
**My additions:** do not build channels or Slack. An anchor is a reference, not a new inbox. The practice side sees "Jasmine asked about the Draft Intake Workflow," which routes attention without fragmenting the record. Anchors also feed the action queue (4A) and Your Next Moves (2D).
**Depends on:** light; richer as anchored objects exist.

### 3F. Library upgrade
**V1 has:** `resources` authored by practice, read by client, `session_prep_resources` links them to sessions. Flat catalog.
**The V2 move:** search, tags, collections, client-specific visibility, stage-based recommendations, assigned reading, and "attach to homework."
**My additions:** split the library's two jobs cleanly, because they have different rules. Client-visible resources (guides, worksheets, prep) are the client learning path. Practice-only resources (SOPs, agendas, templates, prompt recipes) are the beginning of the practice knowledge base (4H), which is product-tier. Build the client learning path now; hold the practice knowledge base for Phase 4. The "you usually attach the Weekly Rhythm Guide when a workstream enters Build" recommendation is a propose-then-accept surface, not an autopilot.
**Depends on:** recommendations want stage data (present) and usage history (accrues over time).

### 3G. Digest archive and stakeholder modes
**V1 has:** `digests` refuse empty weeks, draft from real records, require approval, send on approval. Email artifact only.
**The V2 move:** a persistent in-app digest archive (week of, recipients, what changed, upcoming, open homework), and per-recipient digest modes (buyer, coachee, digest-only, internal practice summary), with cadence per engagement.
**My additions:** stakeholder modes here should be display and delivery preferences, not new permission tiers; the truth stays single, the framing differs. This is where Liesl's advisory posture is honored (digest-first). The internal-only practice summary is a different document from the client digest and should never be sendable to a client by accident; separate the two paths in code.
**Depends on:** stakeholder modes pair with the mode concept in 4-series.

---

## Phase 4: Practice operating system (product-tier)

The layer that runs the practice, not just the engagement. Read this phase through the boundary: some of it duplicates what SOBO already runs in the Trellis command center. Those items are built for the product a future coach will buy, and SOBO's own instance may route around them. Each is flagged SOBO-tier (you will use it) or Product-tier (built for buyers, you may not).

### 4A. Practice Today action queue [SOBO-tier]
**V1 has:** `today/page.tsx` shows sessions, review queue, messages, digest drafts, stall watch as separate cards.
**The V2 move:** one prioritized action queue answering "what needs me today," grouped by urgency: client waiting on us, session prep needed, homework to review, digest to approve, workstream ready to move, follow-up overdue, deliverable promised.
**My additions:** the ordering principle is the weekly-ritual rule you already live by: what the client is waiting on ranks above what is merely queued. "Waiting on us" versus "waiting on client" is the single most useful distinction; build that flag first. This is the owner's daily control panel and the most-used screen you have, so it earns real design time.
**Depends on:** reads from most V2 tables; richer as they land.

### 4B. Internal tasks vs client homework [SOBO-tier]
**V1 has:** `action_items` can assign to a practice member, so the schema allows internal tasks, but the surfaces treat items as client homework.
**The V2 move:** a clear split. Client homework is client-owned and client-visible. Practice tasks are consultant-owned and invisible to clients. Shared commitments are visible to both.
**My additions:** this keeps Keystone honest, because not everything from a session is the client's job. Internal tasks are born in the proposal review (3A). Never let an internal task leak to a client view; this is an isolation-matrix case, test it.
**Depends on:** 3A.

### 4C. Staff workload and ownership [SOBO-tier, matures for product]
**V1 has:** consultant assignment is not modeled at the workstream level.
**The V2 move:** consultant assignment per engagement and per workstream, a workload view, upcoming sessions by consultant, and the waiting-on distinction across the practice.
**My additions:** this is where Kendra and Shannon become first-class, which matches your long-term vision of Kendra full-time. Keep it descriptive (who owns what, what is waiting), never a productivity score on your own team, same humane rule turned inward.
**Depends on:** 1A for members.

### 4D. Readiness panel: evidence-linked and deliberate share [SOBO-tier]
**V1 has:** `readiness_markers` exists (philosophy, system, execution), consultant-only prose.
**The V2 move:** each pillar gains linked evidence (related homework, sessions, decisions), a last-updated stamp, descriptive confidence (not a score), and a deliberate "share as a client-facing reflection" action.
**My additions:** the share action is a coaching conversation, so it is composed and sent on purpose, never a dashboard the client stumbles into. Execution is the pillar you cannot do for them, so its evidence is exactly the weekly-rhythm facts (sessions held, homework done on time, reps run), shown as history beside your judgment, never as a grade on Aris or Jasmine.
**Depends on:** 2B, 3C for evidence links.

### 4E. Engagement health (practice-internal triage) [SOBO-tier]
**V1 has:** nothing.
**The V2 move:** a practice-only read of momentum: responsiveness both ways, homework completion, stage movement, cadence held, messages unanswered, digest consistency, rendered in voice ("holding steady," "waiting on client," "ready for closeout").
**My additions, hardened past the report:** this is internal operational triage and it is never client-facing, not even gently. A client must never see a health label about their own engagement, because "needs attention" reads as a grade on them. And it aggregates engagement signals, never a person; "waiting on client" is about the engagement state, not about Jasmine. Keep it on the practice Today surface only.
**Depends on:** most V2 signals.

### 4F. Notifications and reminders layer [infra, cross-cutting]
**V1 has:** transactional email via Resend (`email.ts`) for messages and digest. No reminder or nudge system.
**The V2 move:** a real notification layer: homework reminders, session reminders, deliverable-awaiting-review pings, per-user channel and quiet-hours preferences, batched not spammy.
**My additions:** this is infrastructure that several Phase 3 features silently assume (homework nudges, run-of-show reminders), so its infra piece must land before those nudges ship, even though I list it in Phase 4. Build it in the propose-then-accept spirit: default to digest-style batching over real-time pings, and give every user a mute. A consulting client should feel held, not hounded.
**Depends on:** nothing; is itself a dependency. Pull the infra forward to the first Phase 3 feature that needs it.

### 4G. Pipeline-lite [Product-tier, SOBO uses Trellis]
**V1 has:** nothing, by design.
**The V2 move:** a light pre-engagement pipeline (lead, discovery, proposal, verbal yes, active, paused, closed) that converts a won deal into an active engagement via the builder.
**My additions, and the honest flag:** SOBO already runs pipeline and money in the Trellis command center, and we drew a bright line that the cross-venture business brain stays there. So for your own instance this is redundant and arguably a boundary breach. It exists only because a future coach who buys Keystone has no Trellis. Build it last, behind a practice-level feature flag that SOBO leaves off. Do not let it become a second place you track SOBO's money.
**Depends on:** 1B for conversion.
**CONFIRM V2-5:** confirm pipeline is product-tier and flagged off for SOBO. (I recommend yes.)

### 4H. Practice knowledge base [Product-tier]
**V1 has:** the practice-only half of the library (see 3F).
**The V2 move:** the reusable internal knowledge base: SOPs, frameworks, proposal language, agenda and homework and deliverable templates, diagnostic questions, prompt recipes.
**My additions:** same product-tier logic. Much of SOBO's "way of working" already lives in your playbooks and Trellis. For the product this is the compounding asset; for SOBO it partly duplicates what exists. Build the container in Phase 4, fill it only as templates (1C) prove out, and decide consciously whether SOBO's canonical playbooks live here or stay in Trellis.
**Depends on:** 3F, 1C.

---

## Phase 5: Closeout and compounding (the arch stands)

The phase most aligned with the brand thesis. The engagement should end with a formal "it stands without us" moment, and that ending should compound into your next sale.

### 5A. Closeout / Handoff room
**V1 has:** nothing.
**The V2 move:** a closeout surface: final outcomes, final deliverables, open risks, ownership map, maintenance rhythm, training completed, what-to-do-if-it-breaks, final digest, testimonial request, renewal or next-engagement option.
**My additions:** this is the signature feature, so it deserves the design bar the login page got. It closes against the Charter (2A): every success measure, resolved; every "not included," restated; every owner, named. The "what to do if it breaks" section is the most honest expression of your thesis and the thing that earns the referral.
**Depends on:** 2A, 2C.

### 5B. Engagement export and portability
**V1 has:** nothing. The data is legible but not portable.
**The V2 move:** a real export the client keeps: charter, decisions, deliverables, notes, outcomes, as a clean archive they own.
**My additions, the most on-brand feature nobody named:** your thesis is "we build the system, then remove ourselves, and it still stands." Portability makes that literal. The client should be able to walk away with the record of their engagement, not have it locked in your platform. This is also a trust and sales asset ("you own your data, you can leave with it") and a quiet differentiator against every portal that traps the client. Pair it with closeout.
**Depends on:** 5A.

### 5C. Case study builder
**V1 has:** all the raw material (before state, workstreams, sessions, deliverables, decisions, outcomes, closeout) but no assembly.
**The V2 move:** a draft case study generated from the engagement record, with client approval flow, quote capture, before-and-after summary, and export to website copy.
**My additions:** this closes the loop from delivery to marketing without extra manual work, and it ties straight into the SOBO site case studies you are already building. Propose-then-accept applies doubly here: AI drafts, you edit, and the client approves before anything becomes public. Never publish a client's name or quote without an explicit approval record.
**Depends on:** 5A; client approval ties to 5D.

### 5D. Approvals and sign-offs [cross-cutting]
**V1 has:** nothing.
**The V2 move:** explicit approvals at key moments: charter, deliverable, stage completion, closeout.
**My additions:** approvals thread through several earlier epics (charter sign-off in 2A, deliverable acceptance in 3D, case study consent in 5C), so build the approval primitive once, early enough that those features use it rather than each inventing their own. An approval is a durable, audited record of who agreed to what, when; it is what makes Keystone feel like a real delivery system and what protects you if scope is ever disputed.
**Depends on:** nothing; is a dependency for 2A, 3D, 5A, 5C. Consider pulling the primitive forward to Phase 2.

### 5E. Scope and fee context, and change orders
**V1 has:** nothing, and V1 intentionally excludes payments.
**The V2 move:** not full billing. Scope and fee context: the engagement fee (if shown, per gate), the scope boundary, and a change-order request when a client asks for something outside it.
**My additions:** the change order is the pressure valve for the BloomOS-bleed problem. When SafeSpace asks for the grant tracker inside Keystone, the answer is not a flat no and not a quiet yes that erodes the boundary; it is "that is outside our five workstreams, here is a change order." That protects the boundary, the fee, and the relationship at once. Keep actual payment off-platform; this is about clarity and scope protection, not invoicing.
**Depends on:** 2A for the scope definition.
**CONFIRM V2-6:** does the fee appear in-app at all (revisits V1 gate 9), and does a change order carry a number or just a scope description?

---

## Cross-cutting standing laws (apply to every epic)

- **Isolation matrix extension.** Every new scoped table extends the seeded cross-practice and cross-client matrix in the same PR. No exceptions.
- **Mobile-first.** Every surface designed at 390px first. The coachees and buyers live on phones.
- **Propose-then-accept.** Every new AI surface proposes into an inert table; a human accepts.
- **Humane data.** No scoring people or orgs; no client-facing health or grades; the coachee-to-consultant loop is walled from the buyer.
- **The boundary.** Engagement in Keystone, operation in BloomOS. Board material never enters the engagement record. Additions require a boundary-table edit first.
- **Voice gate.** No em dashes, no banned words, no person or client framed as broken, enforced by the config-integrity gate on shipped strings and on AI output at the boundary.
- **Audit on every mutation.** The `audit_log` table exists; V2 adds the surface (see Activity, below).

---

## Additions the report did not name (folded in above, listed here so none is lost)

1. **Notifications and reminders layer** (4F): real infra, assumed by several features, built by none.
2. **Client first-run onboarding** (1D): the invite lands, then what.
3. **Engagement export and portability** (5B): the arch-stands thesis made literal.
4. **Engagement search:** plain keyword search across the record, distinct from AI Q&A. Sometimes you just want to find the thing. Small, high-use. Slot into Phase 2 or 3.
5. **Activity view over the audit log:** you already store `audit_log`; give the owner a light per-engagement activity surface. Phase 4, near the action queue.
6. **Change orders** (5E): the boundary's pressure valve.
7. **The coachee privacy wall** (3C): a hard read-policy constraint, not a UI nicety.
8. **Product-tier flagging** (4G, 4H): a category, so you never duplicate Trellis before the product needs it.

---

## Recommended build order (each item is its own research → design → spec → build cycle)

**Phase 0** Pilot and harvest. No build.

**Phase 1** 1A admin UI → 1B engagement builder → 1C one real template → 1D first-run (may slip to the 1/2 seam).

**Phase 2** 5D approvals primitive (pulled forward) → 2A Charter → 2B Decision Log → 2F workstream detail → 2D Your Next Moves → 2C Outcomes → 2E Q&A → engagement search.

**Phase 3** 3A editable AI review → 4F notifications infra (pulled forward) → 3C homework loop with the wall → 3B run of show → 3D deliverable lifecycle → 3E message anchors → 3F library upgrade → 3G digest archive and modes.

**Phase 4** 4A action queue → 4B internal tasks → 4D readiness upgrade → 4C staff workload → 4E engagement health → activity view → 4G pipeline (flagged) → 4H knowledge base.

**Phase 5** 5A closeout → 5B portability → 5C case study builder → 5E scope and change orders.

Two ordering notes that matter: the Approvals primitive (5D) and the Notifications layer (4F) are dependencies, so they are pulled forward into Phases 2 and 3 respectively despite their numbers. Everything else follows dependencies top to bottom.

---

## My top ten for V2 (reordered from the consultant's, with reasons)

1. **Practice admin UI (1A)**: the piece that opens tenant two and the product.
2. **Engagement Builder (1B)**: without it, Keystone is forever hand-built for SafeSpace.
3. **Engagement Charter (2A)**: the spine most client value hangs off.
4. **Editable AI proposal review (3A)**: the hub where decisions and internal tasks are born; makes AI feel calm.
5. **Homework accountability loop with the privacy wall (3C)**: turns tracking into behavior change, safely.
6. **Decision Log (2B)**: the highest-value consulting artifact and the corpus for Q&A.
7. **Your Next Moves (2D)**: small build, large felt value, especially on mobile.
8. **Engagement Q&A (2E)**: the safest, highest-value AI in the product, and it is currently missing.
9. **Closeout and portability (5A, 5B)**: the brand thesis made real, and the referral engine.
10. **Practice Today action queue (4A)**: your daily control panel.

The consultant's list is close and good. The differences: I rank the Charter and the AI review hub higher because so much hangs off them, I fold portability into the closeout slot because it is what actually delivers the thesis, and I hold deliverable versioning and admin-heavy items a notch lower than the pieces that make the pilot sing.

---

## V2 CONFIRM gates

1. Pilot length before Phase 1, and whether Phase 1 is specced during or after.
2. Templates: practice-private, or shareable/sellable across practices? (Schema now.)
3. Q&A: reads full consultant notes, or only client-published versions?
4. Homework: confirm the buyer-view wall on coachee revision history. (Recommend yes.)
5. Pipeline: confirm product-tier and flagged off for SOBO. (Recommend yes.)
6. Fee visibility in-app (revisits V1 gate 9), and whether change orders carry a number.

---

*Next action after approval: run Phase 0 with SafeSpace, and during the pilot, spec 1A (Practice admin UI) as the first standalone V2 spec.*

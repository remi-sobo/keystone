# Spec: Keystone

**Product:** Keystone, the client delivery platform for coaches and consultants.
**Repo:** `remi-sobo/keystone` (new). **Surface:** `app.soboconsulting.com` (CONFIRM 1).
**Tenant one:** SOBO Consulting. **Client one:** SafeSpace (Susan, Liesl, Aris, Jasmine, CONFIRM 2).
**Engagement status:** proposal out, decision expected Thu Jul 9. Ring 1 should land at kickoff, not after it.
**Status:** Draft for Remi's approval. No code until approved.
**Date:** 2026-07-08

---

## 1. Problem statement

SafeSpace is paying SOBO $25,000 over six months and has nowhere to see it. The work is real, the calls happen, the deliverables ship, but from the client's chair it arrives as scattered emails, and the three staff each hold a different partial picture. They cannot see where the engagement stands, what was decided on the last call, what their homework is, when the next session lands, or what has been delivered so far. Remi, on his side, runs the engagement from the Trellis command center, which the client can never see. The gap between "the work is happening" and "the client can watch it happen" is where trust leaks and where every "quick status question" email comes from.

Keystone closes that gap. It is the room where a consulting engagement lives: the consultant runs delivery there, the client logs in and sees everything they are paying for, in one place, beautifully.

## 2. The boundary (pin this above the desk)

Keystone holds the **engagement**. BloomOS holds the client's **operation**.

The test for any feature request, from Remi or from SafeSpace: *does it help them run their nonprofit, or receive what SOBO is doing for them?* Run goes to BloomOS. Receive goes to Keystone.

| Keystone (in) | BloomOS (out, forever) |
|---|---|
| Engagement progress, workstreams, phases | Their org's own task management |
| Session scheduling, notes, action items | Grant-making, grant wizards |
| Homework assigned by the consultant | Donor ops, board docs, fundraising pipeline |
| Deliverables and collateral shipped | AI that produces their org's artifacts |
| SOBO's resource library | Their program and impact data |
| Messages between client and consultant | Anything they would keep after SOBO leaves* |

*One exception: the resource library access survives the engagement if Remi chooses (CONFIRM 3).

A second boundary, on Remi's side: Keystone is the **delivery loop**. The cross-venture business brain (money across SOBO, Trellis, Ambition Angels, pipeline, portfolio) stays in the Trellis command center and is never productized here.

## 3. Who uses it

Keystone is multi-tenant with **two nested scopes**, and getting this right is the whole schema:

- **Practice** (the top tenant, `practice_id`): a consultant or coaching firm. Tenant one is SOBO. This is the boundary you sell across later. A practice has members with roles `owner | consultant`.
- **Client** (`client_id`, always under one practice): an organization the practice serves. Client one is SafeSpace. A client has members with role `client_member`, and each client member sees only their own client's engagements, never another client of the practice, never another practice.

Named users, day one: Remi (practice owner), Kendra and Shannon (practice consultants, CONFIRM 4 on whether Shannon gets a login in v1), and four SafeSpace client members with two distinct postures:

- **Susan and Liesl**, co-founders, the buyers. Susan stays close to the day to day; Liesl is moving toward an advisory seat. They log in to *watch*: progress, deliverables, the digest. Liesl may want digest-plus-occasional-login rather than a daily surface (CONFIRM 10).
- **Aris and Jasmine**, the coachees, the ones being developed to lead fundraising. They log in to *work*: homework before and after every session, pitch reps, the weekly rhythm. Most of the homework volume lands on these two.

One `client_member` role covers all four; the difference is expressed through assignment and the digest, not through permissions. Everything in the engagement is visible to all four, which is itself the product: Aris and Jasmine seeing the same picture the founders see is how ownership transfers.

Personas to design for:

- **Remi after a call:** paste the transcript, accept the AI-proposed action items, assign homework to Aris and Jasmine, done in four minutes on a phone.
- **Aris on a Wednesday:** logs in, sees her two homework items due before Friday's session and the prep resource for it, checks off the donor-journey map she finished, sees the weekly rhythm block for this week.
- **Susan on a Tuesday night:** sees the fundraising workstream moved from Design to Build, the pitch deck delivered Monday, the next session booked, and feels the fee working.
- **Remi on Monday morning:** opens the practice Home and sees, across every client, this week's sessions, homework awaiting review, the digest queue, unanswered messages, and any workstream that has not moved in three weeks. Runs the week from one screen.

## 4. Scope

**In (v1, the six rings):**
- Practice → client → engagement → parallel workstreams, each workstream carrying its own Diagnose → Design → Build → Train → Stabilize stage.
- Engagement progress view, the client-facing "where are we" screen.
- Sessions: scheduling (client picks a slot from consultant availability), upcoming and past, Google Calendar sync.
- Session notes: paste transcript or notes, AI proposes action items and homework, consultant accepts, client sees the accepted record.
- Homework: light tasks assigned to client members, due dates, before/after session framing, check-off.
- Deliverables: every artifact SOBO ships, uploaded or linked, organized by workstream, with a delivery date. The "watch the $25k become real" surface.
- Resource library: SOBO's IP as a global reference catalog (session prep guides, meeting frameworks, templates). Practice-authored, readable by all that practice's clients.
- Messages: threaded per engagement, client writes → Remi gets an email → Remi replies in-app → client gets an email. No live chat presence, no typing indicators.
- Weekly digest: AI-drafted from what actually happened (sessions held, deliverables shipped, homework done, stage changes) plus what is scheduled next week; consultant approves; Resend sends to client members.
- AI, exactly four inert propose-then-accept jobs: transcript → action items, digest draft, resource suggestion for the next session, and engagement Q&A ("what did we decide about X") answered only from that engagement's own record.
- Multi-tenant schema, RLS, cross-practice AND cross-client isolation tests, from Ring 1.
- The front door: a "Client Login" link in the soboconsulting.com nav pointing to app.soboconsulting.com/login (a one-line PR in the sobo-consulting repo, shipped alongside Ring 1), and the Keystone login page itself, styled to the same standard as the Esface and Wild Wanderers login surfaces.

**Out (v1, explicitly):**
- Payments, invoicing, Stripe. The engagement fee is handled off-platform.
- Self-serve practice signup, per-practice billing, org settings UI, white-label theming. Multi-tenant-capable is a schema decision made now; the product business is a company decision deferred until a second real consultant exists.
- Live call transcription (Deepgram). v1 is paste-in. Automated capture is a later ring.
- A native client task manager beyond engagement homework.
- Anything in the BloomOS column above.
- Client-to-client anything. Clients never see each other exist.
- Marketing site for Keystone-the-product.

## 5. Architecture sketch

```
app.soboconsulting.com  (Next.js 16 App Router, TS strict, Tailwind v4, Vercel)
│                              (amended from "Next.js 14" per Ring 0 FLAG 2;
│                              create-next-app latest scaffolded 16.2.10)
│
├── /login                     Supabase Auth, cookie sessions, proxy refresh
│                              (Next 16 renamed middleware to proxy; src/proxy.ts)
│
├── /(practice)  ── consultant surface, requirePracticeMember(role)
│     /clients, /clients/[id]
│     /engagements/[id]        workstream board, sessions, notes, homework,
│                              deliverables, messages, digest review
│     /library                 authoring
│     /settings                availability windows, calendar connect
│
├── /(client)    ── client surface, requireClientMember
│     /home                    progress: workstream arcs, next session, homework due
│     /sessions                book next, past sessions with notes + decisions
│     /homework
│     /deliverables
│     /library                 read-only
│     /messages
│
└── /api                       route handlers; every handler re-resolves auth
      /ai/*                    Claude via anthropicClient + spend ledger + rateLimit,
                               Zod-forced output, writes ONLY *_proposals rows
      /digest/cron             Vercel cron, drafts → consultant approval queue
      /calendar/*              Google OAuth (signed state), tz-correct push/pull
      /messages/notify         Resend, per-event email with in-app deep link

Supabase (Postgres + RLS + Auth + Storage)
      one permission authority: private.keystone_can(p_practice, p_client, p_perm)
      called by BOTH the RLS policies and the app's clean-403 checks
```

**Enforcement model, one per surface, explicit:** the client surface is **pure-RLS** (anon key only, a CI guard forbids service-role imports under `/(client)` and its routes). The practice surface is **service-role-after-check** (resolve and verify practice membership, then act; RLS stays on as defense-in-depth). This gives the highest-risk surface, the one strangers log into, the hardest wall.

### 5.1 Data model (the spine)

```
practices                      id, name, slug
practice_members               practice_id, user_id, role owner|consultant
clients                        id, practice_id, name, status
client_members                 client_id, practice_id, user_id (null until claimed),
                               email, role client_member      ← email-keyed invites,
                               claimed by verified JWT via SECURITY DEFINER RPC
engagements                    id, practice_id, client_id, title, starts_on, ends_on,
                               fee_display (text, optional), status
workstreams                    id, engagement_id, title, stage
                               (diagnose|design|build|train|stabilize|done),
                               sort, color_token
workstream_stage_events        workstream_id, from_stage, to_stage, note, actor, at
sessions                       id, engagement_id, starts_at, ends_at, tz, location,
                               kind working|donor_call|review, gcal_event_id,
                               status proposed|booked|held|canceled
                               ← donor_call covers the calls SafeSpace asks Remi to
                               join; they schedule and appear like sessions, notes
                               stay lighter
readiness_markers              engagement_id, pillar philosophy|system|execution,
                               note_md, updated_at
                               ← the consultant's own readiness lens (see §5.3),
                               descriptive prose, never a score
availability_windows           practice_member_id, weekday, start, end, tz
session_notes                  session_id, raw_transcript (storage pointer if long),
                               summary_md, decisions_md, visibility
action_items / homework        engagement_id, workstream_id?, session_id?, title,
                               assigned_to (client_member or practice_member),
                               due_on, timing before_session|after_session|standing,
                               status open|done, done_at
deliverables                   engagement_id, workstream_id, title, kind file|link,
                               storage_path|url, delivered_on, note
resources                      practice_id, title, kind, body_md|storage_path, tags
                               ← practice-scoped reference, readable by that
                               practice's client members, writable by consultants only
message_threads / messages     engagement_id, author, body, read_at
digests                        engagement_id, week_of, draft_md, status
                               proposed|approved|sent, sent_at
ai_proposals                   kind, engagement_id, payload jsonb, status, actor
audit_log                      append-only, metadata not values, actor-stamped
```

**The parallel arc, the one genuinely new pattern:** the command center runs one linear stage pointer per project. Keystone moves the stage onto the **workstream**. An engagement is a set of named workstreams, each at its own stage, overlapping freely. SafeSpace seeds with five, in the engagement's own language (CONFIRM 5 with Susan's words, not ours):

1. *Fundraising system and rhythms* (strategy, donor segments, the weekly rhythm)
2. *Leadership development, Aris and Jasmine* (the coaching arc: philosophy, reps, call shadowing)
3. *The operating hub* (the BloomOS build, tracked here as progress and deliverables; the hub itself lives in BloomOS)
4. *Impact and evaluation* (Dr. Kendra)
5. *Back office* (Shannon: finance and compliance foundations) The five-phase arc is seeded as the practice default but stored as per-practice config (`practices.stage_config jsonb`), so a future coach can rename or reshape the arc without a migration. The progress view renders each workstream as its own arc.

**Every scoped table carries `practice_id`** (denormalized even where derivable) so RLS never joins four tables deep, and the isolation gate can assert it mechanically.

### 5.2 The practice surface: equally great for the consultant

The client side is the shop window; this is the workshop. The consultant's promise to SafeSpace ("readiness means philosophy, system, and execution, running without me") only holds if Remi can actually see all three moving week to week. Three screens carry it:

**Practice Home, the Monday screen.** One view across every client: this week's sessions, homework awaiting review (client checked it off, consultant confirms or comments), the digest approval queue, unanswered messages with age, and a stall flag on any workstream with no stage event, session, deliverable, or completed homework in three weeks (CONFIRM 11 on the threshold). The stall flag echoes the weekly-ritual rule: the queue is aspirational, what landed is factual, the gap is the signal. Descriptive, never red-badged.

**Engagement mission control.** Everything about one engagement on one screen: the workstream board (drag a stage forward, the event logs itself), the session run of show (last session's decisions, next session's plan and prep), the homework ledger per person, deliverables planned versus delivered, the message thread, and the readiness panel.

**The readiness panel.** The three pillars from the proposal, philosophy / system / execution, as standing prose markers the consultant updates: what evidence exists, what is still soft. Execution is the one the consultant cannot do for them, so the panel sits next to the facts that show it (weekly rhythm sessions held, homework completed on time, reps done). Facts beside judgment, never a grade. Consultant-only by default; sharing a readiness note with the client is an explicit act (CONFIRM 12), because "here is where you stand" is a coaching conversation, not a dashboard ambush.

One boundary inside the boundary: Remi also sits on SafeSpace's board. Board business (minutes, agendas, board deliberations) never enters Keystone. Keystone holds the paid engagement only. Mixing the two would blur a governance line that should stay bright, and the board login SafeSpace controls is a BloomOS deliverable anyway.

### 5.3 The reuse map (assemble, don't rediscover)

| Keystone piece | Lift from | What changes |
|---|---|---|
| Auth resolvers, two-tier gate, cookie middleware | Bloom `lib/admin/auth.ts`, Pathway `requireMember` shape | Scope nouns: practice, client |
| Email-keyed invites, no bearer tokens | Pathway `pathway_claim_membership()` | Table names |
| Both Supabase clients + contract, lazy admin | Trellis | Verbatim |
| Permission authority function | Bloom `private.has_permission` | Two-level scope |
| Cross-role read matrix in one policy | Pathway `pathway_evidence_read` | Roles: consultant vs client_member |
| Claude client, model tiers, spend ledger, rateLimit | Trellis `claudeModel.ts`, `spend.ts` | Ceilings, persona |
| Propose-then-accept AI shape | Command center Cy assist | The four jobs above |
| Work spine (one model, one write path, one card) | Command center §4 | Homework + action items |
| Engagement lifecycle + idempotent stage reconcile | Command center | Reconcile per-workstream, not per-project |
| Sessions + debrief shape | Black Club voice debriefs, WW sessions | Paste-in transcript v1 |
| Google Calendar OAuth, signed state, tz push, pagination | Arc `sync/push`, `sync/pull` | Availability windows are new |
| Resend wrapper, branded templates, graceful degrade | Platform layer §3 | Digest + message templates |
| Global reference catalog pattern | R&W reference tables | Practice-scoped, not global |
| Handoff surfaces DNA (showcase, living doc) | Trellis `/showcase`, `/rk` | Reborn as deliverables + notes |
| Isolation, enumeration ratchet, config-integrity gates | Bloom + Pathway e2e | Add the cross-client seeded matrix |

The cross-org isolation test the command center admittedly lacks gets written here in Ring 1, because Keystone is multi-org from its first commit.

### 5.4 Model tiers (added in Ring 0; the Ring 0 prompt referenced this section before it existed, FLAG 5)

One task-to-model map, in `src/lib/claudeModel.ts` and nowhere else:

| Task | Model | Why |
|---|---|---|
| Transcript extraction | `claude-opus-4-8` | highest stakes: client PII in, structured homework out |
| Digest draft, engagement Q&A | `claude-sonnet-5` | capable default tier |
| Resource suggestion, voice sweep | `claude-haiku-4-5-20251001` | high frequency, low stakes |
| (declared, wired to no job) | `claude-fable-5` | frontier tier; adopting it is a future, deliberate decision |

Every model declares a fallback model; a response with `stop_reason: "refusal"` is retried once on the declared fallback and the answering model is logged (`src/lib/anthropicClient.ts`). Spend rides the per-practice ceilings and the per-engagement cost ledger (`src/lib/spend.ts`).

## 6. Design (the 10/10 section)

Keystone should feel like walking into the architect's studio: warm paper, drawings pinned with intention, one brass detail. Calm, dense, and quietly expensive. A stressed ED should exhale when it loads.

### 6.1 Canvas and palette

Light warm paper, the SOBO family polarity, never stark:

```css
@theme {
  --color-paper:        #FBF4EA;   /* page canvas, SOBO cream */
  --color-paper-raised: #FFFBF3;   /* cards, panels */
  --color-paper-deep:   #F3EADC;   /* sidebar, wells, hover fills */
  --color-forest:       #33503C;   /* primary structure, active states */
  --color-forest-deep:  #26402E;   /* hover/active of primary */
  --color-navy:         #3D4959;   /* ink for headings, secondary structure */
  --color-ink:          #2A2620;   /* body text, warm near-black, never #000 */
  --color-ink-dim:      #6E675C;   /* secondary text, AA-checked on paper */
  --color-brass:        #B08D3E;   /* THE metallic. Hairlines, keystone marks,
                                      focus glints, stage-complete ticks. Sparingly. */
  --color-sage:         #7A9471;   /* organic accent: progress fills, quiet success */
}
```

Ten tokens. Resist more. Brass is the expensive signal and appears only thin: rules, the active-nav tick, a focus ring glint, the dot on the wordmark.

### 6.2 Type

Three registers, the v2 playbook shape:

- **Cormorant Garamond** (400/500/600, + italic): page titles, engagement names, the big numerals (sessions held, deliverables shipped). The italic-serif signature: section headers set roman with one word italic in brass or forest.
- **Plus Jakarta Sans** (400/500/600/700): body, UI, tables, buttons.
- **JetBrains Mono** (400/500): eyebrows, stage labels (`DIAGNOSE · DESIGN · BUILD`), timestamps, file sizes, the footer micro-line. Mono is what makes it read engineered, not decorated.

Fluid tokens: `--text-page: clamp(1.9rem, 3.2vw, 2.6rem)` at 1.05 leading, negative tracking; eyebrows at `0.72rem`, `letter-spacing: 0.24em`, uppercase, mono. Numerals in Cormorant at display sizes for the progress view.

### 6.3 The left sidebar (the room's spine)

- **264px** fixed on desktop, collapsible to **72px** icon rail (state persisted per user). Background `--color-paper-deep`, a 1px warm hairline on its right edge, no shadow.
- Top: the wordmark, `Keystone` in Cormorant with a brass period. When SOBO is the practice, a small "by Sobo Consulting" mono micro-line beneath (per-practice later).
- Nav items: lucide icon + Jakarta label, `0.92rem`. Active state is not a filled pill: it is a **3px brass tick on the left edge** plus forest text plus a whisper of `--color-paper-raised` fill. Hover raises the fill only.
- Client surface nav: Home, Sessions, Homework, Deliverables, Library, Messages. Practice surface adds Clients, Engagements, Library (authoring), Settings.
- Bottom: the signed-in person, client name badge (client surface), and a quiet "Message Remi" shortcut on the client side.
- **Mobile (the 390px commitment):** the sidebar does not shrink, it transforms. Bottom tab bar, five items max, active tab gets the brass tick on top. Every surface verified at 390px before a ring counts as shipped.

### 6.4 The signature screens

**The login page, the actual front door.** SafeSpace's first impression of the fee arrives here, before any feature does. Full-bleed paper canvas, the Keystone wordmark in Cormorant with the brass period, one quiet line beneath it in Jakarta ("Where your engagement lives"), the email-first sign-in card on paper-raised with a hairline border, and the logo dot-row watermark under 9% opacity in the background. No marketing copy, no feature list, no stock imagery. The Esface and Wild Wanderers login surfaces in _ref are the quarry for the auth flow shape; the skin is this design system. A small "by Sobo Consulting" mono line sits in the footer. Verified at 390px like everything else.

**Client Home, the progress view (the screen the $25k lives on).** Engagement title in Cormorant. Below it, one row per workstream: workstream name, then the five-stage arc rendered as five connected segments; completed stages filled sage, the current stage stroked forest with a slow breathing pulse (2.4s, opacity only), future stages hairline. A brass keystone-shaped tick sits on any stage completed this week. Right rail: next session card (date, time, one-tap reschedule), homework due, latest deliverable. The whole screen answers "where are we" in five seconds without a word of jargon.

**Session detail.** Date and attendees in mono eyebrow, decisions as a Cormorant-led block, action items as the work-spine card, the transcript folded behind a disclosure. Prep resources surfaced above upcoming sessions.

**Deliverables.** A vertical timeline down a brass hairline, newest first, each artifact a paper-raised card with kind icon, workstream tag in mono, delivered date. This page should feel like an unrolling of receipts for the fee, dense and proud.

### 6.5 Motion

One easing everywhere, CSS and JS: `cubic-bezier(0.22, 1, 0.36, 1)`, in `lib/motion.ts` and `@theme`. Vocabulary, and nothing outside it: 250ms fade-rise section reveals (8px), stage-fill sweeps left-to-right 400ms when a stage advances, sidebar collapse 200ms, button press `active:scale-[0.98]`, optimistic homework check-off with a sage sweep. One celebration allowed: when a workstream reaches Stabilize, the arc glints brass once. No parallax, no loops (the breathing pulse is the sole exception and it dies under reduced motion). Everything renders complete and still under `prefers-reduced-motion`.

### 6.6 Voice in the product

All UI copy passes the voice gate: no em dashes, no banned words, warm and direct. Empty states do work: Deliverables empty reads "Your first deliverable lands after the kickoff session." Homework empty reads "Nothing due. See you Thursday." The voice sweep runs on AI output at the boundary (digest drafts, extracted action items) with the violation log, per the platform layer.

## 7. Staged build order (rings, one PR each, deployed + 390px run = shipped)

- **Ring 0, Preflight:** repo, Vercel, Supabase, platform layer copied and scope nouns renamed, design tokens in `globals.css`, operating docs authored (`CLAUDE.md`, `CURRENT.md`, `SECURITY.md`, `DESIGN.md`, this spec in `specs/`), the three CI gates scaffolded, `docs/keystone-preflight.md` written with FLAGS. Commit.
- **Ring 1, The spine:** practices, clients, members, email-keyed invites, engagements, workstreams with the parallel arc, stage events, permission authority, RLS, **the seeded cross-practice and cross-client isolation matrix**, the sidebar shell both surfaces, the client progress view live with real SafeSpace workstreams. SafeSpace's four people log in and see where things stand. Nothing else. Ships with the login page and the one-line "Client Login" nav PR in the sobo-consulting repo. Commit, ship, show Susan and Liesl.
- **Ring 2, Sessions and scheduling:** availability windows, client-side slot picking, Google Calendar OAuth + tz-correct sync, session lifecycle, reschedule. Commit.
- **Ring 3, Notes and homework:** paste transcript, AI proposes action items and homework (inert), consultant accepts and assigns, client checks off, review queue on the practice side, session detail page, the readiness panel. Commit.
- **Ring 3.5, Practice Home:** the Monday screen assembles once its inputs exist: sessions, homework review, stall flags. Small ring, mostly composition. Commit.
- **Ring 4, Deliverables and library:** uploads (signed-upload direct-to-storage), the timeline, resource authoring and client read, prep-resource surfacing. Commit.
- **Ring 5, Messages:** threads, Resend notification to Remi on client message and to client on reply, read states, deep links. Commit.
- **Ring 6, The digest:** Friday cron (CONFIRM 6 on day/time) drafts from real events of the week, approval queue on the practice side, branded Resend template, refuses to send an empty week. Commit.

Then stop and run SafeSpace on it for two weeks before any Ring 7 talk (Deepgram capture, practice self-serve, theming).

## 8. Definition of done (v1)

- Liesl, Susan, and staff each sign in with their own account at app.soboconsulting.com and see only SafeSpace's engagement.
- A seeded second practice with a second client exists in the test suite, and the cross-practice + cross-client isolation matrix passes in CI. A SafeSpace member reading another client's engagement returns zero rows at the RLS layer, not just a 403.
- The client surface ships with the no-service-role CI guard green.
- Remi pastes a real transcript, accepts AI-proposed items, and Liesl sees homework with a due date within one minute, on a phone.
- A client books a session and it appears on Remi's Google Calendar at the correct wall-clock time in both timezones.
- A client message produces an email to Remi within a minute, and a reply produces one back, each deep-linking into the thread; a Resend failure surfaces an error state and logs, never a false success.
- A weekly digest drafts from real events only, requires approval, sends, and declines to send when the week is empty.
- Every AI write lands in `ai_proposals`, never a live table; the spend ledger shows per-engagement cost; rate limits hold.
- Audit log records metadata (which fields, who, when), never values, on every mutation in the practice surface.
- All six client screens verified at 390px; text tokens pass AA on paper; everything renders at rest under reduced motion.
- No em dash and no banned word anywhere in shipped strings, enforced by the config-integrity gate.

## 9. Failure modes to watch for

- **The cross-client leak.** The catastrophic one: a future client's member sees SafeSpace's engagement, or vice versa, because a query scoped by practice forgot the client dimension. This is why `client_id` scoping is in the Ring 1 isolation matrix, not deferred until client two exists. Manifests as silence until it is a disaster; the seeded matrix is the only early detector.
- **BloomOS bleed.** SafeSpace asks "can the grant tracker live here too" and it is tempting because they are one login away. Each yes blurs what the fee buys and turns Keystone into a second, worse BloomOS. The boundary table in §2 is the standing answer; additions to Keystone require an edit to that table first.
- **The empty digest.** Cron fires on a quiet week and emails "nothing happened," which reads as "you paid for nothing." The digest must refuse below a minimum-content threshold and tell Remi instead.
- **Silent email failure.** Resend key missing or template error; the client's message shows "sent," Remi never knows. Explicit error states, server logs, and a real end-to-end send in the Ring 5 gate.
- **Transcript PII.** Raw call transcripts are the most sensitive data in the system (client finances, personnel). They live in storage behind the client wall, are excluded from AI context except the extraction call, never enter logs, and get a named paragraph in `SECURITY.md` with a deletion path.
- **The arc reads as judgment.** A workstream sitting in Diagnose for six weeks can look like a red mark on the client. Stage displays stay descriptive, never scored, no red/yellow/green on a human or their org, per the humane-data rule.
- **Scoring the coachees.** Aris and Jasmine's homework completion and rep counts are facts the readiness lens needs, and one careless UI turn makes them a leaderboard two founders can see. Facts render as history, never as percentages or streaks on a person, and the readiness judgment stays in the consultant-only panel until deliberately shared.
- **Board bleed.** Remi is on SafeSpace's board; agendas and minutes flow through the same inbox as the engagement. None of it enters Keystone, ever. The moment board material lands in the engagement record, the paid work and the governance seat blur, and that line protects both.
- **AI auto-writes.** A proposal path that quietly commits. The `ai_proposals`-only write contract plus the per-feature gate keeps every AI output inert until a human accepts.
- **Sidebar dies at 390px.** The beautiful desktop rail becomes an unusable squeeze on the phone Liesl actually uses at night. The bottom-tab transform is specced now so mobile is a design, not a fallback.
- **Keystone-the-name collides.** The word is crowded (Keystone the HR software, insurance, hardware wallets). Trademark and domain reality check before the wordmark ships anywhere public (CONFIRM 7).

## 10. CONFIRM gates (nothing below ships assumed)

1. **Domain:** app.soboconsulting.com, or a keystone domain from day one?
2. **SafeSpace logins:** susan@, liesl@, aris@, jasmine@ (all safespace.org), confirm the four and whether anyone else joins.
3. **Library access after the engagement ends:** keeps or lapses?
4. **Shannon:** practice login in v1?
5. **SafeSpace workstream names:** the five seeded above (amended from "four" per Ring 0 FLAG 7; section 5.1 lists five), confirm or rename with Liesl's language.
6. **Digest day and hour** (proposal: Friday 3pm Pacific).
7. **Name clearance:** run trademark + domain check on Keystone before public use.
8. **Session locations:** video link source (Meet from the calendar event, or Zoom)?
9. **Fee visibility:** does the engagement show the $25,000 anywhere in-app, or never?
10. **Liesl's posture:** full login plus digest, or digest-first given the advisory move?
11. **Stall threshold:** three weeks proposed; twice-weekly month-one cadence may want two.
12. **Readiness notes:** consultant-only forever, or shareable per note as a deliberate act?
14. **Nav label on soboconsulting.com:** "Client Login" until gate 7 clears; switch to "Keystone" only after the name is cleared and the product is something you want public. The marketing site should not announce an unlaunched product by accident.

(There is no gate 13; numbering is kept as-is so existing references stay stable. Ring 0 FLAG 6.)

Ring 1 note on the "Client Login" nav link: it is a one-line PR in the sobo-consulting repo, and the Keystone build session's quarry rule forbids writing there. It ships as its own separately approved change, and Ring 1 is not blocked on it.

## 11. Build log (appended as rings ship)

- **2026-07-08, Ring 0 (Preflight).** Scaffold (Next 16.2.10, TS strict, Tailwind v4, src dir, Node 22), platform layer copied from the quarries and renamed to practice/client, the ten 6.1 tokens, operating docs, three agents, the three CI gates plus the no-service-role guard (20 assertions green on the empty schema), `docs/keystone-preflight.md` with 14 FLAGS. Commits `ring0: platform layer` through `ring0: preflight findings`.
- **2026-07-08, Ring 1 shipped to infrastructure.** The pre-provisioned Supabase project (`keystone`, mvuycjxainskaylvupji) received migrations 0001 and 0002 (0002 pins search_path on keystone_ai_spend_mtd after a Supabase advisor flag) and the SafeSpace seed; the pre-provisioned Vercel project (`keystone`, git-linked) builds from this repo with the public env values in vercel.json and origin-derived magic-link redirects. Manual steps that remain in the dashboards: Supabase auth Site URL plus redirect allow-list for /auth/callback, and the server-only env vars on Vercel (SUPABASE_SERVICE_ROLE_KEY, later ANTHROPIC_API_KEY, RESEND_API_KEY, GOOGLE_CLIENT_ID/SECRET, KEYSTONE_TOKEN_SECRET).
- **2026-07-08, Ring 2 (Sessions and scheduling), built.** Migration 0003: sessions (both scope columns, both-dimension policies, session.book for client booking through keystone_can, and the sessions_no_overlap exclusion constraint as the DB-layer double-booking wall), availability_windows (practice-wide read so clients can book, consultant-only write), google_connections (deny-all, AES-256-GCM encrypted tokens), and keystone_busy_intervals (SECURITY DEFINER, bare intervals only, so the pure-RLS client surface can compute slots without reading other clients' sessions). The slot engine is a pure function with DST-pinned unit tests. Client sessions page books, reschedules, and cancels through the session client; practice settings manages windows and the Google connection (HMAC-signed state, origin-checked callback); calendar sync is idempotent push (insert/patch/delete, floating local times plus explicit timeZone, the Arc rule). Live matrix extended: cross-client session reads and writes blocked, the exclusion constraint fires, busy intervals scoped, token store invisible. Google Calendar end-to-end run still owed (needs GOOGLE_CLIENT_ID/SECRET and KEYSTONE_TOKEN_SECRET in Vercel).
- **2026-07-08, Ring 3 (Notes, AI extraction, homework), built.** Plan in docs/keystone-ring3-plan.md (planned on Fable 5 per the model table). Migration 0005 (applied live): session_notes (transcript in-row under the paste cap, storage pointer column for the long offload, visibility flips to shared on accept), action_items (one work spine, assignment-scoped client check-off via private.owns_client_membership), ai_proposals (readable by the practice, writable by NO session: inert by construction), readiness_markers (consultant-only both directions). lib/extract.ts is a pure builder and parser (forced submit tool, transcript-as-data guard, Zod re-validation, cap-and-reject) with unit tests; extraction runs on claude-opus-4-8 through the Ring 0 chokepoint and writes exactly one proposal row; decideProposal is the single human path into live tables and validates every assignee against the proposal's own client. Live matrix extended: unshared notes invisible to clients until accept shares them, proposals and readiness never client-visible, check-off works on your own item and updates zero rows on anyone else's. One routing note: the practice run of show lives at /sessions/[id]/notes (the client surface owns /sessions/[id]; same App Router constraint as /library). Extraction end-to-end awaits ANTHROPIC_API_KEY (setup checklist).
- **2026-07-08, Ring 1 (The spine), built.** Spec amendments from the Ring 0 FLAGS, then `0001_keystone_spine.sql` (spine tables with denormalized practice_id and client_id, `private.keystone_can`, email-keyed claim RPC, service-role-only platform tables), the seeded isolation matrix verified live against a scratch Postgres 16 (two practices, practice A carrying two clients so the same-practice cross-client wall is exercised; the run caught an auth-schema grant gap in the platform stub), magic-link login with the claim on first sign-in, the proxy, the sidebar shell on both surfaces (bottom tabs at 390px), the client progress view with the five-stage arcs, and the SafeSpace seed. One routing deviation: the App Router cannot give two route groups the same path, so practice library authoring lives at `/library/authoring` while `/library` stays the client read surface. Deploy (Supabase + Vercel provisioning) is owed before "shipped." Model note: the session ran on Fable 5 end to end (the plan said plan on Fable 5, execute on Sonnet; execution stayed on the stronger model rather than switching mid-ring).
- **2026-07-08, Ring 3.5 (Practice Home), built.** Composition only, no new tables or migrations. `/today` is the Monday screen: booked sessions in the next seven days (linking to each run of show), homework checked off in the last fourteen days, placeholder cards for the digest queue (Ring 6) and messages (Ring 5) so the room's shape is honest about what lands next, and the stall section. A workstream reads as holding steady when it is older than the three-week window (CONFIRM 11 may tighten this) and neither it nor its engagement moved: no stage event, no session booked or held, no homework completed since the cutoff. Descriptive prose, never a red badge. Practice nav gained Home as its first item (mobile tabs now at the five-item max), and both practice-member redirects (root and auth callback) land on /today instead of /clients. No new env vars; the setup checklist is unchanged.

---

*Approval line: review, then say "approved" or mark changes. On approval, next artifact is the Ring 0 preflight prompt for Claude Code.*

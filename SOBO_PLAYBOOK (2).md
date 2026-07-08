# The Sobo Consulting App-Building Playbook

**A portable baseline for building web apps the Sobo way.**
Drop this file into the root of every new app repo, and keep a copy in the Claude
project so a new app never starts from a blank page.

**Version 2 — 2026-06-30.** Reconciled from five apps and four Trellis
sub-systems: the base was extracted from **Trellis**; additions came from **Team
Esface** (A1–A10) and **Bloom OS** (B1–B14); this version folds those in and adds
findings from auditing **Arc**, **Roots & Wings**, **Pathway**, and the **Sobo
Command Center** (the operator admin). The separate addition files are now retired
into this one. See §12 for the changelog and the provenance convention.

> **What this is.** Not a description of Trellis. A *method* — the stack, the
> doctrine, the reusable platform code, the design language, the security gate,
> and the build process that make a Sobo app feel like a Sobo app. Trellis is the
> first worked example; Arc, R&W, Pathway, Esface, and Bloom OS prove which parts
> generalize.
>
> **Provenance tags.** A rule marked **[proven: N apps]** has been built
> independently in that many of our apps — that is what graduates it from
> "feature" to "method." **[candidate]** means one app does it and it is worth
> watching. When the apps disagree with this doc, the code wins and the doc
> updates.

---

## 0. How this document lives and travels

A living baseline, not a one-time report. Three homes:

1. **The Claude project** (source of truth). The first context you paste when
   starting a new app, so the first feature already carries your conventions.
2. **The root of each app repo** as `SOBO_PLAYBOOK.md`, forked and trimmed to that
   app's reality (different domain, different modules, same spine).
3. **The seed of that app's `CLAUDE.md` + `.cursorrules`** — the operational
   subset the AI reads every session (§8).

The mental model: **Trellis is the reference implementation. Every new client app
is a fork of the *method*, not the *code* — though large parts of the platform
layer (§3) are literally copy-paste.**

---

## 1. The doctrine (the principles that define the style)

The load-bearing beliefs. Everything else is downstream.

1. **One spine, never a fork.** [proven: Trellis, Bloom OS] When two surfaces show
   the "same" thing, they share *one* type definition, *one* write path, *one* row
   renderer. The day they fork is the day they drift. Enforced with a build-time
   guard test, not discipline. (Trellis `lib/tasks/*`; the admin's
   `lib/work/model.ts` + `lib/ops/queries.ts`, guarded by
   `e2e/admin-work-model.spec.ts`.)

2. **Security is part of "done," not a later pass.** [proven: all] A feature that
   touches scoped data is not mergeable without its isolation test in the *same*
   PR. CI blocks the merge. (§6.)

3. **Resolve trust server-side, always.** [proven: all] The access scope is
   **never** trusted from the client; it is resolved from the authenticated user
   every request. (§3.1 generalizes "tenant" to "access scope.")

4. **AI proposes; a human accepts — and the AI's output is inert until then.**
   [proven: Trellis, Pathway, Bloom OS] The assistant never writes the system of
   record. It writes an inert proposal row (`proposed`/`pending`); a single human
   accept route is the only code path into the real data. This is *distinct* from
   structured output: structure makes a write *safe*, the proposal gate makes a
   write a *human decision*. (§3.3.)

5. **Merged ≠ shipped.** [proven: Trellis] "Merged + CI green" is not done.
   *Shipped* = deployed to production **and** one real run at 390px against live
   data. The gap is tracked honestly in the operating doc.

6. **Build in rings, after a written Phase 0.** [proven: Trellis, Bloom OS]
   Features ship as a sequence of independently reviewable, reversible stages
   (Ring 1…N), each preceded by a *committed* read-only recon doc that reconciles
   what the spec assumes with what the code actually is. (§7.)

7. **The voice is a product surface, enforced at every boundary.** [proven:
   Trellis, Arc, R&W, Esface, Bloom OS] Copy and AI output follow a written voice
   spec, mechanically validated by one shared utility applied at *every* AI
   boundary — including the easy-to-forget ones (background jobs, edge functions,
   notifications, raw-HTTP routes). (§5.)

8. **Track growth, never score people.** [proven: Trellis, R&W, Pathway]
   Cultivation, not surveillance. Named stages, not percentages; absence means
   "not yet lived," not a penalty; load "to share," never a leaderboard. No
   streaks, grades, or red/yellow/green on a human. (§5.4.)

9. **Calm, dense, fast, mobile-real.** Generous space, progressive disclosure,
   optimistic writes, keyboard-first on desktop, and a real mobile shell verified
   at 390px — not a CSS afterthought. (§5.2.)

10. **The operating doc is the single source of truth.** If it's happening and
    it's not in `CURRENT.md`, it's not happening. Fixed weekly cadence. (§8.)

---

## 2. The standard stack

The default toolchain. Deviate only with a reason.

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 14, App Router** for any app with real UI; Pages Router only when the app is mostly API routes | App Router + cookie auth is the proven default across Arc, Pathway, Bloom OS (§3.1) |
| Language | **TypeScript** (strict) | Types are the cheap part of correctness |
| DB + Auth | **Supabase** (Postgres + RLS + Auth) | RLS *is* the access boundary; auth included |
| AI | **Anthropic Claude API** | Tiered models, prompt caching, MCP connectors |
| Hosting | **Vercel** | HTTPS, preview deploys, encrypted env secrets |
| Rate limiting | **Postgres-backed sliding window** (or Upstash Redis) | Durable across serverless instances |
| Email / SMS | **Resend** + **Twilio** (direct `fetch`, no SDK) | Branded templates; degrade gracefully when unconfigured |
| Calendar / OAuth | **Google APIs** + app-layer encrypted token storage | HMAC-signed state, timezone-correct, paginated (§3.6) |
| Validation | **Zod** on every request body *and* as the AI output schema | One schema, two jobs (§3.3) |
| Tests | **Playwright** — used as much for static gates as for browser runs | Isolation + cross-role + config-integrity gates live here |
| Charts / icons / md | **recharts** (lazy), **lucide-react**, **marked** | Code-split heavy deps |

> **Pages vs App Router (the reconciliation).** Trellis core is Pages Router with
> a bearer `requireUser`. Arc, Pathway, and Bloom OS independently chose App Router
> with cookie-based Supabase Auth. Two-plus apps make App Router the default for
> UI-heavy apps; reserve the Pages-Router/bearer shape for API-first services.

---

## 3. The reusable platform layer (inherit this — don't rebuild it)

App-agnostic infrastructure. Copy it, adapt the scope nouns, and a new repo has
auth, multi-tenancy, a cost-capped AI client, rate limiting, voice guardrails, and
integrations on day one. Trellis paths are given so you can lift the actual code.

### 3.1 Auth & access scope

**Default shape — App Router + cookie auth** [proven: Arc, Pathway, Bloom OS].
Refresh the session in middleware, resolve the user server-side, and re-check in
*every* route handler and server action (they are reachable as raw POSTs).
Reference: Bloom `lib/admin/auth.ts` + `lib/supabase/middleware.ts`; Pathway
`lib/pathway/api.ts` (`requirePathwayMember`/`requirePathwayOwner`). The
Pages-Router/bearer equivalent (`lib/auth/requireUser.ts`) is the API-first variant.

**The access scope is resolved server-side, and its *noun* varies** [proven:
all]. The discipline is fixed; what you scope by depends on the app:

- **Tenant** (the common case): `household_id` (Trellis), `org_id` (Bloom OS, the
  admin). RLS shape: `scope_id in (select scope_id from members where user_id =
  auth.uid())`.
- **Relationship graph** (Esface): coach→athlete, when one org has many internal
  relationships; recursion helpers resolve reach.
- **Journey / project scope** (Pathway): a `journey_id` with its own membership
  table and roles, formally a "different tenancy."

In every case: resolve from the authenticated user, never the client; break RLS
recursion with `SECURITY DEFINER` helpers (Pathway `pathway_is_journey_member`,
`pathway_is_journey_owner`); and use an owner/member two-tier write hierarchy.

**Two-tier admin/operator gate** [proven: Trellis admin, Bloom OS]. Separate a
hardcoded founder allowlist (lockout-proof, survives a DB outage, resolves without
a read) from DB-backed roles (`owner|operator|coach|support`) in one resolver with
a short TTL cache that **fails closed** on error. Invalidate the cache on a role
change so it takes effect without a deploy; founder emails are immutable from the
UI. Reference: `lib/auth/{adminEmails,adminUsers,requireAdmin}.ts`, guarded by
`e2e/admin-access.spec.ts`. Use `requireAdminWithRole` (not bare `requireAdmin`)
on sensitive routes and check `role` explicitly; reads can be open to all admins,
writes gated.

**Email-keyed invites, no bearer tokens** [candidate: Pathway]. An invite is a
*pending* membership row (`user_id` null, `email` set), claimed automatically by
the verified JWT email on first sign-in via a `SECURITY DEFINER` RPC. The verified
email is the credential; the URL alone grants nothing. Reference:
`pathway_claim_membership()`.

**Kid/PIN or second-class sessions** (Trellis `lib/auth/kid.ts`): HMAC-SHA256
signed cookies, `timingSafeEqual` verify, independent of Supabase Auth. Reuse for
any second class of user on a shared device (a child, a guest, a read-only viewer).

### 3.2 Supabase clients & the enforcement model

Two clients: `lib/supabase.ts` (**anon key**, the only client the browser sees,
every query under RLS) and `lib/supabaseAdmin.ts` (**service role**, server-only,
**bypasses all RLS**, one lazy-`Proxy` chokepoint with a written contract). Lazy
init defers the key check to call-time so `next build` doesn't need the prod key
(Arc's `arcAdminClient()` is the same pattern). Never create a second service-role
client.

**Pick one enforcement model per surface and make it explicit:**

- **Pure-RLS / no-service-role** [proven: Pathway]. Every read and write goes
  through the anon key under the caller's auth. RLS *is* the wall. A CI guard
  forbids `service_role`/`supabaseAdmin` imports anywhere in the surface
  (`e2e/pathway-role-isolation.spec.ts`). Cleanest and hardest to get wrong;
  requires expressing all access as RLS policies.
- **Service-role-after-check** [proven: Trellis core, R&W]. The route resolves and
  checks the scope, *then* uses the service role; RLS is defense-in-depth, and the
  route-level check is the real wall. More flexible; the discipline is on you.

**One permission authority, so the two layers can't drift** [candidate: Bloom OS].
When the app has roles or permissions, map roles→permissions in a table and expose
it as a single `SECURITY DEFINER` function with a pinned `search_path`; have *both*
the RLS policy and the app's clean-403 check call it. Changing access becomes a
data change. Reference: `private.has_permission(p_org, p_perm)`.

**Operator-scoped schema: RLS on, zero policies** [proven: Trellis admin]. For
founder/operator-only tables (`ops_*`, `admin_*`), enable RLS but write no policy —
`requireAdmin` is the boundary, the service role is the only reader. State this
loudly so no one applies the household gate to operator data, or vice versa.

**Cross-role read matrix as a first-class pattern** [proven: Pathway, Bloom OS,
admin]. When 2+ roles read different slices, encode each role's slice in *one* RLS
policy and enforce sensitivity with row-level booleans, not UI logic. Sensitive
outputs add a second gate (`approved`, `shared`) that cascades onto the read
predicate. Reference: Pathway `pathway_evidence_read` (father/mother/son/mentor in
one `USING` clause) and `pathway_ai_summaries` (father writes unapproved →
approves → shares).

**Global read-only reference data** [proven: R&W]. Reference catalogs carry **no**
scope id, are SELECT-to-authenticated with **no write policy** (only migrations
seed them), and are explicitly carved out of the isolation gate with a documented
comment. Store *facts and pointers, never licensed content*. Reference:
`rw_scope_templates`, `rw_programs`; carve-out in `e2e/rw-curriculum-spine.spec.ts`.

### 3.3 The AI client, model tiering, spend, and proposals

- **Tier the model by task, holding the tiers as named constants beside their cost
  model** [proven: Esface, Bloom OS; corrects the base]. A call site picks a *task*
  (`detect|classify|surface` → fast; `reason|act` → mid; `deep_reason` → top), not
  a model. Env override is optional, not required. Reference: `lib/claudeModel.ts`,
  Bloom `lib/agents/reed/cost.ts`.
- **One chokepoint** (`lib/cy/anthropicClient.ts`, `callClaude(opts)`): resolves
  the tier, opt-in prompt-caches the system prompt, attaches MCP connectors, and
  runs the spend guard before spending.
- **Cap spend per scope with a cost ledger** [proven: Bloom OS; concretizes the
  base]. Write `cost_usd` and token counts for every call to an activity log, sum
  month-to-date, and check the cap before the next call, with a soft warn below a
  hard stop. The cap moves onto the plan/entitlement row when billing lands.
  Reference: Bloom `lib/agents/reed/cost.ts` + `app/api/reed/ask/route.ts`; Trellis
  `lib/cy/spend.ts` (`CyBudgetExceededError`, caught for graceful degradation).
- **Inert proposals are the only write path** (doctrine #4). AI output writes a
  proposal row with a status; a single human accept route writes the system of
  record. Reference: Bloom `app/api/reed/proposals/[id]/route.ts`; Pathway approval
  booleans; Trellis `cy_considerations` + `CyCard` propose-and-confirm.
- **Structured output: force one tool, validate with one Zod schema** [proven:
  Esface, Bloom OS]. Pin `tool_choice` to a single submit tool so the model can't
  answer in prose, then re-validate at the boundary with the *same* Zod schema that
  defines the API output shape (one source of truth), and defensively coerce
  hallucinations (drop any id not in the real candidate set). Reference: Esface
  `generate-ai.ts` (Zod), Bloom `lib/agents/next-best-action/agent.ts` (id-drop).
- **The assistant is a permission-bounded tool** [proven: Trellis, Bloom OS]. A
  named character (Cy, Reed) is the common choice; a quiet helper is the variant.
  Either way it reads through RLS, refuses via the shared permission authority with
  a clean 403 (never a silently empty set), and writes only through propose-and-
  confirm. The persona is a surface; the permission model is the substance.

### 3.4 Rate limiting (`lib/rateLimit.ts`)

Sliding-window, Postgres-backed (durable across instances) with an in-memory
fallback; one atomic RPC under an advisory lock so a caller can't fan out across
cold instances. `enforceRateLimits(...)` sends 429. Rate-limit *every* auth and
generation endpoint, per-user and per-scope.

### 3.5 Voice guardrails

`violatesVoice(text)` flags em/en dashes + a banned-word list (logged, never
shown); `cleanVoice(text)` mechanically repairs dashes. Generate → sweep → retry
once with a stricter prompt → return the cleaned output, never raw. Apply the
*same* utility at **every** AI boundary (doctrine #7). Reference: `lib/rw/v2/voice.ts`,
Arc `lib/arc/validateAiVoice.ts`.

**Log violations to an audit table** [proven: Arc]. Write each failed sweep
(`source`, `violations[]`, raw + cleaned excerpt, `retried`) to a table for drift
monitoring; the logging is best-effort and never blocks the user response.
Reference: `arc_voice_violations` + the `onViolation` callback. (The anti-pattern
to avoid: a lone inline `stripEmDashes` on one route while seven other surfaces
ship raw — Bloom B8.)

### 3.6 Integrations — direct-`fetch`, degrade gracefully, secure the edges

Each wrapper returns `{ ok, status, detail }` and **no-ops with a warning when its
key is absent**:

- **Email/SMS** — Resend (`lib/people/send.ts`, templates in
  `lib/newsletter/email.ts`) and Twilio. Branded inline-CSS email layout is reusable.
- **OAuth state must be unforgeable** [proven: Arc]. HMAC-SHA256 sign the state
  (user id + issued-at + nonce), verify with `timingSafeEqual`, enforce a ~15-min
  TTL. Reference: Arc `signOAuthState`/`verifyOAuthState` in `lib/arc/google.ts`.
- **Encrypted credentials at the app layer** [proven: Arc, Bloom OS]. AES-256-GCM,
  ciphertext in a service-role-only table with RLS deny-all, decrypted server-side
  just-in-time, passed into Claude via an MCP connector so the token never leaves
  the server. Reference: `lib/monarch/crypto.ts`, Bloom `lib/google/connection.ts`.
- **Timezone-correct external calendar push** [proven: Arc]. Capture the user's
  IANA zone on first connect; push floating wall-clock RFC3339 local times + an
  explicit `timeZone`, never server-local UTC. Reference: Arc `sync/push/route.ts`.
- **Paginate without truncation** [proven: Arc]. Loop `nextPageToken` to a safety
  cap; a missing loop silently drops everything past page 1. Reference: Arc
  `sync/pull/route.ts`.
- **Import an external system through a read-only mirror** [candidate: Bloom OS].
  Land the source in `*_staging` tables members cannot write, then promote into
  your own spine idempotently keyed on an external id. The mirror is never truth.
  Reference: Bloom `import_hubspot_to_constituents.sql`.
- **Portable carry-forward between surfaces** [proven: Arc]. Export a *versioned*
  snapshot; import idempotently by natural key, per-user, never touching a
  cross-scope path; a build test asserts the import never writes the other scope.
  Reference: Arc `app/arc/api/export` → Trellis `pages/api/personal/import-arc.ts`.

### 3.7 The automation surface (a second front door) — new [candidate: Bloom OS]

Treat an agent/automation endpoint (e.g. an MCP server an external agent calls) as
a second access surface. Authenticate it with an opaque, rotatable secret
(capability URL or header), run it server-side, and constrain it to a minimal,
explicitly scoped toolset — never the full data layer. If the secret can't identify
a user, pin the scope it may act within *in code*. Reference: Bloom
`app/api/mcp/[secret]/route.ts`.

### 3.8 Env loading (`lib/env.ts`)

Direct property access (so Next.js inlines `NEXT_PUBLIC_*`), soft fallbacks so
placeholders don't crash a build, Zod-validated, and `requireServerEnv(name)` that
throws only when a missing var is actually used.

### 3.9 What's generic vs. what you rewrite

| Reuse almost verbatim | Rewrite for the new domain |
|---|---|
| Auth resolvers + access-scope helpers, two-tier admin gate, kid/PIN sessions | Scope/role *names* and table names |
| `supabase.ts`, `supabaseAdmin.ts` (+ contract), lazy admin client | — |
| `claudeModel.ts`, `anthropicClient.ts`, `spend.ts` (cost ledger), proposal+accept | Task→tier labels; ceiling values; persona |
| `rateLimit.ts` | The specific limit constants |
| Voice detect/clean + the violation audit table | The banned-word list + tone rules |
| Resend/Twilio/crypto/MCP/OAuth-state/pagination/import-mirror/carry-forward | Email templates, sender identity, field maps |
| `env.ts` structure | The env var list |

---

## 4. The architecture patterns

- **Single entry point + view switching** (Pages-Router apps) or **route segments**
  (App-Router apps). One place holds global state; surfaces are a new value in a
  union or a new segment, not a new app.
- **The module ("pillar") pattern.** Each domain area is one component: tab nav,
  per-tab state, data loaded via `apiFetch('/api/<module>/…')`, an assistant `Chat`
  with a module-specific prompt, save/load through the data layer. Adding one = **5
  artifacts**: component + table(s) + API route(s) + spec + isolation test.
- **The shared-spine no-fork guarantee** (doctrine #1). `lib/<thing>/model.ts`
  (pure types + filter/sort/group/rollup engine, no UI, no I/O), `lib/<thing>/
  mutations.ts` (the one write path), one card component. A guard spec asserts no
  surface defines its own type/write/renderer. The admin's work spine is the
  reference: `rollupProject`, `myWorkSections`, `parseQuery`, `sortTasks`,
  `groupTasks` are all pure and unit-tested without a DB.
- **Activity log on every meaningful write** [proven: admin, Bloom OS]. A work
  write also appends an activity row (`ops_activity`). Lesson learned: make it
  *automatic at the mutation layer*, not opt-in per caller, or some writes won't
  log (the admin currently logs lifecycle events but not every task edit — a gap to
  close in the next app).
- **Lifecycle reconciliation: one record, phases, idempotent seeding** [proven:
  admin]. A pipeline row auto-spawns one work record that carries phases (pursuit →
  delivery), and a single `syncToStage` call (safe to call repeatedly, seeds a
  phase-appropriate milestone arc *once*) keeps them in lockstep; called
  non-fatally after every update. Reference: `lib/admin/engagementProject.ts`.
- **Capture → triage inbox** [proven: admin]. A quick-capture FAB writes to an
  inbox table; triage routes each item to a task/project (recording *which* table
  and row), with park and soft-delete-with-recovery states. Reference:
  `lib/admin/captures.ts`.
- **Propose-and-confirm AI** (doctrine #4) and **inert-proposal + accept route**
  (§3.3).
- **Two-tier storage.** A `tracker` key/value table for soft/fast-moving state and
  prototypes; **dedicated tables** with their own RLS once a feature needs
  querying, relationships, or a privacy wall. Graduate from one to the other.
- **Privacy walls inside the scope.** Per-person-private data lives in its own
  tables with per-user RLS, never a boolean flag; a shared read path never exposes
  a private row; service-role routes re-check the wall in the query.
- **Co-authored multi-party workflow as one row** [candidate: Pathway]. A workflow
  spanning people (son + father, mentor + family) can be one row whose steps are
  boolean flags, with writes to the primary actor + owner and reads scoped to the
  parties plus an optional `shared`. Reference: `pathway_mentor_lunches`.
- **Soft-delete life-safety data** [proven: R&W]. Personal journals add `deleted_at`
  and query `WHERE deleted_at IS NULL`; no hard-delete endpoint. Recoverable, audit
  intact, one column.

---

## 5. The design system & your personal style

The "personal style," written down so it's reproducible. Full reference:
`DESIGN.md` + `lib/design/tokens.ts` + `styles/globals.css`. For a new app you
**reskin the tokens and rewrite the voice nouns, but keep the structure**.

### 5.1 Design tokens (the structure stays; the values reskin)

- **Color via CSS variables, dark-mode-first.** Raw palette → semantic tokens
  (`--color-bg-base`, `--color-text-primary`, `--color-accent`, `--color-border`,
  success/danger); light mode is a `[data-theme="light"]` override; document
  contrast ratios (WCAG AA min); mobile forces dark.
- **The reskin is proven, not theoretical** [proven: R&W]. `lib/rw/v2/theme.ts`
  keeps the same token structure and fonts as Trellis and swaps a *single* accent
  constant (gold → terracotta) for a full sub-brand. A new client app reskins the
  same way: same structure, new accent + palette, identical voice discipline.
- **Typography: three families, each one job, never mixed** (sans UI/body, display
  serif for headlines/italic accents, mono for eyebrows/labels). Fluid `clamp()`
  scale.
- **One signature easing curve** shared between CSS and JS
  (`cubic-bezier(0.2,0.8,0.2,1)`); always honor `prefers-reduced-motion`.
- **A small primitive set, one role each** (`PageHeader`, `StatCard`, `StatusChip`,
  `Pill`, `DataTable`, `BoardColumn`) and a global accent focus ring.

### 5.2 The mobile shell (real chrome at 390px) [proven: Trellis, R&W]

Floating-pill bottom nav (safe-area insets, ≥44px targets, mono labels, active
dot); sticky two-line mobile header; dense forms use `flexWrap:'wrap'` +
`flex:'1 1 140px'` so fields stack instead of overflow; chat inputs use 16px font
to defeat iOS focus-zoom. **Every new mobile surface is verified at 390×844 before
merge** — part of "shipped," with the walk-through documented (R&W's mobile-redo
spec is the model).

### 5.3 The voice (your writing style, written down)

The product writes the way you talk (`DESIGN.md §11`): one italicized clause per
headline; rhythm over vocabulary (short, short, long, short); **no em dashes, no
exclamation points, no emoji in copy**; contractions always; address people as
"you" and the unit as "your family/household/team," never "users"; state numbers
plainly. **Own a vocabulary, ban a vocabulary** (Trellis owns "household,"
"pillar," "Cy"; bans adjective inflation, SaaS hum, performative words). Extract
the checks to one shared module and run them at every AI boundary (§3.5).

### 5.4 The assistant as a character, and the humane-data rule

The AI is a **named, permission-bounded character** (§3.3), not "the AI" — one
identity block, per-module role prompts on top, a data-driven
`buildSystemPrompts(profile)` for personalization.

**Track growth without scoring people** (doctrine #8) [proven: Trellis, R&W,
Pathway]. Named stages, not 0–100 (Pathway's six growth stages); absence of a log
means "not yet lived," with no streak penalty (Pathway rhythm logs have no streak
column); "load to share," never a leaderboard (Trellis work streams); "a scope is a
guide, not a gradebook" (R&W). No grades, no fading verdicts, no red on a person.

> **The reskin test:** a new Sobo app should be visually and tonally distinct from
> Trellis, yet *built the same way* — same token structure, same mobile shell, same
> voice and humane-data discipline, a different character and palette.

---

## 6. The security gate (non-negotiable, every feature)

Full program: `SECURITY.md`. The per-feature gate — a feature does not merge until
every applicable line is true:

- **New scoped table?** RLS with the membership shape **and** a cross-scope
  isolation test in the *same* PR. (Global reference tables are the documented
  exception: no scope id, SELECT-to-authenticated, no write policy, carved out *in*
  the gate.)
- **New API route?** Validates auth, resolves the scope server-side, re-checks on
  every record. Service role only after the check (or pure-RLS, §3.2).
- **New data about a person?** Minimized, on the right wall, no cross-AI-scope leak;
  life-safety journals soft-delete.
- **New AI surface / ingested content?** Untrusted, rate-limited, spend-capped,
  inert output, voice-swept, no path to cross-scope data or to changing the
  assistant's instructions.
- **New secret / credential?** Env only, or AES-256-GCM in a deny-all table; least
  privilege; never client.
- **New file upload?** Server-validated type+size, access-controlled bucket, no
  guessable URL, never executed.
- **Logs?** No PII.

**Ship all three CI gates together so the next app doesn't ship two of three**
[proven: Bloom OS]:

1. **Isolation / cross-role read matrix** — static checks on the migration + route
   source (RLS on, scope id `text` and server-resolved, client body id *never*
   read, every query scoped) **plus** a seeded cross-role read test that asserts
   each role/tenant sees only its slice. References: `e2e/isolation-three-tables.spec.ts`,
   `e2e/pathway-role-isolation.spec.ts` (the seeded matrix), Bloom
   `supabase/tests/rls-leak-test.sql`.
2. **Enumeration ratchet** — fails the build when a scoped table or a migration
   ships unregistered (`e2e/isolation-coverage.spec.ts` + `KNOWN_COVERAGE_GAPS`;
   Bloom's ordered-apply-list guard). Coverage only increases.
3. **Config-integrity** — freezes design tokens and asserts no hardcoded domains /
   correct table names (`e2e/config-integrity.spec.ts`).

Optional fourth for pure-RLS surfaces: **no-service-role guard** — fail the build
if the surface imports the service role (Pathway).

**Audit logging.** Best-effort, append-only, **metadata not values** (record
*which* fields changed, never the contents); actor-stamped; service-role-only table
(Trellis `lib/admin/audit.ts`). For **regulated data**, make the log immutable and
partitioned (revoke update/delete/truncate from app roles), log sensitive *reads*
too, and take true immutability from an off-platform export; the same log doubles
as the legal disclosure ledger (Bloom `docs/bloomos/04-security-compliance.md`).

**The living threat model.** When a feature adds a new data type, add a short
paragraph to `SECURITY.md` naming what it stores, who can see it, and how it's
deleted. Updating it is part of shipping.

---

## 7. The build process (spec → Phase 0 → rings → ship)

- **Specs** (`specs/*.md`): job stated once · the interface/utterance · architecture
  sketch · states · mobile & web (the 390px commitment) · non-negotiables · scope
  in/out · staged build order (rings) · definition of done + failure modes + judgment
  calls · a build log appended *as you ship*.
- **Phase 0 is a committed artifact** [proven: Trellis, Bloom OS] (`docs/*-preflight.md`
  / `*-phase0-findings.md`). Write the recon before building; it opens with "FLAGS —
  where reality differs from the spec" and expects to correct the spec. It is the
  cheapest doc-drift detector in the repo (Bloom caught already-shipped work and
  stricter-than-spec constraints this way; Trellis caught a designed-but-unbuilt
  "ghost" table).
- **Rings** (`docs/*-ring{N}-plan.md`): each ring is one coherent, committable,
  deployable, reversible unit — schema (one migration) + routes + component +
  isolation test — that adds value alone. Build, merge, deploy, then the next ring.
- **Pure engines, model-free skeletons** [proven: R&W, admin]. The structural work
  (spreading targets across terms, board rollups, pacing) is a pure, unit-tested
  function with no DB and no model call; routes load data → call engine → save.
  Deep content generation (prose, lessons) is a *separate*, optional, async model
  call. You can build the skeleton offline; the model is never on the critical path.
  Reference: R&W `distributeTargets`, admin `lib/work/model.ts`.
- **Onboarding hands off to a workflow, not to settings** [proven: R&W]. The last
  onboarding step deep-links into the main surface's setup mode (`?build=1`) so a
  new user lands in first *use*, not configuration.
- **CI gates** (`npm run test:ci`): Playwright, static gates as much as browser runs;
  opt-in server lifecycle; naming `*-isolation.spec.ts`, `*-role-isolation.spec.ts`,
  `*-privacy-wall.spec.ts`, plus per-feature logic specs.
- **The house definition of shipped** (doctrine #5): merged + green is not shipped;
  shipped = deployed + one real 390px run against live data. State plainly in
  `CURRENT.md` what is "merged but not yet shipped."

---

## 8. The operating documents (the system's memory)

| Doc | Role | Cadence |
|---|---|---|
| **`CLAUDE.md`** | What the AI reads first: stack, architecture, key patterns, the gate, the mobile rule | When architecture changes |
| **`CURRENT.md`** | The single operational source of truth | **Weekly, fixed day, ~30 min** |
| **`SECURITY.md`** | Security program + per-feature gate + living threat model | Append per feature |
| **`DESIGN.md`** | Color, type, surface, motion, voice | When the system changes |
| **`.cursorrules`** | Editorial rulebook: tokens, voice, locked invariants, tool boundaries, "do not touch" | Rarely |
| **`specs/`, `docs/`** | Specs, preflights, ring plans, research | Per feature |
| **This playbook** | The cross-app method | Per §11–12 |

**`CURRENT.md` structure:** *What's blocked (day-counts)* · *This week (theme +
shipped + still owed)* · *Next/Following weeks* · *In <partner>'s hands* · *Build
queue (top 10, prioritized)* · *Captured but deliberately not building (with
checkpoint dates)* · *Recently shipped (spec link, PRs, tables, migration verified,
what's still owed)*. **The weekly ritual:** pull merged PRs into "Recently shipped";
refresh "This week" from what *actually* landed (git log, not intentions); promote
or re-confirm next week; check blockers and partner items; flag any item deferred
6+ weeks. The build queue is aspirational, "Recently shipped" is factual, and **the
gap is the signal.**

---

## 9. The meta-layer: running the consultancy itself (the Command Center)

You have already built the consulting operating system *inside* Trellis — the **Sobo
Command Center** (`/admin`, spec `specs/sobo-command-center.md`), and it is itself a
reusable asset. Four jobs: **Run the work. Run the money. Run the pipeline. Watch
the portfolio.** Its decisive idea is the no-fork doctrine one level up: **internal
product work and client delivery are the same data.** The audited, built patterns
worth carrying to the next app:

- **The two-tier operator gate** + **operator-scoped schema (RLS on, zero
  policies)** + **PII-safe audit trail** (§3.1, §3.2, §6).
- **Engagement → project lifecycle** (§4): a `sobo_clients` row reaching `engaged`
  auto-spawns one project carrying pursuit and delivery phases, seeded once with a
  Diagnose → Design → Build → Train → Stabilize arc, reconciled idempotently on
  every stage change. From that moment, "deliver for the client" and "ship our own
  product" sit on the same board — distinguished by a pill, not a separate tool.
- **The work spine** (§4): one pure model, one write path, one card, guarded.
- **Capture → triage inbox** with routing + soft-delete recovery (§4).
- **Persistent global filter** [proven: admin]: a venture/org switcher resolved
  URL > localStorage > default, shallow-routed. Reference: `lib/admin/useVentureFilter.ts`.
- **Operator Cy assist**: propose → accept helpers (break-into-tasks, draft-week,
  what's-at-risk) that never auto-write (§3.3).

Honest gaps to design around in the next build: activity logging is opt-in per
caller rather than automatic at the mutation layer; saved-views are modeled
(`ops_saved_views`) but not yet wired; there is no operator-side cross-*org*
isolation test because the admin is founder-only today (add one the day it goes
multi-org).

**Why it matters for the playbook:** a new client engagement already has a home, an
arc, and a money line in your command center. The client's *app* is a fork of the
method in §1–8; the *engagement* is a row that becomes a project in the system you
already run.

---

## 10. Starting a new client app (the checklist)

### Week 0 — scaffold the method

- [ ] `create-next-app` (Next 14, TS, **App Router** unless API-first) → Vercel →
      Supabase.
- [ ] Copy the **platform layer** (§3): auth resolvers + access-scope helpers +
      two-tier admin gate, `supabase.ts` / `supabaseAdmin.ts` (lazy), `claudeModel.ts`
      + `anthropicClient.ts` + `spend.ts` (cost ledger), `rateLimit.ts`, voice +
      violation log, Resend/Twilio/crypto/OAuth-state/pagination wrappers, `env.ts`.
      Rename the scope noun. Decide the enforcement model (pure-RLS vs
      service-role-after-check) and write its CI guard.
- [ ] Copy the **design system**: `styles/globals.css`, `lib/design/tokens.ts`;
      reskin one accent + palette; pick the three type families.
- [ ] Author the **operating docs** from templates: `CLAUDE.md`, `CURRENT.md`,
      `SECURITY.md`, `DESIGN.md`, `.cursorrules`, and this `SOBO_PLAYBOOK.md`.
- [ ] Define the **access scope** (tenant / relationship / journey), its membership
      table, and the core RLS membership policy + `SECURITY DEFINER` helpers. Write
      the **first isolation test**, the **enumeration ratchet**, the **config-integrity
      gate**, and (pure-RLS) the **no-service-role guard** now, so they ratchet from
      day one.
- [ ] Invent the **assistant character**: identity block + voice owned/banned lists +
      `buildSystemPrompts(profile)`, bounded by the permission authority, writing only
      inert proposals.
- [ ] Decide the app's **modules** and the home/nav shell.

### Week 1+ — build features the standard way

Per feature: **spec → Phase 0 preflight → rings**, each ring shipping component +
table(s) + routes + isolation test; pass the per-feature gate; deploy; do the 390px
run; log it in `CURRENT.md`. Run the weekly ritual.

### The per-feature gate (pin this in `.cursorrules`)

```
☐ New scoped table → RLS membership shape + isolation/cross-role test in THIS PR
   (global reference table → no scope id, SELECT-only, carved out in the gate)
☐ New route → auth + server-side scope resolution + every query scoped
   + service role only after the check (or pure-RLS surface, no service role)
☐ New person-data → minimized + right privacy wall + no cross-AI-scope leak
   + life-safety journals soft-delete
☐ New AI surface → untrusted, rate-limited, spend-capped (cost ledger),
   inert proposal output, voice-swept at this boundary
☐ Secrets in env or AES-256-GCM deny-all table · no PII in logs (metadata only)
☐ Copy/AI output → no em dashes, voice rules hold, growth not scored
☐ Mobile surface → verified at 390px
☐ Shipped = deployed + real 390px run (not just merged)
```

---

## 11. How to think about — and maintain — this document

**Think of it as the constitution, not the codebase.** It captures the invariants
and the method — what's true across apps — and stays out of any one app's feature
detail. Inclusion test: *"Would this still be true for the next client, in a
different domain?"* If yes, it belongs here; if it's Trellis's 12 pillars, Cy's
name, or the forest palette, it belongs in that app's own docs as a worked example.

**Keep three layers, don't blur them:** (1) this playbook (cross-app method); (2)
per-app `CLAUDE.md`/`.cursorrules`/`DESIGN.md` (the app's instance — its tokens,
character, modules, locked decisions); (3) `CURRENT.md` + `specs/` + `docs/` (live
state).

**The graduation rule.** A pattern earns a place here once a **second** app proves
it independently — one app is a feature, two is a method. Mark provenance
(**[proven: N apps]** / **[candidate]**) so the bar stays visible. When the doc and
two apps disagree, the doc is wrong: update it (the code wins).

**The addition-file lifecycle.** When a new app is audited, capture its findings in
a `*_ADDITION.md` file first (cheap, reviewable), then reconcile additions into this
base on the next pass and retire the file — exactly how v2 absorbed the Esface and
Bloom OS additions plus the Arc/R&W/Pathway/admin audits.

**Version it.** Date the top, keep the §12 changelog, and treat a change here as a
change that ripples to every repo that forked it — because it does.

---

## 12. Changelog & provenance

- **v2 (2026-06-30).** Reconciled the Esface (A1–A10) and Bloom OS (B1–B14)
  additions into the base and added findings from auditing four Trellis
  sub-systems. Headline changes: App Router + cookie auth is now the default (§2,
  §3.1); "tenant" generalized to "access scope" with tenant / relationship / journey
  variants (§3.1); two enforcement models named, pick one per surface (§3.2); one
  permission authority, cross-role read matrix, global reference tables (§3.2);
  model tiers as constants, cost-ledger spend cap, inert proposals, forced-tool Zod
  output, permission-bounded assistant (§3.3); voice at every boundary + violation
  audit log (§3.5); OAuth-state signing, encrypted-credential table, timezone push,
  pagination, import-mirror, carry-forward (§3.6); the automation surface (§3.7);
  activity-log-on-write, lifecycle reconciliation, capture-inbox, co-authored
  workflow row, soft-delete (§4); the reskin proof + humane-data rule (§5); ship all
  three gates + immutable audit for regulated data (§6); Phase 0 as a committed
  artifact, pure engines / model-free skeletons, onboarding-to-workflow (§7); the
  audited Command Center patterns (§9).
- **v1 (2026-06-30).** Initial extraction from Trellis.

*Reference apps: Trellis (`remi-sobo/trellis`, the original reference), Team Esface,
Bloom OS (`remi-sobo/ambition-angels`), plus the Trellis sub-systems Arc, Roots &
Wings, and Pathway. The code wins when it disagrees with this doc — update the
playbook.*

# Spec: the Client Hub, first instance EPA Young Life at /epayl

**Status:** phase one in build (2026-09-02)
**Owner:** Remi
**Route:** `app.soboconsulting.com/epayl`; a custom domain points at it later (Remi 2026-09-02)
**Source documents, committed at `docs/handoff/epayl/`:**
`KEYSTONE-CLIENT-HUB-BUILD-PROMPT.md` (the governing document; where it and
the handoff disagree, it wins), `CLIENT-HUB-IA-REVISION-PROMPT.md` (replaces
the handoff's thirteen tabs with five sections; everything structural in the
build prompt stays in force), `spec-epayl-fundraising-hub.md` (the handoff
spec: data model, parsing rules, stewardship rules, AI drafting scope),
`README.md` (design tokens, screens, copy, all final),
`fundraising-hub.dc.html` (the v1 visual target; reference only, never
ported), and `fundraising-hub-v2.dc.html` (the v2 design reference,
Remi's upload 2026-09-02; it settles the wordmark as "For God So Loved
East Palo Alto" with So Loved in gold, confirms the October-September
fiscal year in its own copy, and is the source the live plan content,
relationship notes, and Dillabough research profile were generated
from, mechanically, never retyped).
**Voice and visual specs:** `docs/hub/house-voice.md` and
`docs/hub/art-direction.md`. Every string follows them.
**Source files, NEVER committed:** `sources/epayl/` (gitignored) holds the
real donor export, the budget workbook, the communication plan, the
Dillabough profile, the program plan, and the parsed prospect file. Parsers
are verified against these locally; tests run only against redacted fixtures.

## What this is

Keystone's first client-facing hub: a gated fundraising workspace for Kendra
Sobomehin, Area Director of East Palo Alto and East Menlo Park Young Life.
Keystone provides authentication and session, the database and RLS,
multi-tenancy, and deployment. Nothing visual: the hub renders none of
Keystone's chrome and wears EPA Young Life's own system end to end.

Keystone is getting its first client user. Every account before this belongs
to SOBO or a scoped internal role; Kendra is a stranger-facing login on the
platform that holds every other client's delivery data and the commission
ledger. The client-direction isolation tests are therefore the gate on phase
one and nothing ships past them.

## Decisions on the record (Remi, 2026-09-02)

1. **Budget authority.** `sources/epayl/EPA_YoungLife_Three_Year_Budget.xlsx`
   is the authoritative file. It reconciles exactly to the design reference:
   total operating expenses $191,868.91 and total to raise $199,244.73 in
   FY2027 (the design's $191,869 and $199,245). The conflicting figures the
   build prompt cited ($201,294 / $198,424) appear nowhere in this workbook;
   it is a revised version that resolves the conflict. Every figure parses
   from it; no dollar amount is typed into a component.
2. **Auth.** Resolved against the code, not assumed: Keystone signs in by
   magic link (`signInWithOtp`) and Google OAuth, email-keyed invites, no
   passwords, no shared passphrase. The handoff's magic-link requirement is
   already Keystone's posture. No second auth path is added; the hub's door
   is a themed skin over the same server action.
3. **Custom domain.** Later. Ships at `app.soboconsulting.com/epayl`.
4. **Voice and art specs.** The originals did not arrive in the bundle; the
   committed versions at `docs/hub/` are derived from the handoff README and
   flagged as such. They are replaced wholesale when the originals arrive.

## The five-section surface (IA revision, in force)

HOME (what matters right now) · PEOPLE (who are we moving) · PLAN (where the
money comes from) · MONEY (are we funded) · WORK (can we actually do this).
Nothing else in primary navigation; a quiet overflow holds files, export, and
settings. The thirteen-tab handoff surface and the two added tabs (Hours,
Collateral) all survive one level down inside these five.

## Schema (migration 0046, all corrections applied before anything is built)

All tables prefixed `hub_`, all RLS-on, all scoped by `org_id` with
`practice_id` denormalized (the repo's standing rule), membership resolved by
`private.is_hub_member(org_id)` from the authenticated user. Money is integer
cents. The six corrections from the build prompt land here, in the first
migration, plus the entities the IA revision requires:

- `hub_orgs`: slug, name, fiscal_year_start, `theme jsonb` (the full token
  set), `vocabulary jsonb` (correction 1: EPA reads as "area" in the UI
  without the database knowing what an area is). No goal or cash column:
  every figure computes from `hub_budget_lines` (correction 4).
- `hub_members`: org-scoped, email-keyed like every Keystone membership,
  role as plain text (correction 1), claimed by the same
  `keystone_claim_membership` RPC, revocable. The member rows ARE the
  allowlist; there is no env-var email list.
- `hub_donors`: the export's real columns, `source` (`yl_export | manual`),
  `do_not_contact` and `receives_appeals` enforced (correction 3),
  `updated_by`/`updated_at` (correction 6).
- `hub_gifts`: `source text not null` check `yl_export | manual`
  (correction 2). The parser's delete is scoped to `source = 'yl_export'`
  and that org; a manual gift survives an export re-parse, tested.
- `hub_strategies`: the five strategy cards PLAN is made of (major gifts,
  monthly partners, fall brunch, church partners, grants): goal with trust,
  owner, weekly hours, playbook fields (precondition, dependency, failure
  mode, done means).
- `hub_tasks`: donor- and strategy-linkable, `why` always visible,
  `source` (`manual | ai_suggested | stewardship_rule | gift_rule`),
  `rule_key` so a stewardship rule fires once per donor per cycle, optional
  `estimate_minutes` (never required), `pinned_slot` for Kendra's own three
  moves on HOME, audit columns (correction 6). A database trigger refuses
  any task for a do-not-contact household (correction 3 is enforced, not
  annotated).
- `hub_profiles`: the ten-section research profile as jsonb sections,
  audit columns (correction 6).
- `hub_budget_lines`: every line carries `trust`
  (`verified | estimated | stated | placeholder`). The single source every
  figure reconciles to (correction 4).
- `hub_documents`: upload ledger; a failed parse never loses the file.
- `hub_touches`: what a donor has heard; what makes stewardship reminders
  possible.
- `hub_content_blocks`: the plan's own words, org-scoped rows, block kinds
  `paragraph | table | stat_row | headline | lead`, so changing a sentence
  is a row update, not a deploy.
- `hub_collateral`: what has to exist, by when, who makes it, what it
  blocks (WORK's blockers list).
- `hub_capacity`: hours available per person; the number that decides
  whether the rest gets executed.

`hub_orgs` and `hub_members` carry no member-write policies: creating an org
or inviting a member is operator work (seed or practice-side tooling later),
so a hub session cannot mint access. Everything else is member-writable
inside the member's own org only.

## The enforcement model

The hub is a stranger-facing surface and takes the client-surface
discipline: **pure RLS**. No service role anywhere beneath
`src/app/(hub)`, enforced by the same CI guard pattern as `(client)`.
Parsing routes (phase two) run under the caller's session too: the member's
own RLS rights to their own org's rows are exactly the parser's rights.

One deliberate pre-auth disclosure, documented in SECURITY.md: the door RPC
returns an org's name, door copy, and theme for a given slug so the locked
screen can say what it is (the handoff's locked-screen contract) without any
table being readable by anon. It returns presentation only: no figures, no
members, no donor anything, and an unknown slug returns nothing.

## The client-direction isolation gate (phase one, before the feature)

`e2e/client-hub-isolation.spec.ts` (structural) plus the seeded matrix in
`supabase/tests/isolation-seed.sql` (live). A hub member must not read,
infer, or enumerate: any other org's rows in any table, hub tables included;
any SOBO engagement, client, or financial record; the commission ledger; the
list of other orgs, their count, or their names. The matrix sweeps EVERY
practice-scoped table mechanically as the hub persona and asserts zero rows;
the reverse direction (practice owner, client member, sales lead, stranger,
anon reading hub rows) is asserted table by table. The anon role reads
nothing anywhere.

## Theming

Per-org, built as a layer: `hub_orgs.theme` resolves to CSS custom
properties at the hub layout; components read variables only; no hex value
in a component, ever (structurally tested). EPA's exact tokens
(`docs/hub/art-direction.md`) seed the first org theme. Fonts are the one
build-time registration (next/font); the theme maps roles onto registered
families. Keystone's own surfaces and its frozen ten tokens are untouched.

## Build order (revised)

1. **Phase one**: migration 0046 with all corrections, the client-direction
   isolation tests, the theme layer, the five-section shell. GATED by the
   isolation tests.
2. **Phase two**: PEOPLE and the parsers (the YL export parser verified
   against the real file locally, tested against a redacted ten-row
   fixture), and the one-click export (zip of CSVs plus research profiles
   as markdown). STOP AND SHOW REMI.
3. **Phase three**: PLAN and MONEY, reading from the budget and strategies.
4. **Phase four**: WORK: hours and blockers.
5. **Phase five**: HOME, last on purpose, summarizing what now exists.
6. **Phase six**: stewardship rules, AI drafting inside workflows, print.

## Guardrails (standing)

Nothing before auth (a sessionless request carries no donor name, amount,
capacity figure, household count, or org name beyond the door's own copy).
RLS is the access control. No fabricated numbers; every figure carries
`verified | estimated | stated | placeholder` and a gap renders as a gap.
Voice rules on every string. Young Life Connect stays the system of record
for gifts; nothing syncs anywhere. No changes to any existing Keystone
surface.

## FLAGS

- `house-voice.md` and `art-direction.md` did not arrive; committed versions
  are derived (decision 4 above).
- The handoff README carried 22 em/en dashes; landed with mechanical
  substitutions only, per the repo's standing precedent. The original is in
  the handoff zip if Remi wants different wording.
- The budget workbook's own open item: fiscal year. The Assumptions sheet
  says year one runs August 2026 through July 2027, and Kendra's answer in
  the same workbook says "October through September it is." The YL export's
  fiscal-year columns are Young Life fiscal years. Seeded as October 1 2026
  per Kendra's answer; the cash-timing view (phase three) parses the
  workbook's August-through-July months as stated. Open for Remi to correct.
- The communication plan workbook's dashboard says a $350,000 annual goal;
  that is the old OGSM placeholder the budget workbook explicitly
  supersedes (its own "against the old placeholders" section). The comm
  plan is used as content (newsletter calendar, touch types, stages), never
  as a figure source. Its RCE/moves-management vocabulary is translated at
  the boundary per the voice rules.
- Strategy weekly hours: the IA revision states major gifts three hours a
  week, brunch two, monthly one, "and so on." The stated three are seeded
  with trust `stated`; church partners and grants have no stated hours and
  seed as gaps, surfaced under PLAN's open questions.

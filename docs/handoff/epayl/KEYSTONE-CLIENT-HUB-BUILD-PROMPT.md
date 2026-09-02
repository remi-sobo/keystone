# Build prompt · Client Hub on Keystone, first instance EPA Young Life

Paste this into Claude Code with the handoff bundle in the Keystone repo. It sits on top of the design handoff and replaces its hosting decisions. Where this document and the handoff disagree, this document wins.

**Route:** `app.soboconsulting.com/epayl`, with a custom domain pointed at it later.

---

## What changed from the handoff

The handoff was written to ship this on `soboconsulting.com`, the marketing site. It is going on Keystone instead.

That removes most of the handoff's auth section. Keystone already has authentication, multi-tenancy, and row level security. Do not rebuild any of it, and do not add a second auth path. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` discussion in the spec is moot.

What the handoff still gives you, and what to use it for:

- `spec-epayl-fundraising-hub.md` for the data model, the parsing rules, the stewardship rules, and the AI drafting scope
- `README.md` for the design tokens, the screens, and the copy, all of which are final
- `Fundraising Hub.dc.html` as the visual target, opened in a browser on a second screen. Do not port it.
- `epa-prospects.js` as seed data, 99 households

---

## Source files, and where they go

The parsers need the real files. The repo must not have them.

**Do not commit donor data to git.** The handoff's `BUILD.md` says to copy the whole handoff folder into `docs/handoff/` and commit it. That folder contains `epa-prospects.js`, which holds 99 households with 59 phone numbers, 50 email addresses, capacity estimates, and giving history. Committed, that is in the git history permanently, on every clone and in every CI log.

**What to commit.** The spec, the README, and the design reference HTML. Nothing with a real person's contact information in it.

**What stays out of the repo.** Put these in a gitignored local folder or a private Supabase Storage bucket, and reference them by path:

- `EPA_YoungLife_Three_Year_Budget.xlsx`, which the budget parser reads and which settles the goal figure
- The raw Young Life donor export xlsx, so the parser is verified against the actual file rather than a pre-parsed copy
- `epa-prospects.js`, the parsed export
- The Dillabough donor profile, the schema reference and the few-shot example for AI drafting

**What the tests run against.** A redacted fixture committed to the repo: ten rows, invented names, invented phone numbers and emails, real column shapes and real edge cases. Parser tests never touch a file with a real household in it.

**Voice and visual specs, committed.** `house-voice.md` and `art-direction.md`. Every string in this build follows them and they are the spec, not background reading.

**Never in this repo.** Anything belonging to another SOBO client.

---

## Read first, in this order

1. `CLAUDE.md`
2. `SECURITY.md`
3. Keystone's existing RLS helper pattern and the isolation tests written for the scoped sales account
4. `house-voice.md` and `art-direction.md`
5. The handoff spec and README

---

## The thing that matters more than anything else here

**Keystone is getting its first client user.**

Every account on it today belongs to SOBO or to a scoped internal role. Kendra is a client, logging into the platform that holds every other client's delivery data, SOBO's engagement records, and the commission ledger.

The existing privacy wall runs one direction: an internal scoped account cannot reach delivery data. This is the opposite direction and it needs its own test suite.

**Write the isolation tests before the feature.** A client user must not be able to read, infer, or enumerate:

- any other org's rows in any table, hub tables included
- any SOBO engagement, client, or financial record
- the commission ledger
- the list of other orgs, including their count or their names

Test both a direct query and an enumeration attempt, for every table, as a client role. The anon role reads nothing anywhere. These tests are the gate on phase one and nothing ships past them.

---

## The hub does not look like Keystone

This is an architecture instruction, not a styling preference.

Keystone provides four things here and none of them are visual: authentication and session, the database and row level security, multi-tenancy, and deployment.

The hub route renders **none of Keystone's chrome.** No shared layout, no Keystone navigation, no Keystone header or footer, no Keystone typography or color inherited from a parent layout. It is a full-bleed themed surface that happens to live at this route, and it looks exactly like `Fundraising Hub.dc.html`.

If a Keystone style is leaking in, the route is nested under the wrong layout. Fix the nesting rather than overriding the styles.

**Where a client user lands.** A client session goes to that client's hub and nowhere else. Hitting the root of the domain redirects them to their org's hub, not to any SOBO internal view. A client has exactly one destination and no navigation that suggests otherwise.

---

## Per-org theming, and why it gets built properly

Keystone wears the SOBO system. This hub wears EPA Young Life's, which shares nothing with it: acid-black and bone and gold, Abril Fatface and Archivo and Space Mono, square corners, no shadows, no motion.

Do not hardcode EPA's tokens into the hub. Build a theme layer.

- `hub_orgs` carries a `theme jsonb` holding the full token set: colors, the three font families, and any per-org overrides
- Tokens resolve to CSS custom properties at the layout level, scoped to the org route
- The hub's components read variables only. No hex value appears in a component, ever.
- SOBO's own Keystone surfaces keep their current theme and are not touched

EPA's tokens are in the handoff README and are exact. Seed them as the first org theme.

The second client's hub should be a row in a table, not a branch in the code. That is the whole reason this gets built as a layer.

---

## Six corrections to the handoff spec, applied in the first migration

Decided. Do not relitigate them in the build.

**1 · No Young Life vocabulary in the schema.** The spec says `hub_areas`, `area_id`, and a role enum of `director | coach`. Use `hub_orgs`, `org_id`, and role as plain text. Add `vocabulary jsonb` on `hub_orgs` so EPA reads as "area" in the UI without the database knowing what an area is.

**2 · Manual gifts survive an export re-parse.** The spec has the YL parser replacing a household's `hub_gifts` rows, and Log a Gift writing to the same table. As written, the second export upload deletes everything Kendra entered by hand.

Add `source text not null` to `hub_gifts`, values `yl_export` or `manual`. Scope the parser's delete to `source = 'yl_export'` and that org. Write a test that seeds a manual gift, re-runs the parser on the same file, and asserts the manual row survives. Not optional.

**3 · Do-not-contact is enforced, not annotated.** One household in the seed data is flagged do-not-contact and twenty are flagged no-appeals.

A do-not-contact record renders unmistakably, not as a caution line in body copy. The task generator refuses to create a task for that household and the stewardship rules skip it. No-appeals households are excluded from anything that is an appeal and included in everything else. Both flags are read-only in v1.

**4 · Every figure reconciles to one budget.** The design reference shows $191,869 of cost becoming a $199,245 goal. The three-year budget workbook says $201,294 in operating expenses and $198,424 in gross contributions needed. These do not agree.

Ask Remi which file is authoritative, parse the figures from it, and delete every hardcoded money value from the shell. No dollar amount is typed into a component. A number that cannot be computed from `hub_budget_lines` renders as a gap with its trust level, never as a plausible value.

**5 · Export lands at the end of phase two.** One click, everything for an org, a zip of CSVs plus research profiles as markdown. Kendra's notes and next steps are her work product and she takes them with her if the engagement ends. That has to be true from the first week the hub holds anything real.

**6 · Audit who changed what.** Two people editing shared donor records. Add `updated_by uuid` and `updated_at` to `hub_donors`, `hub_tasks`, and `hub_profiles`, set on every write, surfaced as a quiet mono line. No history table in v1.

---

## Two tabs the handoff is missing

The hub is the fundraising plan. Not a companion to a document, the plan itself. Two things from the plan have no home in the thirteen tabs.

**Hours.** What each strategy costs in weekly hours, by person, against what exists. Kendra has about seven hours a week, mornings, with donor meetings Tuesday and Thursday. Her mother is arriving to take back-office and grant research.

This is the tab that decides whether any of the rest gets executed, and a plan that needs twelve hours from someone who has seven does not fail for lack of effort. Same page shape as the other content tabs, plus a total against available.

**Collateral.** What has to exist, by when, who makes it, and what it blocks if it is late. Four columns. Seed it with what is already known: the pitch deck exists, commitment cards do not, the case for support does not, photography of the house does not and blocks several of the others.

Both use the existing generic tab shape. Neither needs new components.

---

## Content has to be editable without a deploy

Six tabs are the plan written out: Monthly, Brunch, Grants, Churches, Calendar, Stewardship. Plus the two above.

If that content lives in typed modules in the repo, changing a sentence is a code change and a deploy. That is right for a marketing page and wrong for a living plan that Remi will revise weekly during a campaign.

Store the content blocks in the database, one table, org-scoped, with the same block shapes the handoff describes: a four-column table, a paragraph, or a row of stat cards. Render from the database. An editing surface can come later, but the data has to be in a row now so that adding one is not a migration.

---

## A print view

Kendra is presenting to a committee. If the hub is the plan, the plan has to be able to leave the screen.

One print stylesheet covering the Start here, Budget, Gift table, and Hours tabs. Black on white, no chrome, no navigation, page breaks between sections. This is small and it is the difference between the hub being the plan and the hub being a website about the plan.

---

## Guardrails

**Nothing before auth.** A request with no session returns no donor name, no amount, no capacity figure, no household count, and no org name. Verify with curl.

**RLS is the access control.** The service-role client stays server-only and is used only by parsing routes. Every hub table has policies keyed to the user's membership in the org. The client-direction isolation tests above are the gate.

**No fabricated numbers.** Every figure carries `verified`, `estimated`, `stated`, or `placeholder`. A gap renders as a gap. This binds AI output hardest: the model never produces a dollar figure that is not grounded in a row, and anything it cannot ground renders as missing rather than as a plausible value.

**Voice rules on every string.** No em dashes. Contractions always. Never describe the community by what it lacks. No development jargon anywhere a user can see it. No emoji, no icons, typographic marks only. The handoff copy is final and was written to a strict voice. Do not rewrite it to sound more like a nonprofit.

**Young Life Connect stays the system of record for gifts.** The hub plans and reminds. It does not become a second ledger and nothing syncs anywhere.

**Do not touch existing Keystone surfaces.** No changes to the internal delivery views, the engagement records, the commission ledger, or the existing scoped account's five surfaces.

---

## Build order

Follow the handoff's six phases. One pull request per phase, one commit at a time inside each, build and types green before every commit, show the diff before committing.

Three changes:

- All six corrections and the theme layer land in phase one, in the first migration. Do not build on the handoff's schema and rename later.
- The client-direction isolation tests are written in phase one, before the feature, and they gate the phase.
- The export lands at the end of phase two.

**Stop after phase two and show Remi.** The gate, the theme layer, the shell, donors, gifts, and the parser are the product in miniature. If the shape is wrong it is wrong there.

---

## Ask Remi rather than decide

- Which budget file is authoritative for the goal and the cost.
- Whether Keystone's existing auth is a magic link or a passphrase. The handoff's reasoning for a magic link still holds, because this page carries phone numbers, capacity estimates, and giving history for real households. If Keystone is on a shared passphrase today, that is a conversation, not a silent upgrade.
- Whether a custom domain is wanted now or later.

Do not guess at any of these. Ask, and wait.

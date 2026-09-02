# Spec: EPA Young Life Fundraising Hub at /fundraising-hub/epayl

**Status:** draft, awaiting Remi's approval
**Owner:** Remi
**Target route:** `soboconsulting.com/fundraising-hub/epayl`
**Design source:** `Fundraising Hub.dc.html` in the Omelette project (eleven tabs, built from real data)
**Data sources already parsed:** `Top 100 List_CA495.xlsx` (Young Life donor export, 100 households),
`EPA_YoungLife_Three_Year_Budget.xlsx` (FY27 to FY29), `Donor Profile_ Gary and Michelle Dillabough.docx`
(the research template)

## Problem

Kendra is an Area Director doing fundraising work. She is not a development officer and should not have to
be one. Today the money lives in four places: a Young Life export she cannot easily read, a three-year
budget spreadsheet, a donor research doc written by hand, and her own memory. Nothing connects, nothing
reminds her of anything, and the one number that matters, whether this year gets funded, is not visible
anywhere.

The hub is one page she opens to answer three questions. What do I need to raise. Where is it coming from.
What do I do this week.

## Scope

In scope for v1: the gate, the eleven views already designed, donor and prospect records backed by
Supabase, research profiles, a task list, document upload with parsing, and the AI drafting that replaces
the custom GPT.

Out of scope: multi-tenant workspaces for other area directors, gift entry as a system of record (Young
Life Connect stays the source of truth for gifts), payment processing, email sending to donors, mobile app.

## The gate

Remi asked for a magic link, not a passphrase. That is a departure from the repo's existing client-page
gate (`src/lib/clientAuth.ts`), and the reason is honest: this page holds donor capacity estimates, phone
numbers, and giving history for real households. A shared passphrase that lives in an env var and gets
texted around is fine for a proposal sheet. It is not fine for this.

**Approach:** Supabase Auth, email OTP (magic link), with a server-side allowlist.

- Two addresses on the allowlist to start, Kendra's and Remi's, held in `EPAYL_HUB_ALLOWED_EMAILS` as a
  comma separated list. An email not on the list gets the same generic response as one that is, so the
  page never confirms who has access.
- The locked screen says what it is and nothing more: "This is the fundraising hub for East Palo Alto and
  East Menlo Park Young Life leadership." One email field, one button. No hint, no donor data, no numbers
  in the HTML response.
- Session in an httpOnly cookie, thirty days, same posture as the client pages.
- `X-Robots-Tag: noindex, nofollow` via the existing middleware, page-level `robots: {index: false}`, and
  the path added to the `robots.ts` disallow list.

**What this changes about the repo's stance.** `docs/architecture.md` says there is no `NEXT_PUBLIC`
Supabase key because the browser never talks to Supabase. Magic-link auth means the browser does talk to
Supabase, so `NEXT_PUBLIC_SUPABASE_ANON_KEY` gets added and row level security stops being decorative and
starts being the actual access control. Every hub table gets RLS policies keyed to the authenticated user.
The service-role client stays server-only and is used only by the parsing routes. This is worth writing
down because it is the first real authenticated surface on the site.

## Data model

Nine tables, all prefixed `hub_`, all RLS-protected, all scoped by `area_id` so a second area director can
be added later without a migration.

```sql
hub_areas            id, slug, name, fiscal_year_start, goal_cents, cash_on_hand_cents, created_at
hub_members          id, area_id, email, role (director | coach), created_at
hub_donors           id, area_id, household, informal_name, city, state, email, phone,
                     yl_account_number, lifetime_cents, gift_count, capacity_5yr_cents,
                     suggested_ask_cents, iwave_score, do_not_contact, receives_appeals,
                     status (donor | prospect | archived), source (yl_export | manual), created_at
hub_gifts            id, donor_id, fiscal_year, amount_cents, gift_date, designation, source
hub_profiles         id, donor_id, stage, headline, snapshot jsonb, public_notes jsonb,
                     capacity_ladder jsonb, relationship_read jsonb, questions jsonb,
                     proposals jsonb, sequence jsonb, ask_path jsonb, status (queued | drafting | complete),
                     generated_by (ai | human), reviewed_at, updated_at
hub_tasks            id, area_id, donor_id nullable, title, why, owner, due_date, done_at,
                     source (manual | ai_suggested | stewardship_rule), created_at
hub_budget_lines     id, area_id, fiscal_year, section, line, amount_cents, trust
                     (verified | estimated | stated | placeholder), note
hub_documents        id, area_id, storage_path, filename, kind (yl_export | budget | financial |
                     research | notes | grant), uploaded_by, parsed_at, parse_result jsonb, parse_error
hub_touches          id, donor_id, kind (thank_you | call | meeting | report | note), occurred_on, note,
                     created_by
```

Notes on the shape:

- Money is integer cents everywhere. No floats.
- `hub_gifts` is one row per household per fiscal year, which is the grain the Young Life export gives.
  When a real gift-level feed exists, the table already fits it.
- `hub_profiles` stores the ten sections of the research template as jsonb rather than nine text columns,
  because the template will change and a migration per change is not worth it. The Dillabough profile is
  the seed row and the schema reference.
- `hub_touches` is what makes stewardship reminders possible. Without a record of what a donor has heard,
  a reminder is a guess.

## Document upload and parsing

Kendra drops a file. Something useful happens. That is the whole requirement, and it is the feature most
likely to rot, so it gets built narrowly.

Upload goes to Supabase Storage in a private bucket, one folder per area. The row lands in
`hub_documents` immediately with `parsed_at` null, so a failed parse never loses the file.

Parsers, one per kind, all server side:

- **YL donor export (xlsx).** The known shape: 43 columns, mission unit code in A, household in C,
  FY2020 through FY2026 in Y through AE. Upserts `hub_donors` on `yl_account_number` and replaces that
  household's `hub_gifts` rows for the fiscal years present. Already written and proven against the real
  file in this project, so it ports rather than gets invented.
- **Budget (xlsx).** Reads the named tabs (3-Year Budget, Functional Expenses, Program Packages, When
  Money Is Needed, Funding Menu) into `hub_budget_lines` with the trust level carried through. The trust
  column is not decoration. Half the budget's most important numbers are placeholders and the hub has to
  keep saying so.
- **Research doc, meeting notes, grant letters.** Stored, text extracted, attached to a donor when one is
  named. Not parsed into structure. Trying to would produce confident nonsense.
- **Financial statements.** Stored only in v1. Flagged for a later pass.

Every parse writes a diff summary to `parse_result` and shows it to Kendra before it commits: rows added,
rows changed, and anything that looked wrong. A silent parse that quietly changes a donor's giving history
is worse than no parse.

## AI drafting

Four jobs, all server side, all producing a draft a human approves. Nothing is ever sent, saved as final,
or shown as fact without review.

1. **Research profile from a pasted donor record.** This is the custom GPT, rebuilt. Input is the YL row
   plus whatever public information Kendra pastes in. Output is the ten-section profile, written to
   `hub_profiles` with `status = drafting`. The Dillabough profile is the few-shot example and the quality
   bar.
2. **Thank-you notes and donor updates.** Input is the donor, their gifts, and their touch history. Output
   is a draft in Kendra's voice, following the house voice rules (no em dashes, contractions, never
   describing the community by what it lacks). The voice guide is not optional context here, it is the
   spec.
3. **This week's next actions.** Input is the gift table's gaps, task due dates, and the stewardship
   rules. Output is at most five suggestions with reasons, written to `hub_tasks` with
   `source = ai_suggested`. Kendra accepts or dismisses each one.
4. **Questions about her own data.** A text box over the hub's own tables. Read only. Answers cite the
   rows they came from, and say "not in the data" rather than guessing, because in fundraising a confident
   wrong number costs a relationship.

Guardrails, which matter more than the prompts: every AI-written number is labeled as such and carries its
trust level. The model never invents a giving figure. Anything it cannot ground gets rendered as a gap, not
as a plausible value.

## Stewardship reminders

Rules in code, not in a table, until the rules stop changing. Reading from `hub_gifts` and `hub_touches`:

- A gift over $10,000 with no `thank_you` touch inside seven days
- A gift over $10,000 with no `report` touch inside ninety days
- Any donor at any level with no touch in twelve months
- A monthly donor with no touch in one quarter
- An event guest with no touch inside forty-eight hours

Each fires a `hub_tasks` row with `source = stewardship_rule`, and only once per donor per rule per cycle.
Three of these are already firing on real data. The $50,000 Butcher gift has no thank-you on record.

## Build order

Six phases, one PR each, each usable on its own.

1. **Gate and shell.** Magic link, allowlist, RLS, the locked screen, the tab shell with the design already
   built, reading from seeded data. Verified with curl that a locked request returns no donor data.
2. **Donors and gifts.** Migration, the YL export parser, the donor list and the record view with editable
   notes and next steps. This is the first phase Kendra can actually use.
3. **Budget and financials.** Migration, the budget parser, the budget view with the gross-up, the runway
   chart, and the trust labels.
4. **Tasks and stewardship.** Task list tied to donors and dates, the rule engine, the start-here view
   assembling from real tasks instead of a hardcoded list.
5. **Research profiles.** The profile schema, the Dillabough seed, the profile view, and the AI drafting
   route behind it.
6. **Ask anything and drafting.** The data question box, thank-you drafting, weekly suggestions.

Phases one and two are the whole product in miniature. If work stops after two, Kendra still has something
better than what she has now.

## Definition of done, v1

- `/fundraising-hub/epayl` with no session shows the locked screen, and the HTML response contains no
  donor names, amounts, or capacity figures
- A magic link to an allowlisted address opens it and survives a refresh, a new tab, and a phone
- An address not on the allowlist gets the same response as one that is
- Dropping in a fresh Young Life export updates donor records and giving history, after showing a diff
- The goal, the renewal base, and the gap are computed from the database, not typed in
- Every number on the page carries a trust level
- Checking off a task, editing a note, and adding a donor all persist for the other user
- Not indexed: page metadata, robots.txt, and the header all say so

## Failure modes to avoid

- Donor data in the initial HTML or the JS bundle before auth
- RLS left permissive because the service-role client makes it look unnecessary
- A parse that changes giving history without showing what changed
- AI output presented as fact, or an invented dollar figure anywhere
- Rebuilding gift records the region already owns, and creating a second source of truth
- Hardcoding EPA anywhere the second area director would need changed

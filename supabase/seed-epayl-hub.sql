-- The EPA Young Life hub seed (specs/epayl-fundraising-hub.md).
-- Idempotent: safe to re-run; re-running refreshes the theme and
-- vocabulary rows and leaves member claims alone. Run on the live
-- project by the operator after migration 0046 (setup checklist).
--
-- What this deliberately does NOT seed: budget lines (they parse from
-- the authoritative workbook in phase three; no dollar amount is ever
-- typed in), donors and gifts (phase two, from the real export),
-- strategy goals (entered with trust levels when the plan figures
-- land). A figure that is not here renders as a gap, which is the
-- point.

-- The org, wearing its exact tokens (docs/hub/art-direction.md).
insert into public.hub_orgs (practice_id, slug, name, fiscal_year_start, theme, vocabulary)
select
  p.id,
  'epayl',
  'East Palo Alto Young Life',
  -- October through September: Kendra's answer in the budget workbook,
  -- confirmed by the design reference's own intro copy.
  '2026-10-01',
  '{
    "acid_black": "#211F1C",
    "acid_black_raised": "#2B2823",
    "bone": "#E9E1D1",
    "bone_dim": "#CFC6B2",
    "paper": "#F2EBDB",
    "paper_raised": "#F7F1E4",
    "gold": "#C9A03F",
    "gold_ink": "#A8842C",
    "forest": "#2C4736",
    "forest_ink": "#21402E",
    "terracotta": "#B4553A",
    "stone": "#9C927D",
    "stone_ink": "#8A8171",
    "line_on_black": "#3A362F",
    "line_on_paper": "#D8CDB4",
    "fonts": { "display": "abril-fatface", "body": "archivo", "detail": "space-mono" }
  }',
  '{
    "org_noun": "area",
    "wordmark": [
      { "text": "For God" },
      { "text": "So Loved", "tone": "gold" },
      { "text": "East Palo Alto" }
    ],
    "tagline": "Fundraising Hub",
    "door_headline": "This page is for East Palo Alto Young Life leadership",
    "door_body": "Put in your email and we''ll send you a link that signs you in. No password to remember. The link only works for the people on the list.",
    "door_footer": "Not public · Not indexed · Kendra and Remi only",
    "intro": "The plan for raising the money, and the budget it pays for. Year one runs October 2026 through September 2027. This file is for Kendra and Remi. Don''t send it to a donor."
  }'
from public.practices p
where p.slug = 'sobo'
on conflict (slug) do update set
  name = excluded.name,
  fiscal_year_start = excluded.fiscal_year_start,
  theme = excluded.theme,
  vocabulary = excluded.vocabulary;

-- The allowlist IS these rows: the two emails from the design
-- reference, email-keyed, claimed on first sign-in by the same RPC as
-- every Keystone membership.
insert into public.hub_members (org_id, practice_id, email, role)
select o.id, o.practice_id, m.email, m.role
from public.hub_orgs o,
  (values
    ('kendrasobo@gmail.com', 'director'),
    ('remi@soboconsulting.com', 'consultant')
  ) as m(email, role)
where o.slug = 'epayl'
on conflict (org_id, lower(email)) do nothing;

-- The five strategies PLAN is made of. Hours where the plan states
-- them ('stated'); no goal anywhere: goals land with trust levels when
-- the plan figures are entered, and until then PLAN says so.
insert into public.hub_strategies
  (org_id, practice_id, slug, name, owner, hours_per_week, hours_trust, sort)
select o.id, o.practice_id, s.slug, s.name, s.owner, s.hours, s.trust, s.sort
from public.hub_orgs o,
  (values
    ('major-gifts', 'Major gifts', 'Kendra', 3::numeric, 'stated', 0),
    ('monthly', 'Monthly partners', null, 1::numeric, 'stated', 1),
    ('brunch', 'Fall brunch', null, 2::numeric, 'stated', 2),
    ('churches', 'Church partners', null, null::numeric, null, 3),
    ('grants', 'Grants', null, null::numeric, null, 4)
  ) as s(slug, name, owner, hours, trust, sort)
where o.slug = 'epayl'
on conflict (org_id, slug) do nothing;

-- WORK's blockers, seeded with what is already known (the build
-- prompt's collateral list): things stopping other things.
insert into public.hub_collateral (org_id, practice_id, name, owner, due_date, status, blocks, sort)
select o.id, o.practice_id, c.name, c.owner, c.due_date, c.status, c.blocks, c.sort
from public.hub_orgs o,
  (values
    ('Pitch deck', null, null::date, 'exists', null, 0),
    ('Case for support', 'Remi', '2026-09-08'::date, 'missing', 'church asks and major donor follow-up', 1),
    ('Commitment cards', null, null::date, 'missing', 'the brunch ask and monthly sign-ups', 2),
    ('House photography', null, null::date, 'missing', 'the case for support and the brunch invitation', 3)
  ) as c(name, owner, due_date, status, blocks, sort)
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_collateral x where x.org_id = o.id and x.name = c.name
  );

-- Hours available, per person from the start: Kendra's stated seven,
-- and the back-office arrival whose hours are not settled yet.
insert into public.hub_capacity (org_id, practice_id, person, hours_per_week, trust, note, sort)
select o.id, o.practice_id, c.person, c.hours, c.trust, c.note, c.sort
from public.hub_orgs o,
  (values
    ('Kendra', 7::numeric, 'stated', 'Mornings, with donor meetings Tuesday and Thursday.', 0),
    ('Back office and grant research', null::numeric, null,
     'Kendra''s mother is arriving to take this on. Hours not settled yet.', 1)
  ) as c(person, hours, trust, note, sort)
where o.slug = 'epayl'
  and not exists (
    select 1 from public.hub_capacity x where x.org_id = o.id and x.person = c.person
  );

-- PLAN's open questions live in seed-epayl-plan-content.sql, which
-- owns and replaces the plan-open-questions section. The bootstrap
-- block that used to sit here is gone: it predated the v2 design
-- reference, which settled the wordmark, the hours, and the goals it
-- listed as open.

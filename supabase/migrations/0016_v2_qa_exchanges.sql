-- V2 2E: qa_exchanges (specs/keystone-v2-qa.md section 4).
--
-- The accountability copy of every Q&A exchange. Q&A writes NOTHING
-- to the system of record (the inert-output law satisfied by
-- construction); what remains is this table, and it is deny-all: RLS
-- on, ZERO policies, service-role only, exactly like ai_spend_ledger
-- and voice_violations. No session reads it: an asker's questions are
-- not browsable by other client members, and the practice gets no
-- surveillance feed of what a client wondered at midnight. A practice
-- review surface, if the pilot shows real need, is a later gated
-- decision. SECURITY.md section 5 carries this table's paragraph.

create table if not exists public.qa_exchanges (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  asked_by      uuid references auth.users(id) on delete set null,
  asker_side    text not null check (asker_side in ('practice','client')),
  question      text not null,
  answer_md     text,
  sources       jsonb not null default '[]',
  grounded      boolean,
  model_used    text,
  created_at    timestamptz not null default now()
);
create index if not exists qa_exchanges_engagement_idx
  on public.qa_exchanges (engagement_id, created_at desc);

alter table public.qa_exchanges enable row level security;
-- ZERO policies, deliberately. The service role is the only reader
-- and writer.

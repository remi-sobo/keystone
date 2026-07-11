-- V2 5C: the case study builder (specs/keystone-v2-case-study.md).
--
-- The record already holds the raw material; 5C assembles it. The AI
-- draft is the FIFTH propose-then-accept job and changes nothing
-- about the architecture: the model writes into ai_proposals, inert,
-- and one human accept is the only path into case_studies. The client
-- approval rides the 5D primitive (subject_type 'case_study', legal
-- since 0012): nothing carries a client's name or words into public
-- use without that explicit, audited record.
--
-- Status is draft or client_review only; approved-ness is READ from
-- the approvals row, never mirrored into a second column that could
-- drift. A client session reads the case study only once review is
-- asked: drafts are the practice's workshop.

alter table public.ai_proposals drop constraint ai_proposals_kind_check;
alter table public.ai_proposals add constraint ai_proposals_kind_check
  check (kind in ('extraction','digest','suggestion','case_study'));

create table if not exists public.case_studies (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null unique references public.engagements(id) on delete cascade,
  practice_id   uuid not null references public.practices(id) on delete cascade,
  client_id     uuid not null references public.clients(id) on delete cascade,
  title         text not null,
  body_md       text,
  quote_md      text,
  status        text not null default 'draft' check (status in ('draft','client_review')),
  proposal_id   uuid references public.ai_proposals(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists case_studies_practice_idx on public.case_studies (practice_id);

alter table public.case_studies enable row level security;

create policy case_studies_read on public.case_studies
  for select to authenticated
  using (
    private.is_practice_member(practice_id)
    or (status = 'client_review' and private.is_member_of_client(client_id))
  );
create policy case_studies_insert on public.case_studies
  for insert to authenticated
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
create policy case_studies_update on public.case_studies
  for update to authenticated
  using (private.keystone_can(practice_id, client_id, 'engagement.write'))
  with check (private.keystone_can(practice_id, client_id, 'engagement.write'));
-- No delete policy: a wrong draft is rewritten; the approval record,
-- once asked, is history.

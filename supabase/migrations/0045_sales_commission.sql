-- Sales Ring 4: money (specs/keystone-sales.md, built second by the
-- spec's own build order).
--
-- Section 4.4 of the agreement puts a recurring monthly obligation on
-- the practice: a statement with every payment showing org, amounts
-- collected, and the calculation. This ring discharges that obligation
-- by existing, so nobody hand-builds a statement every month.
--
-- Four rules the schema enforces rather than trusts:
--
--   1. Money is integer cents and rates are basis points. No floats
--      anywhere near a commission.
--   2. A commission row is written by a DATABASE TRIGGER, never by a
--      caller. "Automatic at the mutation layer, not opt-in per caller,
--      because opt-in logging is the gap the playbook already names."
--   3. One payment produces exactly one commission row, forever. The
--      unique constraint on payment_id is the wall; a client-minted
--      payment id with ON CONFLICT DO NOTHING is the second layer.
--      Keystone already shipped the four-rows-per-send bug in messages;
--      money is worse than messages.
--   4. The rate lives in the ROW, not in config (spec open decision 4).
--      A second rep at a different rate, or a re-signed agreement, must
--      never move a historical statement.
--
-- Stage, next step, and the six qualification fields are Rings 2 and 3
-- and are deliberately absent. A deal here is the money spine: what was
-- contracted, whose it is, what came in.

-- ---------------------------------------------------------------------
-- 1. The rate, on the member row
-- ---------------------------------------------------------------------

-- 2000 basis points is the 20% of section 4.3. Stored per member, so a
-- second rep on different terms needs data, not a migration. The value
-- is COPIED onto every commission row at accrual, so changing it here
-- never reaches a statement already issued.
alter table public.practice_members
  add column if not exists commission_rate_bp integer not null default 2000;
alter table public.practice_members
  drop constraint if exists practice_members_rate_range;
alter table public.practice_members
  add constraint practice_members_rate_range
  check (commission_rate_bp between 0 and 10000);

-- ---------------------------------------------------------------------
-- 2. sales_deals (the money spine)
-- ---------------------------------------------------------------------

create table if not exists public.sales_deals (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null references public.practices(id) on delete cascade,
  prospect_id    uuid not null references public.sales_prospects(id) on delete restrict,
  -- Both offers carried from day one. If the direct offer pays no
  -- commission, that is a rate of zero on the member row or on the
  -- deal, not a column that has to be added later.
  offer          text not null check (offer in ('greenhouse', 'direct')),
  amount_cents   bigint not null default 0 check (amount_cents >= 0),
  currency       text not null default 'USD',
  -- Denormalized from the prospect by the trigger below, never by a
  -- caller: the read wall filters on it, so it must not be forgeable.
  owner_id       uuid not null references auth.users(id) on delete restrict,
  signed_on      date,
  closed_outcome text check (closed_outcome in ('won', 'lost_to_alternative', 'no_decision')),
  closed_at      timestamptz,
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One deal per offer per org (the spec's rule, as a constraint).
create unique index if not exists sales_deals_prospect_offer_uniq
  on public.sales_deals (prospect_id, offer);
create index if not exists sales_deals_owner_idx
  on public.sales_deals (practice_id, owner_id, created_at desc);

-- The scope and the owner come from the prospect, always. A caller that
-- posts someone else's owner_id gets the prospect's, not theirs.
create or replace function private.keystone_sales_deal_scope()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_practice uuid;
  v_owner    uuid;
begin
  select p.practice_id, p.registered_by into v_practice, v_owner
    from public.sales_prospects p where p.id = new.prospect_id;
  if v_practice is null then
    raise exception 'sales_deal_unknown_prospect' using errcode = 'foreign_key_violation';
  end if;
  new.practice_id := v_practice;
  new.owner_id := v_owner;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sales_deals_scope on public.sales_deals;
create trigger sales_deals_scope
  before insert or update on public.sales_deals
  for each row execute function private.keystone_sales_deal_scope();

alter table public.sales_deals enable row level security;

-- Same wall as the registration record: the owner of the practice sees
-- every deal, the sales lead sees only his own, a consultant sees none.
create policy sales_deals_read on public.sales_deals
  for select to authenticated
  using (
    private.keystone_can(practice_id, null, 'sales.manage')
    or (private.is_sales_lead(practice_id) and owner_id = auth.uid())
  );

-- Failure mode 4 in the spec: registration is the single path to a deal
-- existing, so there is NO manual deal creation for the sales role.
-- Recording a signed amount is the practice's act.
create policy sales_deals_insert on public.sales_deals
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'sales.manage'));
create policy sales_deals_update on public.sales_deals
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'sales.manage'))
  with check (private.keystone_can(practice_id, null, 'sales.manage'));
-- No delete policy: a signed deal is a record.

-- ---------------------------------------------------------------------
-- 3. sales_payments (the one write path for money in)
-- ---------------------------------------------------------------------

-- Keystone has no invoicing (checked across the whole schema), so this
-- table IS the source of truth for collections, per the spec's second
-- open decision. If invoicing ever lands, payments read from it rather
-- than becoming a second place money gets typed.
create table if not exists public.sales_payments (
  -- Client-minted: the caller supplies the id and inserts with
  -- ON CONFLICT DO NOTHING, so a double-submitted form is one row.
  id                    uuid primary key,
  practice_id           uuid not null references public.practices(id) on delete cascade,
  deal_id               uuid not null references public.sales_deals(id) on delete restrict,
  amount_received_cents bigint not null check (amount_received_cents > 0),
  -- Section 4.2: commission is computed net of processing fees.
  processing_fee_cents  bigint not null default 0 check (processing_fee_cents >= 0),
  received_at           date not null,
  -- The bank, Stripe, or check reference. Unique per deal where given,
  -- so the same real-world payment cannot land twice under two ids.
  source_ref            text,
  note                  text,
  recorded_by           uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  check (processing_fee_cents <= amount_received_cents)
);
create unique index if not exists sales_payments_source_ref_uniq
  on public.sales_payments (deal_id, source_ref)
  where source_ref is not null;
create index if not exists sales_payments_deal_idx
  on public.sales_payments (deal_id, received_at desc);

-- Scope from the deal, never from the caller.
create or replace function private.keystone_sales_payment_scope()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_practice uuid;
begin
  select d.practice_id into v_practice
    from public.sales_deals d where d.id = new.deal_id;
  if v_practice is null then
    raise exception 'sales_payment_unknown_deal' using errcode = 'foreign_key_violation';
  end if;
  new.practice_id := v_practice;
  return new;
end;
$$;

drop trigger if exists sales_payments_scope on public.sales_payments;
create trigger sales_payments_scope
  before insert on public.sales_payments
  for each row execute function private.keystone_sales_payment_scope();

alter table public.sales_payments enable row level security;

create policy sales_payments_read on public.sales_payments
  for select to authenticated
  using (
    private.keystone_can(practice_id, null, 'sales.manage')
    or exists (
      select 1 from public.sales_deals d
      where d.id = sales_payments.deal_id
        and d.owner_id = auth.uid()
        and private.is_sales_lead(d.practice_id)
    )
  );

-- Money in is the practice's act. The sales lead reads his collections;
-- he never types one.
create policy sales_payments_insert on public.sales_payments
  for insert to authenticated
  with check (private.keystone_can(practice_id, null, 'sales.manage'));

-- No update policy and no delete policy: the ledger is append-only.
-- Corrections (a refund, a bounced check, a fee restated) have no path
-- in this ring, deliberately. That is a known open item, not an
-- oversight, and it is recorded in CURRENT.md as a FLAG.

-- ---------------------------------------------------------------------
-- 4. sales_commissions (trigger-written, never hand-entered)
-- ---------------------------------------------------------------------

create table if not exists public.sales_commissions (
  id              uuid primary key default gen_random_uuid(),
  -- THE idempotency wall. One payment, one commission row, forever.
  payment_id      uuid not null unique references public.sales_payments(id) on delete cascade,
  practice_id     uuid not null references public.practices(id) on delete cascade,
  deal_id         uuid not null references public.sales_deals(id) on delete restrict,
  owner_id        uuid not null references auth.users(id) on delete restrict,
  -- Copied at accrual so a rate change never moves a past statement.
  rate_bp         integer not null check (rate_bp between 0 and 10000),
  -- Received less processing fees (section 4.2), and the arithmetic
  -- done on it, both stored so the statement never recomputes.
  basis_cents     bigint not null check (basis_cents >= 0),
  amount_cents    bigint not null check (amount_cents >= 0),
  status          text not null default 'accrued' check (status in ('accrued', 'paid')),
  paid_at         timestamptz,
  paid_ref        text,
  -- The first of the month the payment was received in: the statement
  -- key of section 4.5.
  statement_month date not null,
  created_at      timestamptz not null default now()
);
create index if not exists sales_commissions_statement_idx
  on public.sales_commissions (practice_id, statement_month, owner_id);
create index if not exists sales_commissions_owner_idx
  on public.sales_commissions (owner_id, status);

-- Accrual. SECURITY DEFINER so the row is written by the schema itself:
-- no session, service role or otherwise, has an insert policy here.
create or replace function private.keystone_sales_accrue_commission()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_rate  integer;
  v_basis bigint;
begin
  select d.owner_id into v_owner
    from public.sales_deals d where d.id = new.deal_id;

  -- The rate on the owner's membership row at the moment of accrual.
  -- A sales lead with no membership row (revoked, say) accrues at zero
  -- rather than silently defaulting to twenty percent.
  select coalesce(max(pm.commission_rate_bp), 0) into v_rate
    from public.practice_members pm
   where pm.user_id = v_owner
     and pm.practice_id = new.practice_id;

  v_basis := new.amount_received_cents - new.processing_fee_cents;

  insert into public.sales_commissions (
    payment_id, practice_id, deal_id, owner_id,
    rate_bp, basis_cents, amount_cents, statement_month
  ) values (
    new.id, new.practice_id, new.deal_id, v_owner,
    v_rate, v_basis,
    round(v_basis::numeric * v_rate / 10000)::bigint,
    date_trunc('month', new.received_at::timestamp)::date
  )
  -- Belt and braces with the unique constraint: a replayed insert can
  -- never double-accrue, whatever path it arrived by.
  on conflict (payment_id) do nothing;

  return new;
end;
$$;

drop trigger if exists sales_payments_accrue on public.sales_payments;
create trigger sales_payments_accrue
  after insert on public.sales_payments
  for each row execute function private.keystone_sales_accrue_commission();

alter table public.sales_commissions enable row level security;

create policy sales_commissions_read on public.sales_commissions
  for select to authenticated
  using (
    private.keystone_can(practice_id, null, 'sales.manage')
    or (private.is_sales_lead(practice_id) and owner_id = auth.uid())
  );

-- No insert policy for anybody: the trigger is the only author.
-- Update exists for one purpose, marking a commission paid, and the
-- column grant below makes that structurally true rather than trusted.
create policy sales_commissions_mark_paid on public.sales_commissions
  for update to authenticated
  using (private.keystone_can(practice_id, null, 'sales.manage'))
  with check (private.keystone_can(practice_id, null, 'sales.manage'));

-- The 0007 messages pattern: a session may write these three columns
-- and no others, so no policy bug can rewrite an amount or a rate.
revoke update on public.sales_commissions from authenticated;
grant update (status, paid_at, paid_ref) on public.sales_commissions to authenticated;

-- ---------------------------------------------------------------------
-- 5. The monthly statement (section 4.5, satisfied by existing)
-- ---------------------------------------------------------------------

-- security_invoker: the view runs under the CALLER'S RLS, so the sales
-- lead's statement holds his rows and the owner's holds every row, with
-- one definition and no second wall to keep in step.
create or replace view public.sales_commission_statement
with (security_invoker = true) as
  select
    c.practice_id,
    c.statement_month,
    c.owner_id,
    p_row.org_name                     as org_name,
    d.offer                            as offer,
    d.id                               as deal_id,
    count(*)                           as payment_count,
    sum(pay.amount_received_cents)     as collected_cents,
    sum(pay.processing_fee_cents)      as processing_fee_cents,
    sum(c.basis_cents)                 as basis_cents,
    max(c.rate_bp)                     as rate_bp,
    sum(c.amount_cents)                as commission_cents,
    sum(c.amount_cents) filter (where c.status = 'paid')    as commission_paid_cents,
    sum(c.amount_cents) filter (where c.status = 'accrued') as commission_pending_cents
  from public.sales_commissions c
  join public.sales_payments  pay   on pay.id = c.payment_id
  join public.sales_deals     d     on d.id = c.deal_id
  join public.sales_prospects p_row on p_row.id = d.prospect_id
  group by c.practice_id, c.statement_month, c.owner_id, p_row.org_name, d.offer, d.id;

grant select on public.sales_commission_statement to authenticated;

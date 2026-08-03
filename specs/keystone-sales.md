# Spec: Keystone sales module and the sales lead role

*Draft v1. Written before code, per the house method. Assumptions are marked. Correct them and I will revise.*

---

## The honest read before the spec

You have zero closed Greenhouse deals. Building six rings of sales tooling before Niyi has made ten calls is the wrong order, and it is exactly the failure your own business plan names: the single builder spends hours on the thing that is not the bottleneck.

Two rings have to exist before he starts. Everything else can wait for real deals to shape it.

- **Ring 1, deal registration.** The contract says a prospect is his only if he registered it first. That rule is unenforceable without a timestamp in a system. This is not a nice-to-have, it is the clause that keeps a disagreement from becoming a family disagreement.
- **Ring 4, the commission ledger.** Section 4.4 puts a recurring monthly obligation on you: a statement with every payment showing org, amounts collected, and the calculation. Build it once and the system discharges the obligation. Skip it and you owe Niyi a hand-built statement every month for six months.

Rings 2, 3, 5, and 6 are worth building when there are fifteen deals in the pipeline and you can see which fields you actually reach for. Until then a board and a qualification card are a spreadsheet, and that is fine.

**Recommendation: build rings 1 and 4 now. Defer the rest until cohort one is half sold.**

---

## Problem statement

Niyi starts selling with no system. Every deal he touches raises three questions nobody can answer from a record: is this prospect his or a house account, what stage is it actually in, and what is he owed this month. Today the answer to all three lives in memory and text messages, which works until the first disagreement and then works badly. Meanwhile Remi carries a monthly reporting obligation under the agreement that nobody has built a way to meet.

## Who is affected

- **Niyi**, sales lead. Needs to register prospects, work a pipeline, and see his own money.
- **Remi.** Needs to see the whole pipeline, owe nothing manually, and never expose client delivery data to a contractor.
- Indirectly, every prospect, because a stalled deal that nobody flags is a deal that closes with a "no decision."

## Current behavior

Keystone has an engagement lifecycle where a client row reaching `engaged` spawns a project carrying pursuit and delivery phases. Pursuit exists as a phase, not as a sales surface. There is no contractor role, no per-deal qualification, no commission accounting, and no registration record.

## Desired behavior

Niyi logs into Keystone and sees a surface containing his deals, his qualification work, his commission, and the approved materials he is allowed to sell from. He sees nothing else in the system. Remi sees all of it plus the money view.

## Scope

**In:**
- A `sales_lead` role with its own scoped surface and RLS wall
- Deal registration with a timestamp, house-account collision check, and expiry
- Pipeline stages with verifiable exit criteria
- A qualification card per deal, six fields, trimmed from MEDDIC
- Payment records and a commission ledger that computes 20% per payment received
- A monthly statement view that satisfies section 4.5 of the agreement without manual work
- A read-only, versioned library of approved sales materials
- Remi's roll-up: stage conversion, stalled deals, commission liability

**Out:**
- Any access to client delivery work, session notes, engagement records, BloomOS instances, or SOBO financials
- Weighted forecasting (see Failure modes)
- Email sequencing, dialer, or any outbound automation
- Contract generation or e-signature
- A second sales seat. One rep, one role, until there are two.

---

## The sales system, and why this one

### Process and methodology are different things

A sales *process* is the stages a deal moves through. A *methodology* is how you qualify and sell inside them. The most common way a methodology rollout produces nothing is bolting fields onto a CRM without changing behavior.

**Keystone encodes the process. Niyi brings the methodology.** He is a salesman you hired for his ability to sell. The system's job is to record what is true, not to teach him how to run a call.

### Why not full MEDDPICC

MEDDIC is the reference standard for complex B2B qualification: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion. MEDDPICC adds Competition and Paper Process. It is built for enterprise deals above $50k with long cycles and large buying committees. At $20k to $25k with one or two decision makers, the standard advice is not to over-engineer it.

But nonprofits are not simple buyers. An ED cannot sign a $20k commitment without a board, and the board meets on a schedule nobody controls. So the elements that matter are not the ones a SaaS team would pick.

### The six qualification fields

| Field | What it captures | Why it matters here |
|---|---|---|
| **The number** | The metric they want to move | Consistent fundraising, or hours the ED loses to admin. If he cannot name it, there is no case for $20k. |
| **The pain, in their words** | What is actually broken | Your whole method is diagnostic. This field is the diagnostic captured verbatim, not paraphrased. |
| **Who signs** | The economic buyer | Often the ED. Often the board chair. Sometimes a funder. Getting this wrong is the most expensive mistake available. |
| **How they decide** | Board cadence, next meeting date | This is the paper process for a nonprofit, and it is the single best predictor of when cash arrives. Make it a date field. |
| **The champion** | Who inside wants this | Usually the person on the call. Name them anyway. |
| **The alternative** | What happens if they do nothing | Almost always "keep going as-is" or "hire a development director." Not a competitor. Naming it is how the deal stops being a comparison and starts being a decision. |

The card is not a quiz. Fields become **exit criteria**: a deal cannot leave Discovery until the pain, the number, and the signer are filled. The framework becomes the gate rather than a scorecard.

### The stages

Five to seven stages, named in past tense so a stage can only be entered after the thing happened. Present-continuous names invite advancing on intent rather than fact. Each stage carries exit criteria that are observable, buyer-verified, and binary.

| Stage | Exit criteria, all must be true |
|---|---|
| **1. Registered** | Prospect logged with a date. No house-account collision. Discovery call booked with a real date on a real calendar. |
| **2. Discovery held** | Call happened. The number, the pain, and the signer are filled in. |
| **3. Fit confirmed** | Buyer has said in their own words which offer they want. Decision date named by them, not guessed. |
| **4. Proposal out** | Agreement or two-pager sent, and the buyer has come back with feedback, a question, or an objection. Silence does not exit this stage. |
| **5. Decision pending** | Buyer has confirmed the meeting or vote where this gets decided, with a date. |
| **6. Signed** | Agreement signed. |
| **7. Collecting** | First payment received. This is the moment it becomes a Qualified Sale under section 4.3, and the moment commission begins. |

Closed outcomes are a separate field, not a stage: **won**, **lost to an alternative**, **no decision**. Track no-decision separately. Research across a large body of recorded sales calls found roughly 40% to 60% of deals end in no decision rather than a loss to a competitor. If that is where your deals die, the fix is urgency and decision-process work, not a better pitch. You cannot see that if both outcomes go in one bucket.

---

## Architecture sketch

Follows the module pattern. One domain area, one component, tab nav, data through `apiFetch('/api/sales/...')`, dedicated tables with their own RLS.

```
sales_prospects        org, contact, source, registered_by, registered_at,
                       expires_at, status
                       -> unique index on normalized org name
                       -> collision check against house_accounts and
                          existing client rows at insert

sales_deals            prospect_id, offer (greenhouse | direct), stage,
                       amount, close_reason, owner_id
                       -> qualification fields live here, six columns
                       -> next_step text + next_step_due date, required

sales_payments         deal_id, amount_received, received_at, source_ref
                       -> the one write path for money in

sales_commissions      payment_id, rate, amount, status (accrued | paid),
                       paid_at
                       -> computed at the mutation layer when a payment
                          row lands, never hand-entered

house_accounts         org name, added_at, note
                       -> seeded from Exhibit A of the agreement

sales_materials        title, version, file_ref, published_at
                       -> read-only to sales_lead
```

Flow, plainly:

- Niyi registers a prospect. The insert checks `house_accounts` and existing client rows before it writes. A collision blocks the write and tells him why, at the moment he types it, not three months later in an argument.
- A prospect becomes a deal when a discovery call is booked. One deal per offer per org.
- Stage changes call a single `advanceStage` function that validates exit criteria and refuses the move if a required field is empty. Same shape as `syncToStage`: safe to call repeatedly, idempotent.
- A payment row landing triggers a commission row at 20% of the amount received, net of processing fees per section 4.2. Automatic at the mutation layer, not opt-in per caller, because opt-in logging is the gap the playbook already names.
- The statement view is a query over `sales_commissions` grouped by month and org. It is always current, so section 4.5 is satisfied by the system existing.

Every write appends to the activity log automatically.

**The privacy wall.** `sales_lead` reads and writes only rows where `owner_id` is their own, in the sales tables only. No policy grants that role any read on engagement, project, session, client, or finance tables. A `sales-role-isolation.spec.ts` asserts it, and the service-role API routes re-check the wall inside the query rather than trusting the role check at the door.

---

## What Niyi sees

Five things. Nothing else.

1. **My pipeline.** Board by stage, his deals only. Each card shows org, offer, amount, days in stage, and the next step with its due date. A card with no next step or an overdue one is flagged. That flag is the whole discipline.
2. **Deal detail.** The qualification card, activity log, stage history, and the exit criteria for the current stage shown as a checklist so he knows exactly what advances it.
3. **Register a prospect.** The form that creates the timestamp. Runs the house-account check live.
4. **My commission.** Per deal: contracted amount, collected to date, commission accrued, commission paid, commission pending. A monthly statement view. Plain language at the top restating that commission is paid on money received, so the arithmetic never surprises him.
5. **Materials.** The approved two-pagers, the diagnostic, the pricing sheet. Read-only, versioned, with the version he is looking at stamped on the page. This is what makes "only as described in SOBO's approved materials" a real constraint instead of a sentence in a contract.

**What he does not see:** SafeSpace, Wild Wanderers, Team Esface, Beyond Veneer, any engagement or session record, any BloomOS instance, any SOBO financials, margins, or cost data, and any deal he did not register.

## What Remi sees

Everything above across all owners, plus:

- **Commission liability.** What is owed as money arrives, this month and next. This is a real cash line and it should sit next to revenue, not be remembered.
- **Stage conversion.** Where deals die. Watch the no-decision rate specifically.
- **Stalled deals.** Anything with no logged activity in fourteen days, or a next step past due.
- **Registration expiry queue.** Prospects approaching the 180-day expiry, so nothing lapses silently and turns into a conversation.

---

## Staged build order

**Ring 1. Registration and the wall.** Schema for `sales_prospects`, `house_accounts`, the `sales_lead` role, RLS policies, the registration form with live collision check, and `sales-role-isolation.spec.ts`. Niyi can log in, register prospects, and see nothing he should not. Commit point.

**Ring 4 (build second). Money.** `sales_payments`, `sales_commissions`, automatic commission accrual at the mutation layer, the My Commission surface, the monthly statement view. Commit point.

*Stop here until cohort one is half sold.*

**Ring 2. The board.** `sales_deals`, stages, `advanceStage` with exit-criteria validation, the pipeline board, next-step enforcement. Commit point.

**Ring 3. Qualification.** The six fields on deal detail, wired as exit criteria for stages 2 and 3. Commit point.

**Ring 5. Materials.** `sales_materials`, versioned, read-only surface. Commit point.

**Ring 6. Remi's roll-up.** Conversion by stage, no-decision rate, stalled flags, commission liability, expiry queue. Commit point.

## Definition of done

- Niyi logs in and can reach exactly five surfaces. A direct URL to any engagement, client, or finance route returns 404 or a denial, not a partial render.
- Registering an org on the Exhibit A list is blocked at insert, with the reason shown on the form.
- A payment row inserted through any path produces exactly one commission row at 20%, and inserting the same payment twice produces one, not two.
- The statement view for a given month matches a hand calculation on the same data.
- `sales-role-isolation.spec.ts` passes, and fails if any sales table policy is loosened.
- One real run at 390px on live data. Niyi works from a phone.

## Failure modes to watch for

1. **Weighted forecasting invented from nothing.** With one rep and no closed history, stage probabilities are made up, and a made-up number in a dashboard becomes a number you plan cash against. Show two honest figures instead: signed-but-uncollected, and open pipeline. No weighting until twenty closed deals exist.
2. **Duplicate commission rows.** You already hit this shape in Keystone with message duplication: four rows per send from a missing in-flight state and no idempotency layer. Money is worse than messages. Client-minted UUIDs on payment inserts, `ON CONFLICT DO NOTHING`, and commission accrual gated behind a row-inserted check.
3. **The wall leaking through a service-role route.** The role check at the door passes, the query inside uses the admin client, and a contractor sees SafeSpace data. Re-check scope inside every query, and make the isolation test assert against the route, not the policy.
4. **Registration used inconsistently.** If Niyi registers some prospects and mentions others in a text, the timestamp record is worthless and you are back to memory. This is a habit problem, not a software problem, and the software only helps if registration is the single path to a deal existing. No manual deal creation for the sales role.
5. **Stage inflation.** Deals parked in "Proposal out" because sending felt like progress. The exit criterion that fixes it is already written: the buyer has to come back. Enforce it in `advanceStage` rather than trusting the label.
6. **Building the whole thing first.** Named at the top. Rings 2, 3, 5, and 6 built before real deals exist will be built around guesses about which fields matter.

---

## Open decisions

1. **Does Niyi see the direct engagement in his pipeline?** Depends on the 4.1 decision in the agreement. If direct pays commission, the offer field carries both. If not, he only ever sees Greenhouse deals and you take direct deals off the board manually.
2. **Where do payments come from?** If invoicing already lives somewhere in Keystone, `sales_payments` should read from it rather than being a second place money gets typed. If not, this ring includes the payment record and it becomes the source of truth for collections.
3. **Exhibit A seeding.** The house-account table is only as good as that list. Same confirm as the contract.
4. **Does the commission rate live in config or in the row?** Put it in the row. If a future rep is at a different rate, or Niyi's second agreement changes, historical rows must not move.

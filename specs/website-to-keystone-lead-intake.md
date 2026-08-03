# Spec: website to Keystone lead intake

*Draft v1. Companion to `keystone-sales-module.md`. Spans two repos: `remi-sobo/sobo-consulting` and Keystone.*

---

## Blocker before any code

The agreement's section 5 makes registration the only path to a Qualified Sale. Every website lead fails that test, because SOBO touched it first by definition. Build this without amending the contract and the system will hand Niyi deals his agreement says he is not owed on.

**Amendment needed, section 5, second path:**

> A prospect also belongs to Representative where SOBO assigns an inbound lead to Representative in writing through SOBO's pipeline system. The assignment date carries the same effect as a registration date under this section, and the same one hundred eighty (180) day expiry applies. SOBO decides which inbound leads to assign and is under no obligation to assign any.

That last sentence matters. It keeps you free to hand a lead to yourself, to Kendra, or to nobody, without it becoming a conversation about what he was promised.

---

## Problem statement

The restructured site sends everyone to one contact form. Today those submissions land in a Supabase table and an email. Nobody works them from a system, and there is no path from a form fill to a deal in a pipeline. Once Niyi is selling, an inbound nonprofit lead that sits in an inbox for four days is a lead that has already called someone else.

At the same time, most submissions are not sales leads. Families, schools, existing clients, and vendors all use the same form. Routing all of them into a contractor's pipeline exposes data he should never see.

## Desired behavior

A nonprofit fills out the form. Within seconds the submission appears in a Keystone triage inbox that only Remi sees. Remi routes it to sales in one tap. It becomes a prospect with an assignment timestamp, runs the house-account collision check, and appears in Niyi's pipeline with a notification. Everything Remi does not route stays invisible to Niyi permanently.

## Scope

**In:**
- Extra fields on the contact form that make triage fast and make the collision check possible
- A server-to-server forward from the site to a Keystone intake endpoint
- A staging table in Keystone that the site writes to and nobody else can
- A triage surface for Remi with three outcomes: route to sales, keep for me, discard
- Assignment records with timestamps
- Source and attribution carried end to end

**Out:**
- Any direct database access between the two projects
- Auto-assignment of any kind. A human routes every lead.
- Lead scoring
- Any write path from Keystone back to the marketing site

---

## Architecture

The site never touches Keystone's real tables. It posts to one narrow endpoint that only writes to a mirror, and the mirror is never truth. This is the same import pattern already proven in BloomOS: land the source in staging, promote into the spine idempotently keyed on an external id.

```
soboconsulting.com
  contact form
    -> POST /api/contact
       -> zod validate, honeypot, rate limit
       -> insert contact_submissions          (durable, site's own record)
       -> Resend notification to Remi          (unchanged)
       -> POST to Keystone intake              (non-fatal, never blocks the form)
          headers: x-intake-secret
          body: { submission_id, org_name, contact_name, email,
                  audience, role, budget_band, message,
                  source_page, utm, submitted_at }
       -> stamp forwarded_at on success

Keystone
  POST /api/intake/lead
    -> secret header check, constant-time compare
    -> zod validate
    -> insert sales_intake_staging
       keyed on external_submission_id, ON CONFLICT DO NOTHING
    -> return 200 on both insert and conflict

  Triage surface (Remi only)
    -> route to sales
         -> house-account collision check on normalized org_name
         -> insert sales_prospects with
              source = 'inbound'
              assigned_to, assigned_at
         -> notify Niyi, gated behind row-inserted
    -> keep for me   -> routes to Remi's own capture inbox
    -> discard       -> soft delete with reason, recoverable
```

### Why push and not a shared database

A shared Supabase project between the marketing site and Keystone would be faster to build and wrong. The public site is the more exposed surface of the two. Giving it write access to internal tables means a compromise of the site is a compromise of client delivery data.

The intake endpoint is the constrained version: one route, one insert, one table nobody reads from directly, an opaque rotatable secret, and a payload that cannot express anything except a lead. Same shape as the MCP front door already running in BloomOS.

### The forward is non-fatal

If Keystone is down, the form still succeeds, the row still lands in `contact_submissions`, and the email still goes out. `forwarded_at` stays null. A later reconcile job picks up unforwarded rows. Build the reconcile in a later commit, but design the column in now, because retrofitting a null-tracking field after leads have been lost is not a thing you can do.

---

## What the form needs to capture

The current form was built for a person to read. It now feeds a system, so it needs three things it probably does not have.

| Field | Why |
|---|---|
| **Organization name** | The house-account collision check keys on a normalized version of this. Without it, the check cannot run and section 5 is unenforceable on inbound. Required. |
| **Audience door** | Nonprofit, business, family, school. This is the single field that makes triage a tap instead of a read. It should prefill from the page they came in on and stay editable. |
| **Role** | Executive director, board member, owner, parent, principal. Tells you whether you are talking to the economic buyer before the first call. |
| **Budget band** | Already decided as the qualifying field, since no prices appear on the site. Carry it through to the deal. |
| **Source page and UTM** | Cheap to capture now, impossible to reconstruct later. This is how you eventually learn which door produces deals. |

Nothing here should make the form feel like an application. Five fields plus a message box.

---

## Build order

Keystone's intake endpoint has to exist before the site forwards to it, or the site fires into nothing. But the site's schema change is harmless on its own, so it goes first.

**Commit 1, sobo-consulting.** Extend `contact_submissions` with org_name, audience, role, budget_band, source_page, utm, forwarded_at. Update the zod schema and the form. No forwarding yet.

**Commit 2, Keystone.** `sales_intake_staging` table, RLS on with zero policies for members, `POST /api/intake/lead` with secret auth and idempotent insert. Test it with curl before anything points at it.

**Commit 3, Keystone.** Triage surface for Remi. Three outcomes. Route-to-sales creates the prospect with assignment timestamp and runs the collision check.

**Commit 4, sobo-consulting.** Wire the forward. Non-fatal, stamps `forwarded_at`, logs failures.

**Commit 5, Keystone.** Notification to Niyi on assignment, gated behind a row-inserted check.

**Commit 6, Keystone.** Reconcile job for unforwarded submissions.

Commits 1 through 4 are the working system. 5 and 6 make it reliable.

## Definition of done

- A form fill on production appears in the Keystone triage inbox within thirty seconds.
- Submitting the same form twice produces two `contact_submissions` rows and one prospect after triage, not two.
- Replaying the same intake POST five times produces one staging row.
- Keystone taken offline: the form still succeeds, the email still sends, `forwarded_at` is null, and the reconcile job picks it up.
- An org on the Exhibit A list submits the form: triage shows the collision and blocks route-to-sales with the reason visible.
- Niyi's login shows only routed leads. A staging row that was never triaged is not reachable by him through any route or direct URL.

## Failure modes to watch for

1. **Auto-assignment creeping in.** The moment someone adds "nonprofit inquiries skip triage," the privacy wall has a hole and an existing client's message can land in a contractor's pipeline. Keep the human step. It costs you four seconds.
2. **Duplicate notifications.** Same shape as the message duplication bug already fixed in Keystone: missing in-flight state, no idempotency. Gate the Resend call behind the row-inserted check, not behind the request succeeding.
3. **The secret in the wrong place.** It belongs in Keystone and in the site's server environment only. Never in a `NEXT_PUBLIC_` var, never in client-side code. Rotatable, and rotate it the first time anyone new touches either repo.
4. **Org name typed three ways.** "SafeSpace", "Safe Space Center", "SafeSpace Center, Inc." all defeat the collision check. Normalize on insert: lowercase, strip punctuation, strip common suffixes. Match on the normalized column, show the original.
5. **Leads lost silently.** If the forward fails and nobody watches `forwarded_at`, leads vanish into a column. The reconcile job in commit 6 is what makes this a delay instead of a loss.
6. **Attribution added later.** It cannot be. Capture source and UTM in commit 1 even though nothing reads them for months.

## Open decisions

1. **Does Niyi ever see inbound before you route it?** Recommendation: no, never. Confirm.
2. **Is there a second contact path?** Calendar bookings, a Greenhouse-specific form, anything embedded in the two-pager. Every path needs the same forward, or leads arrive through a door with no record.
3. **Does an inbound lead expire faster than a registered one?** The contract says 180 days for both. Worth considering a shorter window on assigned leads, since an inbound lead sitting unworked for six months should come back to you rather than sit in his pipeline. Requires a contract edit if you want it.

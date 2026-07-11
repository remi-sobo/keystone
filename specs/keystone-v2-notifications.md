# Spec: Keystone V2 4F, the notifications layer

**Parent:** `specs/keystone-v2.md` Phase 4 epic 4F, pulled to the front of Phase 3 by the roadmap's own note: several Phase 3 features silently assume this infrastructure (3C's reminders, 3H's nudges, 3B's run-of-show reminders), so the infra lands before those nudges ship. Shaped by pilot harvest item 2 (Remi, 2026-07-09): messages and notifications as one deliberately built surface, "messages plus nudges in one place," batching over pings, and every user a mute. A consulting client should feel held, not hounded.
**Grounded against:** the live codebase after 3A. Today the only notifications are the message emails (immediate, per message, working) and the invite emails. Homework feedback, submissions, poll openings, and shipped deliverables make no sound at all; homework due dates nag nobody. `lib/email.ts` (Resend, the branded shell, honest degradation) and the digest cron pattern (CRON_SECRET, fails closed) are the delivery rails this epic reuses.
**Status:** draft for Remi. CONFIRM gates in section 7.
**Date:** 2026-07-10

---

## 1. What 4F is

One notification table, one emission chokepoint, one batched daily email, and one calm reading surface per side. Three laws:

1. **Batched, never spammy.** This layer sends at most ONE email per recipient per day, and only on a day something new happened. No per-event pings exist here at all; the messages email keeps its existing immediacy because correspondence is different from notification.
2. **The inbox is a reading surface, never a second place to write** (the harvest item's own law). Everything in it links to the real surface where the thing lives.
3. **Every user has a mute.** In-app is always on (it is just reading); email is per-user: batched (default) or off.

## 2. Schema (migration 0020)

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references practices(id) on delete cascade,
  client_id     uuid references clients(id) on delete cascade,
  engagement_id uuid references engagements(id) on delete cascade,
  -- the recipient: exactly one person, on exactly one side
  recipient_client_member_id   uuid references client_members(id) on delete cascade,
  recipient_practice_member_id uuid references practice_members(id) on delete cascade,
  kind  text not null check (kind in
        ('homework_submitted','homework_feedback','homework_due','homework_overdue',
         'poll_opened','poll_booked','deliverable_shipped','approval_waiting','message_reply')),
  title text not null,
  href  text not null,
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  emailed_at timestamptz,
  check (num_nonnulls(recipient_client_member_id, recipient_practice_member_id) = 1)
);

create table notification_prefs (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  client_member_id   uuid references client_members(id) on delete cascade,
  practice_member_id uuid references practice_members(id) on delete cascade,
  email_mode text not null default 'batched' check (email_mode in ('batched','off')),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(client_member_id, practice_member_id) = 1),
  unique (client_member_id), unique (practice_member_id)
);
```

- **Your inbox is yours: the read policy is a recipient wall**, the homework-trail discipline again. Read admits ONLY the owner of the recipient membership (`owns_client_membership` / `owns_practice_membership`), deliberately never `is_member_of_client`: a teammate reads zero of your notifications, ever. Same-client zero-read joins the matrix as a named case.
- **Sessions never insert or delete.** Rows are emitted only through `src/lib/notify.ts` (service role inside the lib, the `qaExchange.ts` precedent, so pure-RLS client actions can emit too; the no-service-role CI guard on surface files holds). The one session write is `read_at` on your own rows (column-level grant, the messages `read_at` pattern).
- **`dedupe_key`** makes reminders idempotent: `hw_due:<item_id>` can only ever land once, however many cron runs see the same due date.
- **Prefs:** each person reads and upserts their own row only (self-authored, own membership); no cross-member reads at all. Title text is client-facing copy already (item titles, deliverable names); nothing from transcripts, message bodies, or trail notes ever enters a notification.
- **Isolation matrix, same PR:** cross-practice, cross-client, and the same-client recipient wall on both tables; forged-recipient insert denied; session insert/delete denied; `read_at` updatable on own rows only and no other column moves; prefs readable and writable only by their owner. Static gate `notifications-isolation.spec.ts`; both tables join the ratchet.

## 3. Emission points (wired in this PR, one line each at the acting site)

| Event | Recipients | Where it fires |
|---|---|---|
| Homework submitted | practice members | the coachee's submit (client action, via the lib) |
| Homework feedback (send back, accept) | the coachee | acceptHomework / sendBackHomework |
| Homework due tomorrow / 3 days overdue | the assignee | the daily cron, dedupe-keyed |
| Poll opened | the client team | createSessionPoll |
| Poll booked | the client team | confirmPollOption |
| Deliverable shipped | the client team | the deliverable add action |
| Approval waiting (charter sign-off) | pending approvers | charter publish |
| Message reply | the recipient side | the existing send paths (the email they already get stays; this adds the in-app row) |

Later epics emit as they land (3B session reminders, 3D acceptance requests); the chokepoint is the contract.

## 4. Delivery

- **In-app:** the client's unified surface is `/messages`, per the harvest instinct: the page gains a "New for you" block above the thread (unread notifications, each a link, with mark-all-read) and the sidebar Messages item carries the combined unread count. The mobile tab bar stays at its five-item cap because nothing new is added to it. The practice side gets the same block as a card on `/today`, where the practice already starts its day.
- **Email:** one daily cron (`/api/notify`, CRON_SECRET, fails closed like the digest cron) that first materializes the due/overdue reminders, then gathers each recipient's unemailed unread rows and sends ONE branded email ("Three things new in your engagement room", title plus link each), honoring `email_mode`, stamping `emailed_at`, degrading honestly per recipient. A day with nothing new sends nothing.
- **No push, no SMS, no real-time channel.** Quiet-hours preferences are deferred until a real-time channel exists for them to quiet (gate 4F-4); a daily batch at a fixed civilized hour does not need them.

## 5. AI

None. Notifications are facts about the record, never generated prose.

## 6. The per-feature gate walk

- Two new scoped tables carrying `practice_id` (and `client_id`/`engagement_id` where the event has one), recipient-wall RLS, and cross-practice, cross-client, AND same-client matrix cases in the same PR.
- New person-data: an event title and a read timestamp per person, minimized, owner-readable only, no content from walled surfaces; the audit log records emission counts only.
- Client surface stays pure RLS in its files; the lib chokepoint is the documented service-role exception, SECURITY.md gets its paragraph.
- Rate limiting: the cron is secret-gated; emission points are already inside rate-limited or membership-gated actions.
- Copy voice-swept; counts are facts, never urgency theater (no red badges, no "you're falling behind").
- Mobile: the client block lives on /messages at 390px, one line per item, tap targets full width.

## 7. CONFIRM gates for 4F

| # | Question | Recommendation |
|---|---|---|
| 4F-1 | Email cadence: one batched daily email per recipient, nothing per-event from this layer? | Yes. Messages keep their existing immediate email (correspondence deserves it); everything else batches. Held, not hounded |
| 4F-2 | Where the inbox lives: inside /messages for the client, a /today card for the practice? | Yes. One calm reading surface per side where each side already looks; the five-item mobile tab cap holds; no new nav |
| 4F-3 | The launch emission set (the table in section 3), with later epics emitting as they land? | Yes. Wire what exists today; the chokepoint makes each future emission one line |
| 4F-4 | Prefs at launch: per-user email batched/off only, quiet hours deferred? | Yes. There is no real-time channel to quiet; a mute plus a daily batch covers the real need. Quiet hours arrive with whatever real-time channel ever justifies itself |
| 4F-5 | Reminder thresholds: due tomorrow once, then once at 3 days overdue, dedupe-keyed, nothing else? | Yes. Two touches per item maximum from the machine; past that, the gap is the consultant's coaching signal (4E reads it), not the robot's nag |

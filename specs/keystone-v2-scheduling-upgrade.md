# Spec: Keystone V2 4I, the scheduling upgrade (the real calendar, durations, the invite that reaches every calendar)

**Parent:** pilot harvest item 3 of 2026-07-11 (`CURRENT.md`). Remi's words: "I want the availability to come from my google calendar and i set up the boundaries, black out windows... then for my clients to be able to choose in a week which ones work for them, each client doing that, kinda like a doodle, and then I am able to see that and select the one that works for everyone and confirm it... it's created a Google Calendar invite that shows up on all of our calendars, with the zoom link from my zoom in there... they should be able to choose a 1, 1.5, or 2 hour session. I'll go with 1 hour sessions though, in general. Default."
**Grounded against:** Ring 2 as built (windows, the pure engine, booking with the exclusion constraint, Google OAuth and one-way push) and 3H as built (the date poll on both surfaces). The reference implementation is the quarry's `/meet` system in ambition-angels (`lib/availability.ts`, `lib/google/calendar.ts`, the `blackouts` table): read, adapted, never copied blind, because Keystone's client surface is pure RLS and cannot call Google, which the quarry never had to solve.
**Status:** SPECCED 2026-07-11. Remi's ask decides gates 4I-1 through 4I-3 in the ask itself; 4I-4 through 4I-6 carry recommendations and the build proceeds on them per Remi's "get going with it," open for reword.
**Date:** 2026-07-11

---

## 1. What 4I is

Three upgrades to scheduling the practice already owns, plus the poll growing into a week. Calendly's half: availability that tells the truth. Doodle's half: the team converges, the practice confirms. Then the part neither does alone: the confirmed session lands on every calendar with the Zoom link in it.

1. **Availability becomes real.** Offered slots are the weekly windows minus three kinds of busy: booked sessions (as today), blackout ranges the practice declares (vacation, a conference week), and the practice's REAL Google calendar, pulled as free/busy intervals and cached in-app. The practice also sets the boundaries: buffer around meetings, minimum notice, booking horizon.
2. **Durations become a choice.** Sixty, ninety, or one-twenty minutes, offered wherever a session is born (direct booking and polls), sixty the default. The engine already takes `slotMinutes`; the number stops being hardcoded.
3. **The booked session becomes a real invite.** The Google event gains attendees (the consultant plus every active member of the engagement's client team) and the practice's Zoom link as its location, with Google notifying everyone, so the session shows up on all calendars without Keystone building its own email.

The 3H poll keeps its shape (practice opens from its own offered slots, members mark with names, practice confirms) and gains the duration choice at creation, candidates that respect the real calendar, and a client card grouped by day so a week reads as a week.

No new scheduling product is being built; Ring 2 and 3H are being finished.

## 2. Schema (migration 0025)

```sql
create table scheduling_settings (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null unique references practices(id) on delete cascade,
  buffer_min int not null default 15 check (buffer_min between 0 and 120),
  lead_hours int not null default 24 check (lead_hours between 0 and 336),
  horizon_days int not null default 30 check (horizon_days between 1 and 60),
  duration_options int[] not null default '{60,90,120}',
  default_duration_min int not null default 60,
  video_link text,
  updated_at timestamptz not null default now()
);

create table scheduling_blackouts (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  reason text,
  created_at timestamptz not null default now()
);

create table calendar_busy (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete cascade,
  practice_member_id uuid not null references practice_members(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  synced_at timestamptz not null default now()
);
```

- **`scheduling_settings`: one row per practice, both sides read, practice writes.** The client booking page is pure RLS and must read the boundaries and duration options to offer honest slots, so read is the standard membership pair (`is_practice_member` or `is_client_member_of_practice`); insert and update through `engagement.write`; no delete (defaults are a reset, not a removal). The `video_link` is readable by client members; accepted, since the same link lands in every booked session's `location`, which they already read. Absent row means the engine defaults (the values above), so the feature works before the practice ever visits Settings.
- **`scheduling_blackouts`: practice reads, practice writes, the client never sees the rows.** Read via `is_practice_member` only; insert and delete via `engagement.write` (a blackout is operational, removing one is honest; no update, remove and re-add). Client sessions receive blackout time only as anonymous busy intervals through the bridge function, so "vacation" never reads as anything but unavailable (gate 4I-5).
- **`calendar_busy`: RLS on, ZERO policies, the `google_connections` precedent.** Written only by the service role during a pull; read by nobody directly. The rows are bare intervals already, but whose calendar produced them and when it was synced is the practice's business alone.
- **The bridge widens:** `keystone_busy_intervals(p_practice)` (SECURITY DEFINER, Ring 2) is re-created to union three sources into the same bare `(starts_at, ends_at)` shape: booked and held sessions (as today), `calendar_busy` rows, and `scheduling_blackouts` ranges. Same membership check on both sides of the wall, same future-only 60-day cap, still no ids, titles, or identities. One function stays the only way slot math crosses the wall.
- **`session_polls` needs nothing:** `slot_minutes` has waited since 0018 for exactly this.
- **Isolation matrix, same PR:** cross-practice walls on settings and blackouts; the client write wall on both; a client member reads settings but ZERO blackout rows; `calendar_busy` returns zero rows to every session including the practice owner; the bridge function returns intervals to members of both sides and nothing to a stranger; all three tables join the coverage ratchet; a static gate pins the shapes (`scheduling-upgrade-isolation.spec.ts`).

## 3. The engine and the pull

**The engine stays pure.** `computeSlots` gains `bufferMinutes`: each busy interval is padded on both sides before the collision test, so a 2:00 meeting with a 15 minute buffer kills the 1:00 slot that would end at 2:00 sharp. Slot length, lead time, horizon, and cap remain parameters; the DST discipline and unit tests extend to the buffer and to 90 and 120 minute slots (`e2e/scheduling-engine.spec.ts`).

**Assembly reads the settings.** `lib/slotAssembly.ts` fetches the practice's `scheduling_settings` row (defaults when absent), validates any requested duration against `duration_options`, and passes buffer, lead, horizon, and duration into the engine. Both surfaces keep riding this one assembler; blackouts and the real calendar arrive already folded into the busy list by the bridge function, so assembly grows no new query.

**The pull is the new half of sync.** `pullBusyForMember` (in `lib/calendarSync.ts`, inside the shared `syncMember` core, service-role-after-check like the push) calls Google's `freebusy.query` on the primary calendar for now through 60 days out, and replaces the member's `calendar_busy` rows with the result, stamping the connection's `busy_pulled_at`. It runs:

- inside the existing Settings **Sync now** action (push and pull become one honest button),
- after the OAuth callback completes (a fresh connection is immediately real),
- and on the new cron, `/api/calendar/refresh` (secret-gated like `/api/notify`, fails closed, vercel.json hourly), which pulls for every connected member and also pushes any booked session missing its `gcal_event_id`, the backstop for a lost trigger.

Sessions Keystone itself pushed to Google come back as busy in the pull; they overlap their own source rows exactly and the collision test does not care, so no dedupe is owed. A practice with no Google connection keeps working exactly as today: windows minus sessions minus blackouts.

**Staleness is bounded and stated.** The Settings card shows the last pull time in plain words. An event added to Google between pulls is invisible for at most an hour; the exclusion constraint still guarantees Keystone never double-books ITSELF, and the hourly pull plus the on-demand sync keep the window honest. Real-time free/busy on every page load would put Google on the client surface's critical path and is declined on purpose.

## 4. The invite

- **Attendees.** `insertEvent` and `patchEvent` gain an attendee list and `sendUpdates: all`. The list is the consultant (the connection's `google_email`) plus every active, non-revoked member of the engagement's client. Google sends the invite emails and the event lands on every calendar; Keystone builds no parallel email (the 4F `session_reminder` day-before touch is unchanged and unduplicated).
- **The Zoom link.** At booking, the session's `location` snapshots `scheduling_settings.video_link`; the event carries it as its location and in the description line. A settings change never rewrites history (gate 4I-1). No Zoom API in this epic: the personal room link is pasted once into Settings.
- **Push timing.** Practice-side births (poll confirm) push immediately, service-role-after-check as always. Client-side moves (direct booking, reschedule, cancel) stay pure RLS and cannot touch Google, so the server action fires one keepalive POST to the new internal route `/api/calendar/push` (outside both route groups, gated by an HMAC of the session id keyed off `KEYSTONE_TOKEN_SECRET`, rate-limited, body carries the session id only); the route verifies the session exists in a pushable state and pushes, patches, or removes that one event. The hourly cron is the backstop. A Google failure never fails the booking: the session is real in Keystone the moment the insert lands, and the sync degrades honestly (the Ring 2 contract).
- **Reschedule and cancel notify.** A patched event moves on every attendee's calendar; a deleted one leaves it, Google telling everyone both times.

## 5. Surfaces

**Practice Settings (the existing page grows two cards):**
- **Scheduling boundaries:** buffer, minimum notice, horizon, which durations are offered (sixty always on; ninety and one-twenty as toggles), the default duration, and the video link field with one line of help ("your personal meeting room link; it rides every invite"). One form, one save, audited as metadata.
- **Blackouts:** a date-range add (start, end, optional reason) and the list with remove. Ranges land as timestamptz spanning the practice zone's full days.
- The **Google Calendar card** states the last pull in plain words and the one Sync button now pushes and pulls.

**Client /sessions (390px first, as always):**
- **Book a session** gains a duration line above the day groups: the offered durations as links (the current one held), sixty preselected. Changing it recomputes the offered slots for that length; each slot form carries the duration and the booking action re-validates it against `duration_options` and the slot against a fresh `isOfferedSlot` at that duration, the exclusion constraint still the last word.
- **The poll card** groups candidates by day with the weekday leading, so a week of options reads as a week, and names the poll's duration ("90 minutes together"). Marking is unchanged: one tap, names show, retract while open.

**Practice engagement page:**
- **Pick a date together** gains the same duration line (a poll has ONE duration, gate 4I-6); candidates come from the upgraded engine, so nothing the real calendar forbids is ever offered. The tally and confirm are unchanged; confirm books at the poll's duration and the invite goes out with everyone on it.

## 6. What this reuses and hands forward

The pure engine, the one assembler, the bridge function, the exclusion constraint, the 3H poll, the encrypted connection store, the push half of sync, the 4F reminder, and the audit trail are all load-bearing and none are replaced. Hands forward: `calendar_busy` and the boundaries are exactly what a second consultant's calendar needs (per-member windows already exist), and the Zoom field is the seam where a Zoom API integration would land if per-meeting links are ever wanted.

## 7. AI

None.

## 8. The per-feature gate walk

- Three new scoped tables, every one carrying `practice_id`, membership RLS or deny-all, and their cross-practice, cross-client, client-write, and deny-all matrix cases in the same PR; the ratchet grows by three.
- New person-data: the practice's own calendar busy times, bare intervals only, behind a deny-all table and a minimal-disclosure function that was already the pattern; blackout reasons never cross the wall. No AI touches any of it.
- New routes: `/api/calendar/refresh` secret-gated and failing closed; `/api/calendar/push` HMAC-gated, rate-limited (`LIMITS.CALENDAR_PUSH`), acting on one session by id and pushing nothing the DB does not already hold. The client surface stays pure RLS; both routes live outside the client tree and the CI guard keeps proving it.
- Secrets: no new ones; the HMAC rides `KEYSTONE_TOKEN_SECRET`, the cron rides `CRON_SECRET`. No PII in logs, sync outcomes as counts.
- Copy voice-swept; durations described plainly ("90 minutes together"), boundaries stated as facts, staleness admitted in words.
- Mobile: the duration line and day-grouped poll card verified at 390px.

## 9. CONFIRM gates for 4I

| # | Question | Recommendation |
|---|---|---|
| 4I-1 | Video link source: Meet from the event, Zoom personal room, or the Zoom API? | DECIDED in the ask ("the zoom link from my zoom"): the personal room link, pasted once into Settings, snapshotted onto each session. This closes V1 CONFIRM 8. The Zoom API (unique per-meeting links, waiting rooms) is a later epic if the pilot wants it |
| 4I-2 | Who is on the invite? | DECIDED in the ask ("shows up on all of our calendars"): the consultant plus every active member of the engagement's client team, Google notifying all. Teammates see each other on the invite, which is the point of a team session |
| 4I-3 | Which durations, and the default? | DECIDED in the ask: 60, 90, 120 offered; 60 the default. Stored as settings so the offer can narrow without a migration |
| 4I-4 | Does the real Google calendar gate availability, and how fresh? | Yes, as cached free/busy: the client surface cannot call Google (pure RLS is the product's spine), so intervals are pulled on sync, on connect, and hourly by cron, with the last pull stated in Settings. Bounded staleness over a live dependency |
| 4I-5 | Do clients see blackouts? | Only as busy time through the bridge function, never as dated rows with reasons. "Unavailable" is the whole truth a client needs |
| 4I-6 | Who picks the duration? | The booker picks on direct booking (any offered duration); the practice picks at poll creation, one duration per poll, because candidates of mixed lengths make the tally incomparable |

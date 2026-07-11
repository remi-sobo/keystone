# The library generic sweep

Date: 2026-07-11. On Remi's ask, after the design question: is the library SafeSpace's or every client's?

## The answer the schema already gives

The library is practice-wide by design. `resources` carries `practice_id` only, no `client_id` (the documented exception in spec 5.1 and the per-feature gate), and its read policy admits every client member of the practice to the client-audience rows. The 4H knowledge base wall (migration 0029) splits client-visible from practice-only; it does not split client from client. So everything on the client shelf is, structurally, for every client SOBO ever signs.

The decision that followed: the library stays the practice's reusable IP, written generic for any nonprofit; anything client-specific belongs in that client's engagement record, which is walled. Per-client assignment (the deferred half of 3F) waits for a real second client; when it comes, the right shape is a `resource_assignments` join table, never a `client_id` column on `resources`, so one canonical resource can be assigned to N clients. The isolation test rides in the same PR per the gate.

## What the audit found

Twelve client-audience guides. The charter draft placeholder had already self-retired (deleted by `seed-charter-v1.sql` when the charter graduated to 2A). Three guides were already generic. Nine carried SafeSpace material. One row, the planned-deliverables ledger, is client-named on purpose (below).

The sweep is `supabase/seed-library-generic-sweep.sql`, layered after `seed-library-guides.sql` and `seed-library-additions.sql` per the additions precedent: the checked-in history of what was entered stays untouched; the new file replaces whole bodies by title.

## Resource by resource

| Resource | What was SafeSpace-specific | What changed | Where the detail lives (already) |
|---|---|---|---|
| Messaging angles | The whole body was SafeSpace's actual angle set: the client named, the Youth Action Board, "the peninsula's own kids," the grandparent and parent framings | Rewritten as the method for deriving your own three angles, with anonymous illustrations | Seed doc section 9 item 4; homework item 4 (the narrative-frame draft with messaging angles) produces it as engagement work product |
| Segmenting the base | Opened with SafeSpace's donor-base size ("About 1,200 contacts, most giving little or nothing"); youth-flavored examples | Generic opening; the giving-tree example generalized | The 1,200 figure: seed doc section 5 baseline table; the segmentation decision is decision 10 in the July 7 session note |
| How to run a fundraising meeting | "I would love to have you at Campus in March" (Campus is a SafeSpace program); "one young person" story line | Generic example event ("the spring showcase"); "one person your work serves" | Campus stays where it belongs, in SafeSpace's own record and collateral |
| Multi-year giving | "We have lived this one" pointed at SafeSpace's too-early ask (Susan's experience), reading as the practice's story while carrying a client's | "Plenty of organizations have lived this one" | Seed doc section 9 item 7 keeps the attributed version |
| Foundations versus individuals | "The story of one young person beats the annual report" | "The story of one person your work changed" | Illustration only; nothing to relocate |
| Making the ask | "$15,000 funds three young people through a full year" | "three people" | Illustration only |
| Why this number | Unit-math examples all youth-shaped ("one young person's year," "one young person's spring semester," "forty students," "by kid and by year") | "one person" phrasing throughout | Illustration only |
| AI in the daily workflow | The cause-words example was SafeSpace's own category list (youth development, mental health, mentorship, place-based, education equity) | The step teaches the widening move without the client's list | SafeSpace's category list is prospect-research working material for their engagement |
| Positive framing | "the kids served" | "the people served" | Illustration only |
| Donor journeys | Nothing | Unchanged | |
| The weekly fundraising rhythm | Nothing | Unchanged | |
| Questions that move the conversation | Nothing | Unchanged | |

## The one deliberately client-named row

**"Planned deliverables: the SafeSpace ledger"** stays. It is engagement material pinned in the library because planned deliverables still have no first-class home (the promised-deliverable queue source was deferred until promises have structure; 3D versions shipped artifacts, not plans). It is the only row in the shared catalog that names a client.

Standing note, extending the FLAG in CURRENT.md: acceptable while every client member who can read the catalog is SafeSpace or the practice's own people (the Ambition Angels demo members are Remi and Shannon). Before a real second client's members arrive, the ledger needs one of: a first-class planned-deliverables home, per-client assignment (the 3F deferral), or retirement into the engagement record. CONFIRM 3 (library access after the engagement ends) touches the same shelf and is still open.

## Applying to the live project

The sweep replaces whole bodies by title, so it would clobber any in-app edit made at `/library/authoring` since the additions were entered on 2026-07-10. Before applying, check `updated_at`:

```sql
select title, updated_at from resources
where practice_id = (select id from practices where slug = 'sobo')
order by updated_at desc;
```

If nothing moved past the seed dates, apply `supabase/seed-library-generic-sweep.sql` as is. If a row moved, carry its title's rewrite over by hand in `/library/authoring` instead. Fresh installs run the four library files in order: pilot, guides, additions, generic sweep.

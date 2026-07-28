-- Keystone seed: the Wild Wanderers engagement (client two of the SOBO
-- practice). Source of truth: docs/seed/keystone-wildwanderers-seed.md
-- (the July 27 founding call, the two founding documents, the June and
-- July email record, the calendar). Run ONCE against the real project;
-- idempotent throughout, safe to re-run.
--
-- What this does, per the seed doc:
--   1. Creates the client, Gabe's client-member row, and the
--      practice-side client profile.
--   2. Creates the engagement (no fee anywhere; FLAG) and the four
--      workstreams (names assembled from the founding documents; FLAG).
--   3. Enters the three sessions (June 18 first meeting, July 27
--      founding call with its note and raw transcript at practice
--      visibility, August 3 booked) and the founding decision log.
--   4. Seeds the outcomes, the homework starters, the readiness pillar
--      notes, and the planned-deliverables ledger.
--   5. Enters the two founding documents as shipped file deliverables;
--      the object bytes are uploaded separately (seed doc section 12).
--
-- FLAGS (also in the seed doc and CURRENT.md):
--   - No fee is named in any source; fee_display stays null.
--   - The four workstream titles are assembled, not quoted; the build
--     plan says "four workstreams" without naming them.

-- 1. Client, member, profile ------------------------------------------

with p as (select id from practices where slug = 'sobo')
insert into clients (practice_id, name)
select p.id, 'Wild Wanderers' from p
where not exists (
  select 1 from clients c, p where c.practice_id = p.id and c.name = 'Wild Wanderers'
);

with c as (select id, practice_id from clients where name = 'Wild Wanderers')
insert into client_members (client_id, practice_id, email)
select c.id, c.practice_id, 'brewha07@gmail.com' from c
where not exists (
  select 1 from client_members m, c
  where m.client_id = c.id and lower(m.email) = 'brewha07@gmail.com'
);

insert into client_profiles
  (client_id, practice_id, relationship_note, relationship_started_on, primary_contact_member_id)
select
  c.id,
  c.practice_id,
  'Wild Wanderers is a family business: Gabe Brewer coaching boys outdoors on the Baylands and adults across the peninsula, with Sarah holding operations and structure and the boys growing up in it. SOBO builds the technology (the Wild Wanderers app, site, and enrollment engine) and coaches the business. The engagement runs August to January toward the $20k gross month; the relationship opened with Gabe''s June 10 introduction email.',
  date '2026-06-10',
  (select m.id from client_members m
     where m.client_id = c.id and lower(m.email) = 'brewha07@gmail.com'
     limit 1)
from clients c
where c.name = 'Wild Wanderers'
on conflict (client_id) do nothing;

-- 2. Engagement and the four workstreams ------------------------------

with c as (select id, practice_id from clients where name = 'Wild Wanderers')
insert into engagements (practice_id, client_id, title, starts_on, ends_on, status)
select c.practice_id, c.id, 'The six-month build: August to January',
       date '2026-07-27', date '2027-01-31', 'active'
from c
where not exists (
  select 1 from engagements e, c where e.client_id = c.id
);

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Wild Wanderers') limit 1
)
insert into workstreams (engagement_id, practice_id, client_id, title, sort)
select e.id, e.practice_id, e.client_id, v.title, v.sort
from e, (values
  ('The pipeline', 0),
  ('The operation', 1),
  ('The money', 2),
  ('Protection and the family', 3)
) as v(title, sort)
where not exists (
  select 1 from workstreams w, e where w.engagement_id = e.id and w.title = v.title
);

-- 3. Sessions ----------------------------------------------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Wild Wanderers') limit 1
)
insert into sessions (engagement_id, practice_id, client_id, starts_at, ends_at, tz, location, kind, status, gcal_event_id)
select e.id, e.practice_id, e.client_id, v.starts_at, v.ends_at,
       'America/Los_Angeles', v.location, 'working', v.status, v.gcal
from e, (values
  ('2026-06-18 10:00-07'::timestamptz, '2026-06-18 10:45-07'::timestamptz,
   '380 Portage Ave, Palo Alto', 'held', 'k0iasbamhni6j9ht5npnalnueo'),
  ('2026-07-27 14:00-07'::timestamptz, '2026-07-27 15:00-07'::timestamptz,
   'Zoom, https://us06web.zoom.us/j/5320728761', 'held',
   'a3o35fm8navv628uotlscb83e4_20260727T210000Z'),
  ('2026-08-03 14:00-07'::timestamptz, '2026-08-03 15:00-07'::timestamptz,
   'Zoom, https://us06web.zoom.us/j/5320728761', 'booked',
   'a3o35fm8navv628uotlscb83e4_20260803T210000Z')
) as v(starts_at, ends_at, location, status, gcal)
where not exists (
  select 1 from sessions s where s.engagement_id = e.id
    and s.starts_at = v.starts_at
);

-- The June 18 note: shared, summary only, from the email record.
with s as (
  select s.id, s.engagement_id, s.practice_id, s.client_id from sessions s
  where s.starts_at::date = date '2026-06-18'
    and s.client_id = (select id from clients where name = 'Wild Wanderers')
  limit 1
)
insert into session_notes (session_id, engagement_id, practice_id, client_id, summary_md, visibility)
select s.id, s.engagement_id, s.practice_id, s.client_id,
$md$First working meeting, in person at 380 Portage. Gabe introduced the Wild Wanderers idea: the boys' outdoor program and the fitness practice under one brand. His nine written pieces (beliefs, curriculum, mission and vision, and the rest) followed by email on June 23 and became the site and philosophy material.$md$,
'shared'
from s
where not exists (select 1 from session_notes n where n.session_id = s.id);

-- The July 27 founding call: the note stays at practice visibility
-- because the raw transcript rides the row (seed doc section 11); the
-- shared record is the decision log below.
with s as (
  select s.id, s.engagement_id, s.practice_id, s.client_id from sessions s
  where s.starts_at::date = date '2026-07-27'
    and s.client_id = (select id from clients where name = 'Wild Wanderers')
  limit 1
)
insert into session_notes (session_id, engagement_id, practice_id, client_id, summary_md, decisions_md, raw_transcript, visibility)
select s.id, s.engagement_id, s.practice_id, s.client_id,
$md$The founding interview, Remi and Gabe, one hour on Zoom. The role shifted from builder to coach; the perfect Tuesday got defined in numbers (ten boys, seven-plus committed clients, the $20k gross month); the first job was named (pipeline, not program); the standing Monday 2pm rhythm was set; and the two founding documents were promised and delivered the same day. The decision log carries the shared record; the wall in the seed doc section 11 governs what stays practice-side.$md$,
$md$1. The role shifts from builder to coach: Remi-led scope and sequence, weekly accountability, Gabe free to take the lead as things come up.
2. Two streams, one brand, family owned: the boys' program and the fitness practice, both Wild Wanderers.
3. The finish line written down now: 10 boys, 7+ committed clients, 2 groups, a $20k gross month, Gabe on his own rhythm, by January.
4. $20k gross a month carries the family; today grosses about $8k; the build is a $12k bridge.
5. The first job is pipeline, not program: five real asks a week from week one.
6. The boys' program is the mission and it also pays: a paying baseline funds scholarship spots.
7. Premium boutique positioning: about ten paying relationships run the model; clients treated like family; retention over volume.
8. Two pricing fixes in month one: the 12-pack reprices near $1,650; the $250 group rate holds for launch.
9. Growth comes from adding groups; new clients pay raised rates, founding clients keep their price.
10. Launch mid-September with the boys we have.
11. Protection closes before the first family enrolls.
12. The standing rhythm: Mondays 2pm, Sunday week design, the monthly family meeting with the books open, the monthly close.
13. Business conversations get recorded and sent in, family ones included.
14. The scorecard is the truth, and it lives in the Wild Wanderers app.$md$,
$tr$Call with Gabe, July 27, 2026, 2pm Pacific, Zoom. Recorded by Remi ("You" is Remi).

You
I'll record um, I'll record the call here. It's no problem.

Gabe Brewer
Okay.

You
Um, okay, lovely. What's going on today? Whats on the docket for today?

Gabe Brewer
As far as as wild

You
Yeah,

Gabe Brewer
wanderers or

You
or just just work,

Gabe Brewer
just?

You
just anything.

Gabe Brewer
Uh, nothing much. Now I'm I'm clear from the

You
Oh

Gabe Brewer
day.

You
nice.

Gabe Brewer
Um, one of my, my clients, she, and she has an annual trip to the east coast, so this part of the day is open right now.

You
Oh,

Gabe Brewer
So

You
nice.

Gabe Brewer
mostly just it's it's

You
Oh,

Gabe Brewer
me and the boys.

You
nice. Okay, okay. Beautiful.

Gabe Brewer
Yeah.

You
Okay, all right. Well, let's hop into it, man. Um, I say, so, so a couple of things are, Um, changing. At least from my end, uh, you know, up to now, I've kind of seen myself just as a builder, right? Just essentially I build what you ask for, but, for the next 6 months, let's say we're hopping into a different thing where I'm coached, that means, I mean, and I have already done this, but it, but it's, it's markedly a different, different role where I'm pushing on what you're building. I'm asking questions. I'm holding you to what you tell me that you want, you know? Um,

Gabe Brewer
Okay.

You
And so it's a lot of, in a sense, accountability, and then a co-construction of the strategy in the plan, and obviously you may, you know, you make a plan and then you start doing it and that changes. And so it's like that process of just not feeling like you're doing it by yourself. Um, and somebody who has, uh, um, uh, who thinks my my gift is to think strategically and to put things into systems so that, you know, stuff can get done. And so that's the hope here as we tackle the kind of 2 businesses in the sense that you're, um, Well, 2 streams, 2 programs, I guess, that you'll be running.

Gabe Brewer
Yeah.

You
Um, Okay. The next 6 months as I see it right now, um, You already know how to coach adults. You, I wouldn't, correct me if I'm wrong, but I wouldn't call you some like expert at the boys program because you, I don't think you've done it before, right? But that,

Gabe Brewer
No, no, yeah, no, never done. well. Yeah. I mean, you know, I've coached and done like

You
Mm-hmm.

Gabe Brewer
enrichment with most with mostly boys, but never. Yeah, never in

You
Never

Gabe Brewer
this,

You
this context.

Gabe Brewer
in this

You
But

Gabe Brewer
realm.

You
this is,

Gabe Brewer
Yeah,

You
I

Gabe Brewer
no.

You
would imagine that running the program isn't the thing that's going to keep you up at night. Is that true? Okay,

Gabe Brewer
No.

You
training people isn't gonna like keep you up at night. You're

Gabe Brewer
No, no.

You
not like tripping about what you're going to do with me on Wednesday morning. Right,

Gabe Brewer
No, no, uh-huh.

You
all right. So that's not that's not

Gabe Brewer
Yeah,

You
what

Gabe Brewer
yeah.

You
we're going to be talking about per se. We're

Gabe Brewer
Okay.

You
gonna be trying to build you into the owner of these 2 businesses. Which essentially

Gabe Brewer
Yeah.

You
means enrolling, pricing, pipeline, what are the rhythms, backend rhythms of management, right? The parts that really like nobody can do for you right now? And so by

Gabe Brewer
Mhm.

You
month 6, this should look Markedly different. Right? And today, the

Gabe Brewer
Mhm.

You
goal to the point of today's conversation is to define exactly what that means. in numbers so that like, okay, 6 months from now, like, let's take this in 6 months. We could go, oh, 5 years, but like you just started. And so let's

Gabe Brewer
Yeah.

You
take it in 6 months, and then we can reevaluate

Gabe Brewer
Yep.

You
at 6 months, like what the 3 year vision is going to look like. Um,

Gabe Brewer
Okay, okay.

You
so I'm going to interview you. And then from the transcript, I'll build 2 kind of core documents. One is the dream. Right? What is this in? What do you want this to look like in one, three, 5 years? Right? Um, and

Gabe Brewer
Mhm.

You
then, uh, and that's for you and really it's for your wife as well, right? So that your family is knows what you're signing up for. Um, and

Gabe Brewer
Yeah.

You
so you can kind of, because you strike me as somebody who wants to live an integrated lifestyle. Is

Gabe Brewer
Mm-hmm.

You
that right? Right.

Gabe Brewer
Yes,

You
Like,

Gabe Brewer
yes.

You
like, you don't want to just go to work and come home and have you, like, you're trying to do it all together. So really this is a family endeavor and it has to make sense with

Gabe Brewer
Oh.

You
all of that as you plan it. Um, The 2nd one is the is the build plan, right? These next 6 months backwards from launching, you know, the fall session. Um, And so what kind of like build out what exactly needs to be built? So that it's up into the right, right? Like, How do you, um, build the foundation and the infrastructure so that you're either charging more or bringing more clients on until you are at that that vision of how you want your lifestyle to look. Right.

Gabe Brewer
In both,

You
Okay.

Gabe Brewer
okay.

You
Does that make sense? Okay,

Gabe Brewer
Yeah.

You
beautiful. All right, so here we go. Let's let's get it started. All right, 6 months from now. Um, and everything worked perfectly. Just like exactly as you wanted it to. And it's a Tuesday afternoon. Okay, you have programmed that day with the boys. How many boys do you have enrolled? How many fitness clients do you have? How much money came in that month? And what exactly did you do that day?

Gabe Brewer
Okay. In 6 months. I would, and we had program that day. I would want at least 10 boys.

You
Mm-hmm.

Gabe Brewer
And Um. Like fitness. I would hope to have 1010 new clients.

You
Uh-huh. So and

Gabe Brewer
Yeah.

You
so how many how many clients is that in total?

Gabe Brewer
Yeah, in addition to the clients I have

You
Yep.

Gabe Brewer
now,

You
And

Gabe Brewer
um, okay.

You
don't count me. Let's do paid clients.

Gabe Brewer
Okay, okay. So 16

You
Mhm.

Gabe Brewer
total.

You
Okay. 16. Nice. All one on one. Okay.

Gabe Brewer
Yes. Oh, one small group,

You
Okay,

Gabe Brewer
one small group.

You
one.

Gabe Brewer
And that, and that's a, that's a group

You
Okay.

Gabe Brewer
of three.

You
Lovely. Okay, dope. Um, and how much money came in that month?

Gabe Brewer
That all.

You
And we'll go, we'll go uh, gross.

Gabe Brewer
Okay. What? A lot. And this and this is just and this is gross. This is not I'm not thinking about

You
Not

Gabe Brewer
taxes or

You
thinking

Gabe Brewer
anything

You
about

Gabe Brewer
like

You
taxes,

Gabe Brewer
that.

You
not thinking about taxes right

Gabe Brewer
Okay.

You
now, yep.

Gabe Brewer
Okay.

You
Because eventually, we'll talk about this at a separate date, but like, uh,

Gabe Brewer
Mm-hmm.

You
the goal is we got to get, if you don't have now your LLC set up, such that you'll write off a lot of your taxes. And

Gabe Brewer
Okay,

You
and we'll

Gabe Brewer
okay.

You
we'll set up set up the very easy ways for you to do it because you're not making like crazy Buku bucks. Um, and so you could

Gabe Brewer
Mm-hmm.

You
ride off actually a lot. Like, yeah, you can we'll talk about that later, though. Yeah,

Gabe Brewer
Okay.

You
gross.

Gabe Brewer
I'd say for the month, at 20, 20 grand, including those, the

You
Okay.

Gabe Brewer
kids, yeah.

You
Okay. Okay, got it. And then, um, what did you do that day in your

Gabe Brewer
Oh.

You
perfect kind of Tuesday? Not money wise, just like what did the day look like?

Gabe Brewer
In in the day, as far as the workout clients

You
Workout

Gabe Brewer
and the boys.

You
clients, boys, your,

Gabe Brewer
Or

You
your, your kids,

Gabe Brewer
in.

You
your,

Gabe Brewer
Okay,

You
like, just

Gabe Brewer
okay.

You
what did the day, like, like, let's paint what a perfect day looks like. Yeah.

Gabe Brewer
Yeah. Okay. I'm up at 5.30 AM. I get my workout in at home. starting 6 and go to about 7. Like, you know, hopefully, and maybe the boys are awake by then. If they are, they're hanging out with me. Um, getting, then I will be getting set up to head out to the Baylands. Um, I'll bring my son with me. Um. I wanna get there. 8, which would be half hour before the day begins with the boys, which is 8.30. Um... All the boys get there. They're hopefully they're all on time. Um, and the 1st thing we do is a check in.

You
Mm-hmm.

Gabe Brewer
Um, and that and that tech would begin with, I'd give them a list of words and those words would typically describe an emotion that they were feeling.

You
Mhm.

Gabe Brewer
And that wouldn't require any explanation unless they wanted to talk about it right

You
Mm-hmm.

Gabe Brewer
away. But that, you know, that would be, you know.

You
Mm-hmm. Mm-hmm.

Gabe Brewer
5 to 10

You
Okay.

Gabe Brewer
meetings. And then

You
No, not that granular, not that granular. Yeah,

Gabe Brewer
Okay, okay,

You
but that's

Gabe Brewer
okay.

You
it's good. I love it. I love it, but bring me up one

Gabe Brewer
Okay.

You
step above. So, program lasts, uh, the program is 10 boys, it's a mixture of, um, SEL, and physical fitness, and exploration, and, you know,

Gabe Brewer
Yes.

You
whatever your program is, and that'll

Gabe Brewer
Okay, okay,

You
that'll

Gabe Brewer
okay.

You
evolve.

Gabe Brewer
Yeah.

You
it's a great day of program, basically. How

Gabe Brewer
Yes.

You
long is programmed? Do you know that?

Gabe Brewer
Yeah, I'm thinking. 3 to

You
Like

Gabe Brewer
4 hours.

You
3 hours, yeah, that makes sense.

Gabe Brewer
Yeah.

You
Okay.

Gabe Brewer
And then, yeah, once, uh, that, That day, the boys is over, um, I'd like to have, you know, there'd be an hour or so gap in between and then have, and then meet with, I try to say it's 3 to 4 clients, 2 to 3 clients after that.

You
Mm-hmm. And when you say, let me ask you this, when you say one small group of 3 folks, are you being Conservative and quote unquote realistic or is that actually a dream?

Gabe Brewer
Oh no, I love, I love the group.

You
So

Gabe Brewer
That's

You
what I what I

Gabe Brewer
realistic.

You
mean is if you have Um, 16 clients. Would you want everyone to be a group? Or do,

Gabe Brewer
The

You
and there's,

Gabe Brewer
16.

You
Or shoot, any, any number, would you like everything you do to be group or do you like the having some one on ones?

Gabe Brewer
I'm, I'm, I'm flexed. I want what they are most comfortable with.

You
Ah,

Gabe Brewer
What will get

You
okay.

Gabe Brewer
the best

You
Okay,

Gabe Brewer
out of them in

You
okay,

Gabe Brewer
that.

You
okay. Okay,

Gabe Brewer
Yeah.

You
okay, got it, got it. Okay, cool. All right, so okay, hour break, meet with 2 different clients after that. Okay.

Gabe Brewer
And then, um, I would like to have some sort of way to Communicator update parents with what their boys did that that

You
Okay.

Gabe Brewer
day. Sort of a, the, you know, Check in the

You
Yep.

Gabe Brewer
newsletter. Um, schedule for the next day. You know, I would I would like to have the schedule for the week available

You
Yeah.

Gabe Brewer
to them, but yeah, I would want to be able to,

You
So is

Gabe Brewer
to check

You
this

Gabe Brewer
in

You
program

Gabe Brewer
with

You
daily,

Gabe Brewer
them.

You
3 days a week, 2 days a week, one time a week. Three

Gabe Brewer
3 days a week.

You
days a week. Okay.

Gabe Brewer
Yes.

You
Okay. Lovely. And then, okay. And then after you're done with, when do you want to be done with work? Or do you care? Or is that a, is that a, is that a, is

Gabe Brewer
Well,

You
that a thought for me?

Gabe Brewer
I, I haven't, I haven't thought about it too much, but I do want, I don't want, you know, and I shouldn't, I don't want to work late into the night, into dinner time because again, I do want to, I won't have time to. I'm the chef at the house. I want to have time to cook

You
Yeah.

Gabe Brewer
and get everything ready

You
Okay.

Gabe Brewer
for everybody. Yeah, so I'm, you know, I don't know, 767.

You
Okay. Love it. All right, let me ask you this. How does your plan or thought about? How old are you, boys?

Gabe Brewer
So my oldest is almost 3 turns 3 in

You
Okay.

Gabe Brewer
August, and the youngest

You
Hold

Gabe Brewer
is 5

You
on.

Gabe Brewer
months.

You
Okay. And Who helps with them or is it just on you?

Gabe Brewer
Oh no, it's um, my my

You
Okay.

Gabe Brewer
parents. Yeah, they are the go to.

You
Oh nice. Okay, is that daily?

Gabe Brewer
Yeah.

You
Lovely.

Gabe Brewer
Yeah.

You
Okay, so when

Gabe Brewer
Yeah,

You
you're out,

Gabe Brewer
yeah.

You
you can, you can, of course, come and pick up, Kaisen, whatever you want. Okay.

Gabe Brewer
Yep.

You
Got it. Love it. All right, beautiful. All right, let's move on to your wife works at a company, right? Big company after, thank

Gabe Brewer
Yes.

You
you, Google or something? Okay,

Gabe Brewer
Google,

You
she's

Gabe Brewer
yes.

You
got Google. All right. Um, does she know about this plan of yours? And

Gabe Brewer
Yes.

You
how, what does she worry about?

Gabe Brewer
Um. You know what I have? I'd have to ask her,

You
Okay.

Gabe Brewer
but from what we, from what when we talk, she's not worried about much because she knows how much I want the boys a part of it. I think if there was a worry, she'd be worried about what were the boys doing.

You
Okay.

Gabe Brewer
And if I, but I, you know, the plan is to have them in the

You
Yeah.

Gabe Brewer
plan, a part of

You
Okay.

Gabe Brewer
everything. So that would be the worry. But other than that, now, not much knows that this is my passion and that I have experience with all this, I think maybe more of the word could be, what we're doing now,

You
Thank

Gabe Brewer
the

You
you.

Gabe Brewer
building, and if I'm, If that's going well.

You
Uh-huh. And

Gabe Brewer
Yeah.

You
what do you mean by going well? And I'm just, I'm just saying it's just so I know what would ease her mind, what she would need to see, right? Like how she thinks, because I don't know. I've never I think I've met her one time. I

Gabe Brewer
Yeah.

You
don't know how she, because you don't want, you want, you're already doing a very hard thing. Right? Entrepreneurship

Gabe Brewer
Yeah,

You
is

Gabe Brewer
yeah.

You
the hardest is one of the hardest things. So you

Gabe Brewer
Yeah.

You
really want the full support and confidence of your wife. And

Gabe Brewer
Mm-hmm.

You
in order to get that, you need to know what she worries about and ease those fears consistently.

Gabe Brewer
Yeah, yeah.

You
And that starts right now.

Gabe Brewer
Yeah. Yeah, so I think. Her, her knowing, what, where my heart is and what I'm trying to do, but then her seeing what you've built so far, I think, put her at

You
Okay.

Gabe Brewer
ease, seeing how it's growing. But then I think, you know, she she does, she works in in legal and in policy.

You
Yeah,

Gabe Brewer
So

You
nice.

Gabe Brewer
I think if she had a, a view, of how it's going to look organizationally in the parts where maybe I'm weaker at and she could see that,

You
Okay.

Gabe Brewer
it would, it would definitely put her

You
Nice,

Gabe Brewer
at ease. If I had something

You
okay.

Gabe Brewer
to

You
Okay.

Gabe Brewer
show her there.

You
Okay.

Gabe Brewer
Yeah.

You
Got it. So maybe something like program plan, uh,

Gabe Brewer
Yeah.

You
uh, legal plan, right?

Gabe Brewer
Yes.

You
Um, uh, insurance, All

Gabe Brewer
Mhm, mm-hmm.

You
of that stuff that's going to keep us from getting sued. Got

Gabe Brewer
Yes.

You
it. Okay. All right,

Gabe Brewer
That,

You
that's

Gabe Brewer
yeah,

You
good

Gabe Brewer
that

You
enough.

Gabe Brewer
would.

You
And then,

Gabe Brewer
Okay.

You
okay, so then it's being illegal. Am I just clear that she's more of like a logistics type of person? Uh-huh.

Gabe Brewer
Oh, yeah.

You
So she's not really a

Gabe Brewer
Yeah,

You
dreamer.

Gabe Brewer
operate,

You
She's

Gabe Brewer
like operations,

You
an operator. Oh,

Gabe Brewer
legit. Yeah.

You
good, good. It's good. That's a good balance. Um, love it.

Gabe Brewer
Yes.

You
Love, love it. And then, Okay, beautiful. That's what you would need to see. Okay. Um. That makes sense. especially bringing kids outside in nature on a, on a, you know, um, there's a lot that can go wrong. And

Gabe Brewer
Mm-hmm.

You
so you want to make sure

Gabe Brewer
Mm-hmm.

You
that you're covered. Um, that

Gabe Brewer
Yep.

You
parents are signing up and that's probably why one of the reasons why we really want to take our time with making sure everything's set before

Gabe Brewer
So,

You
you start

Gabe Brewer
Yep.

You
dealing with people's kids. Um,

Gabe Brewer
Yep Yep.

You
love it. Okay. All right, let's talk about the money, the kind of truth around money right now. Um,

Gabe Brewer
Mhm.

You
What's the number where This is your whole living and the family is good. Right? Um, Yeah, yeah. Basically, what are we trying to get you to? You said 20 K. Is that, is that, is that?

Gabe Brewer
About

You
Yes.

Gabe Brewer
a month? Yeah, yeah. That would be, yeah, that would be amazing.

You
And Let me ask you this, if you've ever had this conversation with your wife. Does she want to work?

Gabe Brewer
She would, you know, she. She says that she would. Would be okay not working, but I knowing her. She does, she loves to work and she does. She's very good at. So I, you know, I think. Yeah, in the perfect world. No, she could spend her time. You know, with the boys doing other things.

You
Um, but like, could she, could, could you imagine her working with you?

Gabe Brewer
Oh yeah. Oh

You
Is

Gabe Brewer
yeah, for sure.

You
that

Gabe Brewer
For

You
a dream?

Gabe Brewer
sure. Yes.

You
Okay. And how much would y'all need to bring in per month? Um, For that to be the reality.

Gabe Brewer
I mean, it would have to be... It would have to be over 200 K.

You
Mm-hmm, a year. Okay.

Gabe Brewer
Yeah, yeah.

You
So, so total. You would want to make 200,000. you would want to bring home 200,000. Uh-huh,

Gabe Brewer
Mm-hmm.

You
which, By the way, is only 16 K. per

Gabe Brewer
Uh-huh.

You
month. And

Gabe Brewer
Okay.

You
so you're saying if you brought in 20 K per month. Right? Um,

Gabe Brewer
Yeah.

You
You'd be at 240. And you're saying that could sustain y'all to a point where she doesn't work.

Gabe Brewer
Yeah.

You
And is that is that your goal? Is that your dream? Is that what you want?

Gabe Brewer
I, you know, I, I wouldn't say that, yeah, I don't know, I don't think I'd say that was my dream. Um. Uh. But yeah, yeah, I would I would want that. I wouldn't want that for her, us, for us. That would be, that would be ideal for our family. And in time spent together for sure.

You
Mm. Okay. Um. The reason I'm asking these clarifying questions is only because I don't know her, like, one of my friends, their wife wouldn't want to work with him.

Gabe Brewer
Oh, yeah,

You
Right?

Gabe Brewer
uh-huh.

You
Another one of

Gabe Brewer
Yeah.

You
my boys, he wouldn't want to work with his wife. Right? Um, for me, I will only want to work with my wife. Uh,

Gabe Brewer
Yeah.

You
it's just different. you know, everybody got different situations or whatever,

Gabe Brewer
Yeah.

You
relation- working relationships with their wife. And it has to go both ways. It has to be something both of y'all are like, man, if that can happen, If Wild Wanderers was bringing in 20 K a month. Yeah, the dream would be, what's your wife's name? Sarah?

Gabe Brewer
Sarah.

You
You

Gabe Brewer
Yes.

You
and Sarah running it together with your kids.

Gabe Brewer
Oh yeah.

You
So

Gabe Brewer
Yep.

You
I know that's yours. I'm just confirming right now. Thats her dream too. She would be she would say, bye-bye, Google.

Gabe Brewer
Yeah.

You
Okay.

Gabe Brewer
She

You
Wow.

Gabe Brewer
would.

You
All right,

Gabe Brewer
Mm-hmm.

You
dope. All right, fire. 20 K a month. All right, cool. Love it. Cool. Um, how far are you from that right now? How far are you from 20 K a month?

Gabe Brewer
That 12

You
Okay.

Gabe Brewer
12 grand away from

You
Okay,

Gabe Brewer
that.

You
okay, okay. Nice. Okay. Very doable. How do you feel about that? Do you feel like intimidated by making 12 more K? Meaning the work it takes? Does it feel like, 0 my god, how would I do that? don't know. Or does it feel like, oh, that's easy money? let's go get it.

Gabe Brewer
No,

You
Oh,

Gabe Brewer
let's let's go get it.

You
okay. Lovely. All right. Dope. Um, dope. All right, let's talk about the engine because it sounds to me like. You know, when we talk about The 2 streams of income, one being the Wild Wanderers program with the boys program, and the other being Wild Wanderers Fitness. It sounds to me, like, the boys program could be more of a missional thing, right? Rather than a money

Gabe Brewer
Mm-hmm.

You
making endeavor. But they're not mutually exclusive. Are you okay with

Gabe Brewer
Mm-hmm.

You
making moves for it to be still on mission, but to maximize Income, revenue.

Gabe Brewer
Of course, as long as it's still on

You
Okay,

Gabe Brewer
mission.

You
that

Gabe Brewer
Yeah.

You
means you're working with a certain clientele who can pay and not working as much with the clientele who can't. Are

Gabe Brewer
Mm-hmm.

You
you okay with that? Okay.

Gabe Brewer
Yeah. The, yeah, and and the, well, the goal would be to get to a point where I can make that that

You
And

Gabe Brewer
change. But

You
there are some.

Gabe Brewer
yeah, I'm

You
Yeah,

Gabe Brewer
a.

You
there are some scholarships that you provide, but

Gabe Brewer
Yeah.

You
you have a baseline

Gabe Brewer
Yeah.

You
paying clientele that opens up

Gabe Brewer
Yeah.

You
some space for some for some other clients. Okay,

Gabe Brewer
100%, yeah.

You
okay, gotcha, gotcha, gotcha. Um, Lovely. Well, that's uh, that's really good. That's really good to hear. Beautiful. Okay. Um, so, We talked this morning. We don't know exactly where the families and the clients are going to come where the families are going to come in from Wild Wanderer's boys program, right? We don't know that yet. Because

Gabe Brewer
Yeah.

You
we haven't done it. But where are your clients coming from on Wild Wanders fitness?

Gabe Brewer
Right right here? you know, where, you know? Meno Park, Palo Alto, Los

You
Is

Gabe Brewer
Altos.

You
it word of mouth? Are you are you marketing?

Gabe Brewer
. I would no, I would be, yeah, marketing, but word of mouth as well. I've, you know, being in this, this area and doing fitness for a while now, I do, I would be able to, to get that word out rather quickly.

You
Okay. Um,

Gabe Brewer
Yeah.

You
do you know? Five boys. That could be paying clients. Right now. Got

Gabe Brewer
No.

You
it. Do you know 5 adults who could be paying clients who your next 5 clients are if you if you pushed?

Gabe Brewer
No, then personally, no, no.

You
Okay, okay, okay. All right, so we're we're really generating leads. Um, we're really running the full sales engine from from the ground up. Okay.

Gabe Brewer
Yes.

You
Okay, okay. Love it. Okay. All right, so the 1st job is, uh, pipeline. Not program. Right? Like we want to,

Gabe Brewer
Mm-hmm.

You
we want to fill the pipeline and we want to figure out that engine. For how are we going to be, where are these people at? How do we get to them? How do we communicate with them? What message do we communicate with them and what's their process between 1st hearing about it and becoming a played client? We want them to be as frictionless as possible. Right.

Gabe Brewer
Okay, yeah.

You
Um, Good. Good. So you're running this program. You're running this business, which means you and I now are going to have to, become experts at every element of the business. Right?

Gabe Brewer
Yeah.

You
You're already an expert at the delivery itself. That the deliverable, but when it comes to like sourcing and sales and hopping on a sales call, um, and like, Closing. That's going

Gabe Brewer
Mm-hmm.

You
to be a whole thing

Gabe Brewer
Mm-hmm.

You
to work on. And this, um, now let's just take that in and of itself, marketing, same thing. Are you excited about all of the other things, you're going to have to do outside of the program, which you love.

Gabe Brewer
Yes, it's, it's more of an opportunity for me to grow. It's, you know, it's I have, I have to do

You
Yeah.

Gabe Brewer
it. And, It's, It's, it's what I'm passionate about so that. Knowing how to handle every process does make me feel excited and, and, no, I'm ready. I'm ready for that.

You
Okay. Okay, cool. Um. Okay, great. What do you believe is is, is the thing standing between you and that Tuesday that we had described?

Gabe Brewer
I know. Standing in the way. I just, maybe. Okay. Uh, I would say, Nothing really in the way, exactly. I think. What was in the way was me reaching out and teaming up with

You
Mm-hmm.

Gabe Brewer
you. I think that that process was what? You know, I didn't know or understand yet.

You
Okay.

Gabe Brewer
So I think right now it, nothing, you know, there's nothing really. Besides not having. You know, uh, the boys are knowing families yet or the new the new fitness clients.

You
Hello.

Gabe Brewer
Maybe that, that's the thing that's in the way right now, not having, having anything. It's really just the idea. It's just uh, The wild wanderers is there, but I don't have anything to to fill that yet. I guess that would be it.

You
Okay. Um, good, good. All right, let's get back to the math for a quick 2nd just so I have clear numbers to work with and we can kind of map it out.

Gabe Brewer
Okay.

You
Um, Boys tuition for Wild Wanderers for a year. Um, my thought is that we do this in a, kind of per month. Right?

Gabe Brewer
Okay,

You
Um,

Gabe Brewer
yeah.

You
So they pay per month. What would that tuition? Be? Or maybe

Gabe Brewer
So

You
we even

Gabe Brewer
I've,

You
do per

Gabe Brewer
I,

You
week, you know, in a sense, potentially, but what,

Gabe Brewer
Yeah,

You
yeah, what do you think?

Gabe Brewer
I was thinking, so like 20, it would be $20 an hour.

You
Mm-hmm.

Gabe Brewer
Um, again, it would be 3 days a week. Uh, 3 hours a day.

You
Okay. So for that, We're looking at. Um, About $78. I mean, $7,800. Let's call it $7,200 a month. Okay. So at $7800 a month. That leaves about 12 to 13 K for the fitness size for the fitness side. Okay.

Gabe Brewer
Mm-hmm.

You
So clients, how often are they working with you? I know it varies, but what's what's what's normal?

Gabe Brewer
2 to 3 times a week.

You
Okay. And how much do how much do you charge per session?

Gabe Brewer
So if it's just the one off, like, They just pay, they're not getting a package deal or it'd be 150

You
Okay.

Gabe Brewer
for the hour. Um, and then my package deal is, um, the 6 pack. Of the 12 pack for Or 2 grand.

You
Okay.

Gabe Brewer
And then it's...

You
And then if you have a group of 3 How much are you charging them each?

Gabe Brewer
So actually, I'm not, I'm not charging, it's a, it's just a flat. It's 250 for that

You
250

Gabe Brewer
group.

You
for the group, okay?

Gabe Brewer
Yeah, yeah.

You
Okay. Okay. Uh. Okay. Okay. One client. Is worth about. $1300 a month. Uh-huh. Okay. Okay, average client. Seven clients, clubs in there. All right. Okay. Okay, okay, okay, okay. Um. Okay, so I'm gonna map out. Um... I'm going to map out some options for you. financially,

Gabe Brewer
Okay.

You
how you should think about this, and I really think given the fact that you're essentially selling a little higher ticket items, right, with this one-to-one coaching? Because the reality

Gabe Brewer
Mm-hmm.

You
is that To get 20 K gross a month? You just need one boy's cohort. And about 7 committed, 2 to 3 times a week clients. So

Gabe Brewer
Yeah.

You
it's actually like, so that means one client is a really big deal. Right?

Gabe Brewer
Yeah, yeah.

You
Which means

Gabe Brewer
Mhm,

You
you can,

Gabe Brewer
mhm.

You
you should consider your clients, Like family.

Gabe Brewer
Oh

You
You

Gabe Brewer
yeah, yep.

You
should go above and beyond for your clients, and we will with this, with this, because you really only need about 10. Right?

Gabe Brewer
Mm-hmm.

You
So that means these

Gabe Brewer
Mm-hmm.

You
should be folks that send their Christmas card to you. you're just a part of their life. Right?

Gabe Brewer
Yeah, yep.

You
Um, And

Gabe Brewer
100%. Yep.

You
that's what we're going to, what we're going to try to build in the, in the Wild Wanderers fitness, the app is over deliver. Valued.

Gabe Brewer
Mm-hmm.

You
You

Gabe Brewer
Mm-hmm.

You
know? Um. So that's a good mindset to know you're not you're not running around with 50,000 different clients. Like you just have, you are capitalizing on the fact that folks here have a lot of money. And are paying for convenience. A high quality workout. according to what they think a high quality workout is, you know, and what they want and

Gabe Brewer
Yeah, yeah,

You
uh,

Gabe Brewer
yeah.

You
wellness coaching. to really, for you to really like provide them. Testing, you know, yeah, we can, we can, we can get all into like just building out what it means to be in wild wanderers fitness. Um,

Gabe Brewer
Mm-hmm.

You
You know, like we should get like a shirt, a really nice shirt, design it, and every one of your clients get a welcome package type situation. You know what I mean? Like it's, you are treating

Gabe Brewer
Yep, Yep.

You
them like equinox at their house.

Gabe Brewer
Yes.

You
Okay.

Gabe Brewer
Uh-huh.

You
Okay, we'll get, you know, yeah, yeah, we'll get a whole. get a whole situation, because essentially this is premium boutique service. For folks who can pay for it.

Gabe Brewer
Yes.

You
publicly. Okay. All right, that's good to know. Um, Yeah, like you're, the big thing you're trying to get is like retention. Right? Once

Gabe Brewer
Yeah.

You
you get somebody you want them to stay with you. Commitment is more important than volume. Um, because that's

Gabe Brewer
Yes.

You
that's monthly recurring revenue. Uh-huh. Oh, okay, this is very, very doable. Is your wife into training?

Gabe Brewer
Oh yeah. Oh yeah, she

You
Could

Gabe Brewer
loves it.

You
she train?

Gabe Brewer
Yeah, she could. She uh, she was a, a blackmail karate instructor as a kid. So yeah, she's she's all about it.

You
Bro. Okay,

Gabe Brewer
I know.

You
all right. Well, shoot, that's good. All right, um, this is all really good stuff to know. Um... And then in terms of the pack, the only problem with the pack right now at how you priced it, it actually makes each session more expensive. So I'm going to do some, just changing up on that just to, if

Gabe Brewer
Okay.

You
you want to make it a deal. Like, let's, let's, uh, let's work that out and then, and then let's look at that group rate. That's good. Um, That's great. Um. And then I'm thinking about also just like. Just the full brands, you know, like I really want to lean in. I think the Wild Wanderers is is... is a great brand. The reason why is because This is just me talking, my marketing brain talking. That

Gabe Brewer
Mm-hmm.

You
basically, the reason why we train, is so that we can use our bodies. in the real world very well. Right? That's

Gabe Brewer
Yeah.

You
why

Gabe Brewer
Yes.

You
we don't train for training sake. We train so

Gabe Brewer
No,

You
that

Gabe Brewer
no.

You
you can take that beautiful hike. Right?

Gabe Brewer
Yes, and you

You
And

Gabe Brewer
can enjoy it.

You
it's

Gabe Brewer
It's not a struggle.

You
not a

Gabe Brewer
Yeah.

You
struggle, right? It's so that you can do blah, blah, blah, blah. That's why we train. And so it's

Gabe Brewer
Yeah.

You
highly functional movement. Um,

Gabe Brewer
Yes.

You
so that your body can do everything it was made to do at peakability.

Gabe Brewer
Yes.

You
Um, so that you can enjoy this beautiful earth we live in. Um,

Gabe Brewer
Yeah, 100%.

You
Okay, so that being the case, then like, it's like homework. Every week is to get them out. It's like almost like you're challenging them. No, you need to get out. In

Gabe Brewer
Yep. Yep

You
the same way I'm

Gabe Brewer
Yep.

You
saying, oh no, you need to blow blah. Like, no, you need to track it. And then when we 1st meet, I'm like, hey, tell me about your time spent outdoors wandering. Oh,

Gabe Brewer
Yep.

You
I took a walk this week. Lovely, beautiful. Boom, boom. Hey, do you know about this trail, this trail, this trail, and then you give them trails. and then you're giving them things, you know, you're giving them options and stuff. Their lifestyle should feel more active. under your and outdoorsy. under

Gabe Brewer
Yes.

You
your coaching. Okay.

Gabe Brewer
Yep.

You
Um,

Gabe Brewer
That

You
and

Gabe Brewer
is

You
then we

Gabe Brewer
a

You
eat so

Gabe Brewer
goal.

You
that we, our bodies can use the energy, boom, boom. Okay, got it, got it, got it. Okay, I'm just, that's good. That's just messaging. that needs to be really clear on the website as well, by the way. Um, Because

Gabe Brewer
Okay.

You
I think that that actually really resonates, I think, with this crowd that you'd be getting. Um,

Gabe Brewer
Yeah.

You
Okay, beautiful. And then let me ask you this from a coaching perspective. Um, actually, no, no, no, no. let me go back. A couple more things and then and then we'll be done. Um. 3 to 5 years. We kind of talked about what it would look like in a year, right? But 3 to 5 years, what I'm hearing is, It's at a point now, like, are you, would you think about a 2nd cohort of boys? Okay.

Gabe Brewer
Mm-hmm.

You
Second

Gabe Brewer
Mm-hmm.

You
cohort of boys would probably mean that you, somebody's leading that 2nd cohort probably, maybe? Okay,

Gabe Brewer
Yeah, yeah.

You
um, maybe you have a 2nd coach in Wild Wanders fitness? Maybe

Gabe Brewer
Mm-hmm.

You
the 1st one is your wife. Right?

Gabe Brewer
Yeah.

You
Um, Do would do you ever cap your fitness clients or would you raise prices instead? to increase revenue Because it's time, you know?

Gabe Brewer
Yeah. Um, for, for, for new clients, I would, yeah, I would raise the prices, but I would not on the.

You
Okay.

Gabe Brewer
Yeah, yeah. Hmm. Yeah. No, you know what? I don't know. I haven't been talking about that.

You
Yeah, well, you probably want more groups, larger groups.

Gabe Brewer
Yeah, maybe not add, um, one on ones,

You
Uh-huh.

Gabe Brewer
but add, continue to add

You
Continue

Gabe Brewer
groups.

You
that groups, yeah, because it would

Gabe Brewer
Yeah,

You
be great if

Gabe Brewer
yeah.

You
you can get it to where, uh, you know. You got groups that are bringing in $700 a session.

Gabe Brewer
Yeah,

You
Right?

Gabe Brewer
yeah, mhm.

You
And you and your wife are killing that. Okay. Got it, gotta, got it. Um. Great. Okay, last thing for you as a, I mean, and and, and, you know, you were an athlete. So I imagine that you don't mind being coached. Right? But let's say, you're off. of your plan in week 9 or something like that, you know? What do you want from me? What do you want me? How do you want me to interact with you?

Gabe Brewer
Um, kind of the, you know, the same way. I would

You
Mhm.

Gabe Brewer
with you or with a, with um, a client, a fitness

You
Mm-hmm.

Gabe Brewer
client. Uh, Yeah. You know, whatever those, those check-ins would be and, um, Yeah, um... It wouldn't necessarily, it wouldn't be like a, A test or, you know, um, Maybe being there to let me know what the, those next moves when things do start to,

You
Mm-hmm.

Gabe Brewer
increase or, you know, improve. How do I? how do I increase my. My bandwidth at that point.

You
Okay.

Gabe Brewer
What, yeah, what, yeah, what would be my next move?

You
Mm-hmm. Do you

Gabe Brewer
Um,

You
struggle with um,

Gabe Brewer
yeah.

You
with working hard?

Gabe Brewer
No.

You
You're a hard worker.

Gabe Brewer
Yeah.

You
Okay. Um, do

Gabe Brewer
Yeah.

You
you struggle with, what do you struggle with?

Gabe Brewer
Um... Um Um. Be, maybe being, you know, working in the fitness industry that I do and with the age of people that I do, I would say I've struggled with, Not my them being. Authentic. And me still. Um. Maybe caring for them like we were talking about as family.

You
Mm.

Gabe Brewer
Like when I, when I don't feel that they're being authentic with me, I, I do tend to lose that fire.

You
Hmm.

Gabe Brewer
You know, it, it, it, it begins to just be. almost the same workout. You know, there's no. I lose the, the, the drive to push them, and I think, yeah, I think, I'd say that would, that would be kind of where, when it starts to teeter off a little bit.

You
Mm-hmm. Okay.

Gabe Brewer
And I think that's also, I'm, pursuing this with, with boys, you know, I, I don't, that's kind of impossible,

You
I

Gabe Brewer
and

You
mean.

Gabe Brewer
at least in my opinion, boys aren't, aren't, you know, damaged in the way

You
Mm.

Gabe Brewer
a lot of adults

You
Mm-hmm.

Gabe Brewer
are, you know, it's, it gives me, And it's kind of in a selfish way, the opportunity to always be authentic.

You
Mm-hmm.

Gabe Brewer
And I think that's kind of where I I can run into trouble.

You
Nice. Okay. Got it. Okay, good to know. Um. All right, beautiful. All right. Let's do this then. Let's get a day and a time as our standing meeting. Would you prefer a

Gabe Brewer
Okay.

You
Monday so that the clan is clear for the week or a Friday because it's lighter on Fridays? Like, how do you, Wednesday, midweek? Check in.

Gabe Brewer
No, I love I love getting it in on

You
Mondays.

Gabe Brewer
Mondays.

You
Okay.

Gabe Brewer
Yeah.

You
Um, so how is 2 PM on Mondays? It's

Gabe Brewer
Perfect.

You
perfect. Okay, so let's go in

Gabe Brewer
Yep.

You
here. Let me go ahead and. Repeat this weekly. Okay. Okay. Um, great. And then um, what? would you need? What do you need to see from me by next session, knowing that I'm going to present to you 2 documents. One, um, and these will be formalized, and, you know, if we're not signing them, these aren't like contracts to sign. This is more so uh, founding documents. Right? Branded even documents for you. Um. What would you, uh, the, the, the plan and and then like the, what we need to, what we need to do in the next 6 months in order for that reality to be more likely. Outside of that, what do you need? What would you want to see from me by next session?

Gabe Brewer
Mhm. You know, I couldn't, you know, I don't know. I'm not

You
Okay.

Gabe Brewer
sure.

You
So

Gabe Brewer
Um,

You
do,

Gabe Brewer
yeah.

You
would you, would you like this? Um. Process to be more Remi-Led or Gabe-Led, in the sense, Remi-Led means we map out scope and sequence. We come in, we focus on a specific area. I give you the homework, you do it, so that you're, again, you're not having to think about what to do and having to do it, or do you want more just like kind of support and guidance is another way to think of it.

Gabe Brewer
No, I, I think, I think I would, I would benefit more from you

You
Okay.

Gabe Brewer
leading, and, and, but then as long as I can, If things pop

You
Yeah.

Gabe Brewer
up, I can take

You
Yeah,

Gabe Brewer
the lead, whatever, you know?

You
yeah, yeah, yeah, of course, it's

Gabe Brewer
Yeah.

You
it's your thing, but okay. All right, gotcha.

Gabe Brewer
Yeah.

You
Um, okay. All right. This is all good to know. So then expect, um, Within the next couple of days, that document. And what I would want you to do is go over those documents with your wife. Um,

Gabe Brewer
Okay. Yeah.

You
as much as you can nowadays. Voice record, your conversations. Just

Gabe Brewer
Okay,

You
whenever you're

Gabe Brewer
okay,

You
talking about business,

Gabe Brewer
yeah.

You
just put the recorder on and capture it. Because

Gabe Brewer
Yeah.

You
there's, um, there's so much gold in that and what we want to do as we build out the AI that supports your business. Every bit of like conversation makes it that much more gapes. So anything

Gabe Brewer
Okay,

You
you can send

Gabe Brewer
uh-huh.

You
me. So when you meet with her and you're, you know, call it a shoot family business meeting, like this is your family's business. Like the

Gabe Brewer
Yep.

You
boys will inherit this. Your wife will help build this and the goal is that y'all do this as a crew together. You

Gabe Brewer
Mm-hmm.

You
know what I mean? That literally by the time, Kai

Gabe Brewer
Yep.

You
is eight, nine. He's running

Gabe Brewer
Yeah.

You
trainings for other kids.

Gabe Brewer
That's

You
You

Gabe Brewer
that's true. Yep.

You
know what I mean? So if

Gabe Brewer
Mhm,

You
that's the case, like

Gabe Brewer
yep.

You
now we're, it's an empire and he has a little YouTube channel that has kids all over the world watching his workouts and stuff. You know, like, anyway, there's so much, there's so many ways you to go

Gabe Brewer
Mhm.

You
with this if y'all center in on one brand as a family and just become it, embody it. Um, for it just to be you, it's just harder, you know? And for her to have her

Gabe Brewer
Yeah.

You
job and come home tired and she don't know what's going on with you. She don't have the energy. It just, it's not as, it's not as good. My wife and I, by the way, Kendra and I are literally like we are, we had this conversation this morning. You know, like we are trying hard to move there. Um, and it takes time. But to have

Gabe Brewer
Yeah.

You
that vision means, okay, now it's, now it's clean. So share that with her, document it, send it to me so I can kind of get a sense of what all her and just let her know like you're sending this to me. Um, Because I, I, I do want like, to fully understand, what she even could bring to the table to, so that we can build that

Gabe Brewer
Mm-hmm.

You
into the vision. You

Gabe Brewer
Yep.

You
know what I mean? Um, so that

Gabe Brewer
Yeah.

You
she's really excited about it and could support however much, you know, bandwidth she has right now, which is limited with a job and 2 kids. So that

Gabe Brewer
Mm-hmm.

You
means it's on you to get the money there. Period.

Gabe Brewer
Yep, yep.

You
Yep. Okay. Fire, bro. All right, this is exciting. How do you feel?

Gabe Brewer
Yeah.

You
That's

Gabe Brewer
I feel really good.

You
good. Yeah, this is going to be this

Gabe Brewer
Yeah.

You
is going to be good. send you those documents and then we'll go from there, all right? All

Gabe Brewer
I love it. Okay.

You
right, but what? Talk soon.

Gabe Brewer
All

You
Alright,

Gabe Brewer
right.

You
peace.

Gabe Brewer
Please do.$tr$,
'practice'
from s
where not exists (select 1 from session_notes n where n.session_id = s.id);

-- 4. The founding decision log (V2 2B rows) ---------------------------

with e as (
  select e.id, e.practice_id, e.client_id from engagements e
  join clients c on c.id = e.client_id and c.name = 'Wild Wanderers'
  limit 1
),
s as (
  select s.id from sessions s, e
  where s.engagement_id = e.id and s.starts_at::date = date '2026-07-27'
  limit 1
),
ws as (
  select w.title, w.id from workstreams w, e where w.engagement_id = e.id
),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null
  limit 1
)
insert into decisions (engagement_id, practice_id, client_id, session_id, workstream_id,
  decided_on, title, context_md, decided_by_label, created_by)
select e.id, e.practice_id, e.client_id, (select id from s),
  (select id from ws where title = v.ws),
  date '2026-07-27', v.title, v.context, v.who, (select user_id from remi)
from e, (values
  ('The role shifts from builder to coach: six months of accountability and co-built strategy, Remi-led scope and sequence, Gabe free to take the lead as things come up.',
   'Call, Jul 27; the commitment section of the business plan.', 'Remi and Gabe', null),
  ('Two streams, one brand, family owned: the boys'' outdoor program on the Baylands and the premium fitness practice, both under Wild Wanderers.',
   'Call, Jul 27; business plan.', 'Gabe', null),
  ('The finish line is written down now: 10 boys, 7+ committed clients, 2 groups, a $20k gross month, Gabe on his own rhythm, by January.',
   'Call, Jul 27, the perfect-Tuesday interview; six-month build page 6.', 'Remi and Gabe', null),
  ('$20k gross a month is the number where the business carries the family; today grosses about $8k, so the build is a $12k bridge.',
   'Call, Jul 27; business plan page 4.', 'Gabe', 'The money'),
  ('The first job is pipeline, not program: the full sales engine gets built from the ground up, five real asks a week from week one.',
   'Call, Jul 27 (no five families and no five clients can be named today); six-month build.', 'Remi and Gabe', 'The pipeline'),
  ('The boys'' program is the mission and it also pays: a paying baseline funds scholarship spots, on mission always.',
   'Call, Jul 27.', 'Gabe', 'The operation'),
  ('Premium boutique positioning: about ten paying relationships run the whole model, clients treated like family, retention over volume.',
   'Call, Jul 27; business plan. Commitment is monthly recurring revenue.', 'Remi and Gabe', 'The operation'),
  ('Two pricing fixes in month one: the 12-pack at $2,000 reprices near $1,650, and the $250 group rate holds for launch and rises as groups fill.',
   'Call, Jul 27 (the pack as priced charges a premium for commitment); business plan page 4.', 'Remi', 'The money'),
  ('Growth comes from adding groups, not stacking one-on-ones; new clients pay raised rates, founding clients keep their price.',
   'Call, Jul 27; business plan year three.', 'Gabe and Remi', 'The money'),
  ('Launch mid-September with the boys we have: six on the trail beats zero and a full waitlist; the cohort fills while the program runs.',
   'Six-month build, month two.', 'Remi and Gabe', 'The pipeline'),
  ('Protection closes before the first family enrolls: LLC confirmed, insurance rated for outdoor youth work, waivers signed before day one, CPR current.',
   'Call, Jul 27; the business plan protection plan. The structure is what the family reviews.', 'Remi and Gabe', 'Protection and the family'),
  ('The standing rhythm: Mondays 2pm with Remi, Sunday week design, the monthly family business meeting with the books open, the monthly close.',
   'Call, Jul 27 (Monday chosen so the plan is clear for the week); six-month build page 2.', 'Gabe', null),
  ('Business conversations get recorded and sent in, family ones included: the record improves the plan and feeds the AI that supports the business.',
   'Call, Jul 27.', 'Remi and Gabe', null),
  ('The scorecard is the truth: if it is not on the scorecard, it did not happen. It lives in the Wild Wanderers app, business side, built in month one.',
   'Six-month build page 2.', 'Remi', 'The operation')
) as v(title, context, who, ws)
where not exists (
  select 1 from decisions d, e where d.engagement_id = e.id and d.title = v.title
);

-- 5. Outcomes (V2 2C rows) --------------------------------------------

with e as (
  select e.id, e.practice_id, e.client_id from engagements e
  join clients c on c.id = e.client_id and c.name = 'Wild Wanderers'
  limit 1
),
ws as (
  select w.title, w.id from workstreams w, e where w.engagement_id = e.id
),
remi as (
  select user_id from practice_members
  where lower(email) = 'remi@ambitionangels.org' and user_id is not null
  limit 1
)
insert into outcomes (engagement_id, practice_id, client_id, workstream_id,
  title, baseline_md, target_md, sort, created_by)
select e.id, e.practice_id, e.client_id,
  (select id from ws where title = v.ws),
  v.title, v.baseline, v.target, v.sort, (select user_id from remi)
from e, (values
  ('Fall cohort full: ten boys enrolled',
   'No families enrolled; no five names on the list today',
   '10 boys, three mornings a week; 80 percent plus re-enrolled for spring',
   0, 'The pipeline'),
  ('Seven or more committed fitness clients',
   'The practice grosses about $8k a month today; the next five clients cannot yet be named',
   '7+ committed clients at two to three sessions a week',
   1, 'The pipeline'),
  ('Two groups running',
   'One group offer at the $250 flat launch rate',
   'Two groups running; growth by groups, founding clients keep their price',
   2, 'The operation'),
  ('A $20k gross month',
   'About $8k gross a month; the bridge is $12k',
   '$20k hit, or within reach with a named path, at the January checkpoint',
   3, 'The money'),
  ('The protection layer closed',
   'LLC, insurance, and CPR to confirm; waivers not yet drafted',
   'Every layer closed or standing rule: entity and books, insurance, waivers and consent, safety and readiness, scope of practice',
   4, 'Protection and the family'),
  ('Gabe running his own rhythm, unprompted',
   'The rhythm starts this week: the first Monday 2pm call held Jul 27',
   'Sunday design, Monday scorecard, monthly close, without prompting; coaching steps down to advisor rhythm if the checkpoint passes',
   5, null)
) as v(title, baseline, target, sort, ws)
where not exists (
  select 1 from outcomes o, e where o.engagement_id = e.id and o.title = v.title
);

-- 6. Homework starters (the call and the founding-documents email) ----

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Wild Wanderers') limit 1
),
ws as (
  select w.title, w.id from workstreams w, e where w.engagement_id = e.id
),
gabe as (
  select id from client_members
  where client_id = (select client_id from e)
    and lower(email) = 'brewha07@gmail.com'
  limit 1
)
insert into action_items (engagement_id, practice_id, client_id, workstream_id,
  title, assigned_client_member_id, due_on, timing, source)
select e.id, e.practice_id, e.client_id,
       (select id from ws where title = v.ws),
       v.title, (select id from gabe), v.due_on, v.timing, 'manual'
from e, (values
  ('Read the two founding documents with Sarah, together, not a summary: the business plan and the six-month build',
   'Protection and the family', date '2026-08-03', 'before_session'),
  ('Record the conversation with Sarah about the founding documents and send it to Remi',
   'Protection and the family', date '2026-08-03', 'before_session'),
  ('Review the two pricing fixes and the month-one targets; come Monday ready to say yes or push back',
   'The money', date '2026-08-03', 'before_session'),
  ('Five real asks a week, every week, from week one: a real person, a real offer, a real price, out loud',
   'The pipeline', null, 'standing'),
  ('The reading list in order: The E-Myth Revisited first, then start $100M Offers',
   null, null, 'standing'),
  ('Confirm LLC, insurance, and CPR status; close or schedule every protection item',
   'Protection and the family', null, 'standing'),
  ('Sunday, 30 minutes: design the week. Sessions, asks, admin, family, on the calendar before Monday',
   null, null, 'standing'),
  ('Record business conversations, family ones included, and send them in',
   null, null, 'standing')
) as v(title, ws, due_on, timing)
where not exists (
  select 1 from action_items a, e where a.engagement_id = e.id and a.title = v.title
);

-- 7. Readiness marker notes -------------------------------------------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Wild Wanderers') limit 1
)
insert into readiness_markers (engagement_id, practice_id, client_id, pillar, note_md)
select e.id, e.practice_id, e.client_id, v.pillar, v.note
from e, (values
  ('philosophy',
   'Does Gabe think like the owner, not the technician? On Remi. The E-Myth shift; prices said without flinching; one client is worth $1,300 a month and gets treated like family; the boys'' program stays on mission while a paying baseline funds scholarship spots.'),
  ('system',
   'Is there a system a professional operator would respect? On Remi. The scorecard with the two funnels and the bridge tracker; Profit First accounts opened as written; the protection layer closed; the enrollment flow live end to end.'),
  ('execution',
   'Is he running it, week to week? On Gabe, and the one thing no one can do for him. Evidence is history: five asks a week logged, Sunday design done, Monday sessions held, the monthly close faced.')
) as v(pillar, note)
on conflict (engagement_id, pillar) do nothing;

-- 8. Planned deliverables (the SOBO BUILDS columns, by month) ---------

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Wild Wanderers') limit 1
),
ws as (
  select w.title, w.id from workstreams w, e where w.engagement_id = e.id
)
insert into deliverables
  (engagement_id, practice_id, client_id, workstream_id, title, status,
   kind, delivered_on, expected_note)
select e.id, e.practice_id, e.client_id,
       (select id from ws where title = v.ws),
       v.title, 'planned', null, null, v.expected
from e, (values
  ('Scorecard v1 in the Wild Wanderers app: the Families and Clients funnels and the bridge tracker',
   'The operation', 'month one, app milestone'),
  ('Waiver and enrollment packet, drafted for professional review',
   'Protection and the family', 'month one'),
  ('Enrollment flow live end to end: inquiry, conversation, waiver, payment',
   'The pipeline', 'month two, app milestone'),
  ('Parent update rhythm in the app: the after-session note',
   'The operation', 'month two, app milestone'),
  ('Trailhead Library feeding the pipeline weekly',
   'The pipeline', 'month two, app milestone'),
  ('Profit First views in the app, money side',
   'The money', 'month three, app milestone'),
  ('Client welcome package: the shirt, the letter, the standard',
   'The operation', 'month three'),
  ('Assessment system live for client onboarding',
   'The operation', 'month three, app milestone'),
  ('Referral tracking in the funnels',
   'The pipeline', 'month four, app milestone'),
  ('Retention flags on the scorecard: at-risk clients surfaced weekly',
   'The operation', 'month four, app milestone'),
  ('Coach accountability card: clients see Gabe''s week',
   'The operation', 'month four, app milestone'),
  ('Holiday plan set before Thanksgiving: schedule, billing, communication',
   'The money', 'month four'),
  ('Spring enrollment flow, one click from the fall version',
   'The pipeline', 'month five, app milestone'),
  ('Year-one tax package prep: clean books export for the accountant',
   'The money', 'month five'),
  ('The six-month review document: every number, plan versus actual, honest',
   'The money', 'month six')
) as v(title, ws, expected)
where not exists (
  select 1 from deliverables d, e
  where d.engagement_id = e.id and d.title = v.title
);

-- 9. The two founding documents, shipped July 27 ----------------------
-- File deliverables on the record, tied to the founding call. The
-- storage paths follow the 0006 convention
-- (deliverables/<practice_id>/<client_id>/...); the object bytes are
-- uploaded through a temporary token-guarded edge function so the
-- service role key never leaves Supabase (seed doc section 12).

with e as (
  select id, practice_id, client_id from engagements
  where client_id = (select id from clients where name = 'Wild Wanderers') limit 1
),
s as (
  select s.id from sessions s, e
  where s.engagement_id = e.id and s.starts_at::date = date '2026-07-27'
  limit 1
)
insert into deliverables
  (engagement_id, practice_id, client_id, session_id, title, status, kind,
   storage_path, delivered_on, about_md)
select e.id, e.practice_id, e.client_id, (select id from s),
       v.title, 'shipped', 'file',
       e.practice_id || '/' || e.client_id || '/' || e.id || '/founding/' || v.file,
       date '2026-07-27', v.about
from e, (values
  ('The Business Plan: vision, numbers, next moves (founding document, V1)',
   'WildWanderers_Business_Plan.pdf',
   'The founding document for the whole family: the vision, the one-three-five, the real numbers, the protection plan, and what this takes from everybody. The one to read with Sarah.'),
  ('The Six-Month Build: August to January (founding document, V1)',
   'WildWanderers_SixMonth_Build.pdf',
   'August to January, month by month: targets, the skills Gabe builds, what SOBO builds, and how we know each month worked. Page 2 is the weekly operating system; page 6 is the definition of markedly different, so January has a scoreboard.')
) as v(title, file, about)
where not exists (
  select 1 from deliverables d, e
  where d.engagement_id = e.id and d.title = v.title
);

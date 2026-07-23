// The Session 2 wrap, staged before the session and fired once tonight:
//
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/wrap-session-2.ts
//
// Three moves, all idempotent, so a nervous double-run changes nothing:
//   a. Seeds the three Session 2 homework items as action_items on the
//      booked Session 2 row, the Session 1 seed's exact model: group
//      audiences route as per-person assignment rows (all lands on
//      Susan, Aris, and Jasmine; founders on Susan; coachees on Aris
//      and Jasmine), real members only, copy verbatim from Remi's
//      session prompt.
//   b. Closes Session 1 homework: appends the covered line to each
//      body once, and moves open rows to done. A status someone
//      already moved is left alone, the prework-close rule.
//   c. Prints the wrap report: what landed, and per-person completion
//      across both sessions.
//
// The booked Session 2 row resolves through the roadmap the way the
// Session 1 seed did: engagement_sessions S2 points at its booked twin
// via scheduled_at = sessions.starts_at (the 0038 contract). If either
// row is absent the seed inserts nothing and says so.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mvuycjxainskaylvupji.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard, Project Settings, API).");
  process.exit(1);
}

const db: SupabaseClient = createClient(URL, SERVICE, { auth: { persistSession: false } });

const SUSAN = "susan@safespace.org";
const ARIS = "aris@safespace.org";
const JASMINE = "jasmine@safespace.org";

const COVERED_LINE = "Covered. Thank you. This week's homework is on Session 2.";

// Copy verbatim from the session prompt. Audience groups route as
// per-person assignment rows, the standing convention.
const SESSION2_HOMEWORK = [
  {
    title: "Finish the sort",
    assignees: [SUSAN, ARIS, JASMINE],
    body: `Take today's board, flagship, core, supporting, release, and finish it together. For every program you keep, write the one outcome you believe it creates. Rough sentences are exactly right. This is Tuesday's raw material: the three-year program plan gets built from this list.`,
  },
  {
    title: "The financials and grants package for Shannon",
    assignees: [SUSAN],
    body: `Two things in one package, and fifteen minutes with the bookkeeper covers most of it:
1. The financials: the last two years of actuals and the current budget.
2. The grant status list: every grant, active or completed, with the county's exact status and end date. Send it straight to Remi. Shannon builds the three-year budget from this next week, and she can't build it without knowing which revenue is real.`,
  },
  {
    title: "Pitch practice, rep three",
    assignees: [ARIS, JASMINE],
    body: `Five minutes, the two of you, before Tuesday. Same question: what does SafeSpace do, and why does it matter? Rep two happened in session today. The fear gets bored before you do.`,
  },
] as const;

type Scope = { engagementId: string; practiceId: string; clientId: string };

async function resolveScope(): Promise<Scope> {
  const { data: client, error: cErr } = await db
    .from("clients")
    .select("id, practice_id")
    .eq("name", "SafeSpace")
    .maybeSingle();
  if (cErr || !client) throw new Error(`SafeSpace client not found: ${cErr?.message}`);

  const { data: engagement, error: eErr } = await db
    .from("engagements")
    .select("id")
    .eq("client_id", client.id)
    .limit(1)
    .maybeSingle();
  if (eErr || !engagement) throw new Error(`SafeSpace engagement not found: ${eErr?.message}`);

  return { engagementId: engagement.id, practiceId: client.practice_id, clientId: client.id };
}

// The 0038 contract: the roadmap row's scheduled_at names its booked twin.
async function bookedSessionFor(code: string, scope: Scope): Promise<string | null> {
  const { data: roadmap } = await db
    .from("engagement_sessions")
    .select("scheduled_at")
    .eq("engagement_id", scope.engagementId)
    .eq("code", code)
    .maybeSingle();
  if (!roadmap?.scheduled_at) return null;

  const { data: session } = await db
    .from("sessions")
    .select("id")
    .eq("engagement_id", scope.engagementId)
    .eq("starts_at", roadmap.scheduled_at)
    .neq("status", "canceled")
    .limit(1)
    .maybeSingle();
  return session?.id ?? null;
}

async function memberByEmail(scope: Scope, email: string): Promise<{ id: string } | null> {
  const { data } = await db
    .from("client_members")
    .select("id")
    .eq("client_id", scope.clientId)
    .is("revoked_at", null)
    .ilike("email", email)
    .maybeSingle();
  return data ?? null;
}

async function seedSession2Homework(scope: Scope, s2SessionId: string | null): Promise<void> {
  console.log("── a. Session 2 homework ─────────────────────────────────");
  if (!s2SessionId) {
    console.log("SKIP  no booked Session 2 row resolved; nothing seeded.");
    return;
  }
  for (const item of SESSION2_HOMEWORK) {
    for (const email of item.assignees) {
      const member = await memberByEmail(scope, email);
      if (!member) {
        console.log(`SKIP  ${item.title} for ${email}: no active member row`);
        continue;
      }
      const { data: existing } = await db
        .from("action_items")
        .select("id")
        .eq("engagement_id", scope.engagementId)
        .eq("assigned_client_member_id", member.id)
        .eq("title", item.title)
        .maybeSingle();
      if (existing) {
        console.log(`KEPT  ${item.title} for ${email} (already seeded)`);
        continue;
      }
      const { error } = await db.from("action_items").insert({
        engagement_id: scope.engagementId,
        practice_id: scope.practiceId,
        client_id: scope.clientId,
        session_id: s2SessionId,
        title: item.title,
        body_md: item.body,
        assigned_client_member_id: member.id,
        timing: "after_session",
        audience: "client",
        source: "manual",
        status: "open",
      });
      if (error) throw new Error(`seed failed for ${item.title} / ${email}: ${error.message}`);
      console.log(`ADDED ${item.title} for ${email}`);
    }
  }
}

async function closeSession1Homework(scope: Scope, s1SessionId: string | null): Promise<void> {
  console.log("\n── b. Session 1 homework closed ──────────────────────────");
  if (!s1SessionId) {
    console.log("SKIP  no booked Session 1 row resolved; nothing closed.");
    return;
  }
  const { data: items, error } = await db
    .from("action_items")
    .select("id, title, body_md, status, assigned_client_member_id")
    .eq("engagement_id", scope.engagementId)
    .eq("session_id", s1SessionId)
    .eq("timing", "after_session");
  if (error) throw new Error(`Session 1 homework read failed: ${error.message}`);

  for (const item of items ?? []) {
    const patch: Record<string, unknown> = {};
    if (!String(item.body_md ?? "").includes(COVERED_LINE)) {
      patch.body_md = `${item.body_md}\n\n${COVERED_LINE}`;
    }
    // Only an untouched open row moves; a status someone already moved
    // stands as they left it.
    if (item.status === "open") patch.status = "done";

    if (Object.keys(patch).length === 0) {
      console.log(`KEPT  ${item.title} (already closed)`);
      continue;
    }
    const { error: updErr } = await db.from("action_items").update(patch).eq("id", item.id);
    if (updErr) throw new Error(`close failed for ${item.title}: ${updErr.message}`);
    console.log(`CLOSED ${item.title}${patch.status ? "" : " (line appended, status left as moved)"}`);
  }
}

async function wrapReport(scope: Scope, s1: string | null, s2: string | null): Promise<void> {
  console.log("\n── c. Wrap report ────────────────────────────────────────");
  for (const [label, sessionId] of [
    ["Session 1", s1],
    ["Session 2", s2],
  ] as const) {
    console.log(`\n${label} homework:`);
    if (!sessionId) {
      console.log("  (no booked session resolved)");
      continue;
    }
    const { data: items } = await db
      .from("action_items")
      .select("title, status, assigned_client_member_id, client_members(email)")
      .eq("engagement_id", scope.engagementId)
      .eq("session_id", sessionId)
      .eq("timing", "after_session")
      .order("title");
    for (const row of items ?? []) {
      const email =
        (row as { client_members?: { email?: string } | null }).client_members?.email ?? "?";
      console.log(`  ${String(row.status).padEnd(6)} ${row.title} :: ${email}`);
    }
  }
}

async function main(): Promise<void> {
  const scope = await resolveScope();
  const [s1, s2] = await Promise.all([
    bookedSessionFor("S1", scope),
    bookedSessionFor("S2", scope),
  ]);
  await seedSession2Homework(scope, s2);
  await closeSession1Homework(scope, s1);
  await wrapReport(scope, s1, s2);
  console.log("\nDone. Safe to re-run; a second pass changes nothing.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

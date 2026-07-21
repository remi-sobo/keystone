// Teardown for the throwaway test tenant (the weekend runbook, part D).
//
// Deletes EXACTLY what scripts/seed-test-tenant.sql created, and nothing
// else:
//   - the zzz-test-practice row, whose on-delete cascades take every
//     client, engagement, phase, canary session, and membership row
//     under it (every scoped table references practices on delete
//     cascade; that is the schema's own law)
//   - the remisobo+*@gmail.com auth users (the two client logins, the
//     operator, and any user the invite round-trip created)
//
// Dry run is the DEFAULT and prints what would be deleted; nothing is
// touched until you pass --execute:
//
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/teardown-test.ts            # dry run
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/teardown-test.ts --execute  # delete
//
// Three guards, each fatal:
//   1. the practice found under slug zzz-test-practice must carry the
//      zzz-test name prefix (never delete a practice without the marker)
//   2. auth deletion only touches emails matching remisobo+<tag>@gmail.com
//   3. the real SOBO practice id is recomputed after deletion and must
//      still exist, with its clients intact

import { createClient } from "@supabase/supabase-js";

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mvuycjxainskaylvupji.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_SLUG = "zzz-test-practice";
const TEST_EMAIL = /^remisobo\+[a-z0-9]+@gmail\.com$/i;

async function main() {
  if (!SERVICE) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard, Project Settings, API).");
    process.exit(2);
  }
  const execute = process.argv.includes("--execute");
  const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

  const { data: practice, error: pErr } = await db
    .from("practices")
    .select("id, name, slug")
    .eq("slug", TEST_SLUG)
    .maybeSingle();
  if (pErr) throw new Error(`practices lookup: ${pErr.message}`);

  if (practice && !String(practice.name).startsWith("zzz-test")) {
    console.error(
      `REFUSING: practice under slug ${TEST_SLUG} is named "${practice.name}" (no zzz-test marker).`
    );
    process.exit(1);
  }

  console.log(`== Dry-run count: what ${execute ? "WILL" : "would"} be deleted`);
  const cascadeTables = [
    "clients",
    "engagements",
    "engagement_phases",
    "engagement_sessions",
    "client_members",
    "practice_members",
  ];
  if (practice) {
    console.log(`practices: 1 (${practice.name}, ${practice.id})`);
    for (const table of cascadeTables) {
      const { count, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("practice_id", practice.id);
      if (error) throw new Error(`${table} count: ${error.message}`);
      console.log(`${table} (via cascade): ${count ?? 0}`);
    }
  } else {
    console.log("practices: 0 (zzz-test-practice not found; already torn down?)");
  }

  const { data: users, error: uErr } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (uErr) throw new Error(`listUsers: ${uErr.message}`);
  const testUsers = users.users.filter((u) => u.email && TEST_EMAIL.test(u.email));
  console.log(
    `auth users: ${testUsers.length} [${testUsers.map((u) => u.email).join(", ") || "none"}]`
  );

  if (!execute) {
    console.log("\nDry run only. Re-run with --execute to delete the rows above.");
    return;
  }

  console.log("\n== Deleting");
  if (practice) {
    const { error } = await db.from("practices").delete().eq("id", practice.id);
    if (error) throw new Error(`practice delete: ${error.message}`);
    console.log(`deleted practice ${practice.id} (cascade took everything under it)`);
  }
  for (const u of testUsers) {
    const { error } = await db.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`deleteUser ${u.email}: ${error.message}`);
    console.log(`deleted auth user ${u.email}`);
  }

  console.log("\n== Verifying the real tenant is untouched");
  const { data: sobo, error: sErr } = await db
    .from("practices")
    .select("id, name, clients(name)")
    .eq("slug", "sobo")
    .maybeSingle();
  if (sErr) throw new Error(`verify: ${sErr.message}`);
  if (!sobo) {
    console.error("ALARM: the sobo practice did not come back from the verify read. Investigate NOW.");
    process.exit(1);
  }
  const clientNames = ((sobo.clients as { name: string }[] | null) ?? [])
    .map((c) => c.name)
    .sort()
    .join(", ");
  console.log(`sobo practice intact: ${sobo.name} (clients: ${clientNames})`);

  const { count: leftover } = await db
    .from("practices")
    .select("id", { count: "exact", head: true })
    .eq("slug", TEST_SLUG);
  console.log(
    (leftover ?? 0) === 0
      ? "zzz-test-practice gone. Teardown complete."
      : "ALARM: zzz-test-practice still present after delete."
  );
}

main().catch((err) => {
  console.error("teardown failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});

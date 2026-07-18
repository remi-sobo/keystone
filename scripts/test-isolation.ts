// The live cross-tenant isolation test (the weekend runbook, part B).
//
// Signs in as each throwaway test user through the NORMAL anon-key
// client (exactly the client the browser uses; nothing here can see
// more than a real session can) and asserts the two-level wall:
//   - each client user sees only their own engagement and canary row
//   - explicit probes for the other test tenant AND the real SafeSpace
//     engagement return zero rows (the canaries prove a zero means RLS
//     blocked it, not that the table was empty)
//   - anon sees nothing at all
//   - the TestPractice operator sees both test clients but zero SOBO rows
//
// Fixtures come from scripts/seed-test-tenant.sql; teardown is
// scripts/teardown-test.ts. Passwords ride env, never this file:
//
//   TESTCO_PASSWORD=... DEMOORG_PASSWORD=... [TESTADMIN_PASSWORD=...] \
//     npx tsx scripts/test-isolation.ts
//
// Exits nonzero on any FAIL. The one check a script cannot run is the
// real SOBO operator's reverse view (nobody holds Remi's password);
// that is verified structurally instead: visibility is derived purely
// from membership rows, and no SOBO user carries a membership in the
// test practice. The teardown dry-run shows the same fact.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mvuycjxainskaylvupji.supabase.co";
// The anon key is the public browser key (vercel.json); RLS is the wall.
const ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12dXljanhhaW5za2F5bHZ1cGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1Mzk4NjIsImV4cCI6MjA5OTExNTg2Mn0.zcefwDuX_k3DfccGYvmMEmmINzvSI2TcSMBpcfYqg_E";

const SAFESPACE_ENGAGEMENT = "Systems and leaders: fundraising first";
const SAFESPACE_CLIENT = "SafeSpace";

let failures = 0;
function report(ok: boolean, label: string, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

function fresh(): SupabaseClient {
  return createClient(URL, ANON, { auth: { persistSession: false } });
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const db = fresh();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return db;
}

type Row = Record<string, unknown>;
type Query = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;
async function rows(
  db: SupabaseClient,
  table: string,
  filter: (q: Query) => Query
): Promise<Row[]> {
  const { data, error } = await filter(db.from(table).select("*"));
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as Row[];
}

async function clientUserChecks(
  who: string,
  db: SupabaseClient,
  own: { engagement: string; canaryPrefix: string },
  other: { engagement: string; canaryPrefix: string }
) {
  const engagements = await rows(db, "engagements", (q) => q);
  report(
    engagements.length === 1 && engagements[0].title === own.engagement,
    `${who}: sees exactly 1 engagement and it is ${own.engagement}`,
    `saw ${engagements.length}: ${engagements.map((e) => e.title).join(", ") || "none"}`
  );

  const canaries = await rows(db, "engagement_sessions", (q) =>
    q.like("title", "CANARY-%")
  );
  const titles = canaries.map((c) => String(c.title));
  report(
    canaries.length === 1 && titles[0].startsWith(own.canaryPrefix),
    `${who}: CANARY-%% query returns only the own canary`,
    `saw [${titles.join(", ") || "none"}]`
  );

  const otherEng = await rows(db, "engagements", (q) => q.eq("title", other.engagement));
  report(
    otherEng.length === 0,
    `${who}: explicit query for ${other.engagement} returns zero rows`,
    `saw ${otherEng.length}`
  );

  const otherCanary = await rows(db, "engagement_sessions", (q) =>
    q.like("title", `${other.canaryPrefix}%`)
  );
  report(
    otherCanary.length === 0,
    `${who}: explicit query for the ${other.canaryPrefix}* canary returns zero rows`,
    `saw ${otherCanary.length}`
  );

  const safespace = await rows(db, "engagements", (q) =>
    q.eq("title", SAFESPACE_ENGAGEMENT)
  );
  report(
    safespace.length === 0,
    `${who}: explicit query for the real SafeSpace engagement returns zero rows`,
    `saw ${safespace.length}`
  );

  await db.auth.signOut();
}

async function main() {
  const testcoPw = process.env.TESTCO_PASSWORD;
  const demoorgPw = process.env.DEMOORG_PASSWORD;
  const adminPw = process.env.TESTADMIN_PASSWORD;
  if (!testcoPw || !demoorgPw) {
    console.error("Set TESTCO_PASSWORD and DEMOORG_PASSWORD (TESTADMIN_PASSWORD optional).");
    process.exit(2);
  }

  const testco = { engagement: "TestCo Build", canaryPrefix: "CANARY-TESTCO" };
  const demoorg = { engagement: "DemoOrg Build", canaryPrefix: "CANARY-DEMOORG" };

  console.log("== As remisobo+testco (client member of TestCo)");
  await clientUserChecks(
    "testco",
    await signIn("remisobo+testco@gmail.com", testcoPw),
    testco,
    demoorg
  );

  console.log("== As remisobo+demoorg (client member of DemoOrg)");
  await clientUserChecks(
    "demoorg",
    await signIn("remisobo+demoorg@gmail.com", demoorgPw),
    demoorg,
    testco
  );

  console.log("== With no auth at all (anon)");
  {
    const db = fresh();
    const probes: [string, string, (q: Query) => Query][] = [
      ["anon: engagements", "engagements", (q) => q],
      ["anon: CANARY-%% sessions", "engagement_sessions", (q) => q.like("title", "CANARY-%")],
      ["anon: SafeSpace engagement probe", "engagements", (q) => q.eq("title", SAFESPACE_ENGAGEMENT)],
      ["anon: clients", "clients", (q) => q],
    ];
    for (const [label, table, filter] of probes) {
      const got = await rows(db, table, filter);
      report(got.length === 0, `${label} returns zero rows`, `saw ${got.length}`);
    }
  }

  if (adminPw) {
    console.log("== As remisobo+testadmin (owner of TestPractice)");
    const db = await signIn("remisobo+testadmin@gmail.com", adminPw);

    const clients = await rows(db, "clients", (q) => q.order("name"));
    const names = clients.map((c) => String(c.name));
    report(
      names.length === 2 && names.includes("TestCo") && names.includes("DemoOrg"),
      "testadmin: sees exactly TestCo and DemoOrg",
      `saw [${names.join(", ") || "none"}]`
    );

    const soboClients = await rows(db, "clients", (q) => q.eq("name", SAFESPACE_CLIENT));
    report(
      soboClients.length === 0,
      "testadmin: explicit query for the real SafeSpace client returns zero rows",
      `saw ${soboClients.length}`
    );

    const soboEng = await rows(db, "engagements", (q) => q.eq("title", SAFESPACE_ENGAGEMENT));
    report(
      soboEng.length === 0,
      "testadmin: explicit query for the real SafeSpace engagement returns zero rows",
      `saw ${soboEng.length}`
    );

    const canaries = await rows(db, "engagement_sessions", (q) => q.like("title", "CANARY-%"));
    report(
      canaries.length === 2,
      "testadmin: sees both canaries (own practice, both clients)",
      `saw ${canaries.length}`
    );
    await db.auth.signOut();
  } else {
    console.log("== testadmin checks skipped (TESTADMIN_PASSWORD not set)");
  }

  console.log(
    failures === 0
      ? "\nALL CHECKS PASS: the wall held on every line."
      : `\n${failures} CHECK(S) FAILED: stop here, this is a live cross-tenant hole.`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FAIL (script error):", err instanceof Error ? err.message : err);
  process.exit(1);
});

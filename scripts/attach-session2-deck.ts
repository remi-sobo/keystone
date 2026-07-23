// Attach the Session 2 teaching deck to the SafeSpace engagement as two
// client-visible documents (the 0011 engagement-documents store), the
// CONFIRM-1 mechanism for Session 2 day: the native slide presenter
// (0039, Session 1's mechanism) holds slide rows behind the done wall,
// so files meant to open DURING the session ride the document store
// with visible_to_client on.
//
// Reads both files from docs/decks/, uploads them to the private
// engagement-documents bucket at a deterministic path (practice, client,
// engagement, then a fixed session-2-deck segment, so a re-run upserts
// in place and never duplicates), then guards one document row per
// title. Idempotent end to end.
//
//   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/attach-session2-deck.ts
//
// Client members open the files from their own login through the pure
// RLS route /documents/<id>/file (the script prints both URLs). The
// practice-side twin lives on the engagement page routes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://mvuycjxainskaylvupji.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE) {
  console.error("Set SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard, Project Settings, API).");
  process.exit(1);
}

const db = createClient(URL, SERVICE, { auth: { persistSession: false } });

const DECK_DIR = join(__dirname, "..", "docs", "decks");
const FILES = [
  {
    file: "SafeSpace_Session02_Teaching.html",
    title: "Session 2 slides",
    mime: "text/html; charset=utf-8",
  },
  {
    file: "SafeSpace_Session02_Teaching.pdf",
    title: "Session 2 slides (PDF)",
    mime: "application/pdf",
  },
] as const;

async function main(): Promise<void> {
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

  for (const f of FILES) {
    const bytes = readFileSync(join(DECK_DIR, f.file));
    const path = `${client.practice_id}/${client.id}/${engagement.id}/session-2-deck/${f.file}`;

    const { error: upErr } = await db.storage
      .from("engagement-documents")
      .upload(path, bytes, { contentType: f.mime, upsert: true });
    if (upErr) throw new Error(`upload failed for ${f.file}: ${upErr.message}`);

    const { data: existing, error: exErr } = await db
      .from("engagement_documents")
      .select("id, storage_path, visible_to_client")
      .eq("engagement_id", engagement.id)
      .eq("title", f.title)
      .maybeSingle();
    if (exErr) throw new Error(`row lookup failed for ${f.title}: ${exErr.message}`);

    let id = existing?.id as string | undefined;
    if (!existing) {
      const { data: created, error: insErr } = await db
        .from("engagement_documents")
        .insert({
          engagement_id: engagement.id,
          practice_id: client.practice_id,
          client_id: client.id,
          doc_type: "session_deck",
          title: f.title,
          status: "uploaded",
          storage_path: path,
          file_name: f.file,
          file_size: bytes.length,
          mime_type: f.mime,
          visible_to_client: true,
        })
        .select("id")
        .single();
      if (insErr) throw new Error(`insert failed for ${f.title}: ${insErr.message}`);
      id = created.id;
    } else if (existing.storage_path !== path || !existing.visible_to_client) {
      const { error: updErr } = await db
        .from("engagement_documents")
        .update({ storage_path: path, visible_to_client: true, file_size: bytes.length })
        .eq("id", existing.id);
      if (updErr) throw new Error(`update failed for ${f.title}: ${updErr.message}`);
    }

    console.log(`OK    ${f.title}`);
    console.log(`      ${bytes.length} bytes at ${path}`);
    console.log(`      client view:  /documents/${id}/file?view=1`);
    console.log(`      client save:  /documents/${id}/file`);
  }

  console.log("\nDone. Both documents are client-visible now; re-runs upsert in place.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

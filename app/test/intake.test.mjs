/**
 * PUBLIC family-intake RLS test (ROADMAP M1).
 *
 * Exercises the exact anon-scoped path the /intake submit action uses against the
 * LIVE project, and PROVES the negative RLS boundaries, then removes every
 * artifact with the service-role key so nothing is left behind.
 *
 * Uses the ANON (publishable) key — the same key the public form runs under — so
 * these checks reflect real anon RLS (0002_rls.sql + 0003_storage.sql):
 *   (a) upload a tiny file to case-docs/intake/__test__/…          → expect OK
 *   (b) insert an intake_submissions row {status:'new', case_id:null} → expect OK
 *   (c) anon insert with status='imported' (or case_id set)        → expect FAIL
 *   (d) anon SELECT from cases                                      → expect blocked/empty
 * CLEANUP (service role): delete the submission row + remove the object, then
 * re-check to prove both are gone.
 *
 * Usage (from app/):  node test/intake.test.mjs
 * Reads env from app/.env.local.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(appDir, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON_KEY || !SERVICE_KEY) {
  console.error("FAIL: SUPABASE URL / ANON / SERVICE_ROLE key missing in .env.local.");
  process.exit(1);
}

const BUCKET = "case-docs";
const uuid = crypto.randomUUID();
const PATH = `intake/__test__/${uuid}-probe.txt`;
const BODY = `intake probe ${uuid}`;

// The public form's client: anon key, no session.
const anon = createClient(URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Cleanup client: service role, RLS-bypassing (server/test context only).
const admin = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
let insertedRowId = null;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

async function cleanup() {
  console.log("\n--- cleanup (service role) ---");

  // The anon insert never returns the row id (no SELECT for anon), so find our
  // test row by its unique marker in the payload.
  if (!insertedRowId) {
    const { data } = await admin
      .from("intake_submissions")
      .select("id")
      .eq("payload->>probe", uuid);
    if (data && data.length) insertedRowId = data[0].id;
  }

  if (insertedRowId) {
    const { error } = await admin.from("intake_submissions").delete().eq("id", insertedRowId);
    console.log(
      error ? `  row delete error: ${error.message}` : `  deleted intake_submissions row ${insertedRowId}`,
    );
  } else {
    console.log("  (no intake_submissions row to delete)");
  }

  const { error: rmErr } = await admin.storage.from(BUCKET).remove([PATH]);
  console.log(rmErr ? `  object remove error: ${rmErr.message}` : `  removed object ${PATH}`);

  // Prove both are gone.
  const { data: after } = await admin.storage.from(BUCKET).list("intake/__test__");
  const stillThere = (after ?? []).some((o) => o.name === `${uuid}-probe.txt`);
  ok(!stillThere, "object no longer listed after cleanup");

  const { data: rowAfter } = await admin
    .from("intake_submissions")
    .select("id")
    .eq("payload->>probe", uuid);
  ok(!rowAfter || rowAfter.length === 0, "intake_submissions row no longer present after cleanup");
}

async function main() {
  console.log(`Bucket: ${BUCKET}  ·  anon role (public intake path)`);
  console.log(`Probe path: ${PATH}\n`);

  // (a) anon upload under intake/ → allowed by 0003 anon_insert_intake_uploads.
  const { error: upErr } = await anon.storage
    .from(BUCKET)
    .upload(PATH, new Blob([BODY], { type: "text/plain" }), {
      contentType: "text/plain",
      upsert: false,
    });
  ok(!upErr, `(a) anon upload to case-docs/intake/… → OK${upErr ? ` — ${upErr.message}` : ""}`);

  // (b) anon insert a valid submission (status 'new', case_id null) → allowed.
  const payload = {
    probe: uuid, // unique marker so cleanup can find this row
    surname: "Test",
    firstname: "Intake",
    dod: "2026-01-01",
    natType: "israeli",
  };
  const { error: insErr } = await anon.from("intake_submissions").insert({
    payload,
    files: [{ path: PATH, name: "probe.txt", mime: "text/plain" }],
    status: "new",
    case_id: null,
  });
  ok(!insErr, `(b) anon insert intake_submissions (new, case_id null) → OK${insErr ? ` — ${insErr.message}` : ""}`);
  if (!insErr) {
    // Recover the id via service role (anon can't SELECT it back).
    const { data } = await admin
      .from("intake_submissions")
      .select("id")
      .eq("payload->>probe", uuid);
    if (data && data.length) insertedRowId = data[0].id;
  }

  // (c) anon insert with status='imported' → must be REJECTED by RLS.
  const { error: badErr } = await anon.from("intake_submissions").insert({
    payload: { probe: `${uuid}-bad` },
    files: [],
    status: "imported",
    case_id: null,
  });
  ok(!!badErr, `(c) anon insert with status='imported' → BLOCKED by RLS${badErr ? ` (${badErr.code ?? "error"})` : " — UNEXPECTEDLY SUCCEEDED"}`);
  // Belt-and-braces: if it somehow slipped through, clean it too.
  if (!badErr) {
    await admin.from("intake_submissions").delete().eq("payload->>probe", `${uuid}-bad`);
  }

  // (c2) anon insert with case_id set → also REJECTED by RLS.
  const { error: badErr2 } = await anon.from("intake_submissions").insert({
    payload: { probe: `${uuid}-bad2` },
    files: [],
    status: "new",
    case_id: "ca5e0001-0000-4000-8000-000000000001",
  });
  ok(!!badErr2, `(c2) anon insert with case_id set → BLOCKED by RLS${badErr2 ? ` (${badErr2.code ?? "error"})` : " — UNEXPECTEDLY SUCCEEDED"}`);
  if (!badErr2) {
    await admin.from("intake_submissions").delete().eq("payload->>probe", `${uuid}-bad2`);
  }

  // (d) anon SELECT of cases → blocked (no anon policy): expect error OR 0 rows.
  const { data: caseRows, error: caseErr } = await anon.from("cases").select("id").limit(5);
  const blocked = !!caseErr || (Array.isArray(caseRows) && caseRows.length === 0);
  ok(
    blocked,
    `(d) anon SELECT cases → blocked/empty${
      caseErr ? ` (error: ${caseErr.code ?? caseErr.message})` : ` (${caseRows?.length ?? 0} rows)`
    }`,
  );
}

main()
  .then(cleanup)
  .catch(async (e) => {
    console.error("ERROR:", e?.message || e);
    failures++;
    await cleanup().catch(() => {});
  })
  .finally(() => {
    console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
    process.exit(failures === 0 ? 0 : 1);
  });

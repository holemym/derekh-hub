/**
 * Document-vault end-to-end Storage test (server context, service role).
 *
 * Exercises the exact operations the vault server actions perform against the
 * LIVE `case-docs` private bucket + `documents` table, then removes every
 * artifact. Uses the SERVICE ROLE key (RLS-bypassing) because this runs in a
 * server/test context, mirroring how the app's server actions reach Storage.
 *
 *   1. upload a tiny file to case-docs/cases/<demo>/__test__/<uuid>-probe.txt
 *   2. list the __test__ folder and confirm the object is there
 *   3. createSignedUrl(path, 60) and fetch it → expect HTTP 200 + body match
 *   4. insert a `documents` row (status 'received', uploaded_by 'staff')
 *   5. CLEANUP: delete the row, remove the object, re-list to prove it's gone
 *
 * RLS reasoning (0003_storage.sql): the app does the same via the RLS-scoped
 * *staff* session, which satisfies `staff_insert/select/delete_derech_objects`
 * (bucket in ('case-docs','form-templates') AND public.is_active_staff()). A
 * staff user therefore has the full upload/list/sign/delete rights this test
 * uses; anon is limited to INSERT under `intake/` only, so anon could NOT run
 * steps 2–5. Service role here just stands in for that authorized-staff path
 * without minting a JWT.
 *
 * Usage (from app/):  node test/doc-vault.test.mjs
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
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE_KEY) {
  console.error("FAIL: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing.");
  process.exit(1);
}

const BUCKET = "case-docs";
const DEMO_CASE_ID = "ca5e0001-0000-4000-8000-000000000001"; // seeded demo case
const uuid = crypto.randomUUID();
const PATH = `cases/${DEMO_CASE_ID}/__test__/${uuid}-probe.txt`;
const BODY = `doc-vault probe ${uuid}`;

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let failures = 0;
let insertedRowId = null;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

async function cleanup() {
  console.log("\n--- cleanup ---");
  if (insertedRowId) {
    const { error } = await supabase.from("documents").delete().eq("id", insertedRowId);
    console.log(error ? `  row delete error: ${error.message}` : `  deleted documents row ${insertedRowId}`);
  }
  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([PATH]);
  console.log(rmErr ? `  object remove error: ${rmErr.message}` : `  removed object ${PATH}`);

  // Prove it's gone.
  const { data: after } = await supabase.storage
    .from(BUCKET)
    .list(`cases/${DEMO_CASE_ID}/__test__`);
  const stillThere = (after ?? []).some((o) => o.name === `${uuid}-probe.txt`);
  ok(!stillThere, "object no longer listed after cleanup");

  if (insertedRowId) {
    const { data: rowAfter } = await supabase
      .from("documents")
      .select("id")
      .eq("id", insertedRowId)
      .maybeSingle();
    ok(!rowAfter, "documents row no longer present after cleanup");
  }
}

async function main() {
  console.log(`Bucket: ${BUCKET}  ·  demo case: ${DEMO_CASE_ID}`);
  console.log(`Probe path: ${PATH}\n`);

  // 0. Sanity: demo case exists.
  const { data: caseRow, error: caseErr } = await supabase
    .from("cases")
    .select("id")
    .eq("id", DEMO_CASE_ID)
    .maybeSingle();
  ok(!caseErr && !!caseRow, `demo case exists (${DEMO_CASE_ID})`);

  // 1. Upload.
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(PATH, new Blob([BODY], { type: "text/plain" }), {
      contentType: "text/plain",
      upsert: false,
    });
  ok(!upErr, `1. upload tiny file${upErr ? ` — ${upErr.message}` : ""}`);

  // 2. List.
  const { data: listed, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list(`cases/${DEMO_CASE_ID}/__test__`);
  const found = (listed ?? []).find((o) => o.name === `${uuid}-probe.txt`);
  ok(!listErr && !!found, `2. list shows the object${listErr ? ` — ${listErr.message}` : ""}`);

  // 3. Signed URL + fetch → 200.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(PATH, 60);
  ok(!signErr && !!signed?.signedUrl, `3a. createSignedUrl(path, 60)${signErr ? ` — ${signErr.message}` : ""}`);
  if (signed?.signedUrl) {
    const res = await fetch(signed.signedUrl);
    const text = await res.text();
    ok(res.status === 200, `3b. fetch signed URL → HTTP ${res.status} (expect 200)`);
    ok(text === BODY, `3c. signed-URL body matches uploaded content`);
  }

  // 4. Insert a documents row (mirrors uploadDocument's insert).
  const { data: rowData, error: rowErr } = await supabase
    .from("documents")
    .insert({
      case_id: DEMO_CASE_ID,
      type: "__test_probe__",
      status: "received",
      storage_path: PATH,
      uploaded_by: "staff",
    })
    .select("id")
    .single();
  if (rowData) insertedRowId = rowData.id;
  ok(!rowErr && !!rowData, `4. insert documents row (received/staff)${rowErr ? ` — ${rowErr.message}` : ""}`);
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

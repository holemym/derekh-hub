/**
 * Live RLS read test — proves the repo's SELECT shape returns the seeded demo
 * case when run *as the owner*, under row-level security.
 *
 * We connect with `pg` (SUPABASE_DB_URL, session pooler) and, inside a
 * transaction, impersonate the authenticated owner exactly as PostgREST would:
 *   set local role authenticated;
 *   select set_config('request.jwt.claims', '{"sub":<owner-uid>,...}', true);
 * Then we run the same query the repo issues (cases + children) and assert the
 * seed case + the fields the DB→Case mapper needs are present.
 *
 * Usage (from app/):  node test/live-read.test.mjs
 * Reads env from app/.env.local (SUPABASE_DB_URL).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(appDir, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const DB_URL = env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("FAIL: SUPABASE_DB_URL missing from app/.env.local");
  process.exit(1);
}

const OWNER_UID = "7cf11041-33a9-4f8e-b78d-e7a4e013da3d"; // holemymora@gmail.com (David)
const SEED_CASE_ID = "ca5e0001-0000-4000-8000-000000000001";

// Fields the DB→Case mapper reads (src/lib/repo/mapper.ts).
const CASE_COLUMNS = [
  "id",
  "hebrew_name",
  "secular_first",
  "secular_last",
  "dob",
  "dod",
  "place_of_death",
  "place_of_birth",
  "address",
  "id_number",
  "nationality",
  "cause_of_death",
  "icd_code",
  "status",
  "urgency",
  "cemetery",
  "burial_place",
  "assigned_to",
  "stage_timestamps",
];

async function asOwner(client, fn) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query(
      "select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: OWNER_UID, role: "authenticated" })],
    );
    return await fn();
  } finally {
    await client.query("rollback"); // read-only; never persist
  }
}

async function main() {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let failures = 0;
  const ok = (cond, msg) => {
    console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
    if (!cond) failures++;
  };

  try {
    // 1. Sanity: as the ANON role (what PostgREST uses for an unauthenticated
    //    request), RLS should hide the cases. We must actually assume a
    //    non-superuser role inside a txn — the raw pooler connection is a
    //    BYPASSRLS role, so a plain SELECT here would (correctly) see rows.
    await client.query("begin");
    try {
      await client.query("set local role anon");
      const anon = await client.query("select count(*)::int as n from public.cases");
      ok(anon.rows[0].n === 0, `anon role sees 0 cases (RLS blocks) — got ${anon.rows[0].n}`);
    } finally {
      await client.query("rollback");
    }

    // 2. As the owner, run the repo's read shape.
    await asOwner(client, async () => {
      const caseRes = await client.query(
        `select ${CASE_COLUMNS.join(", ")}
           from public.cases
          where id = $1 and deleted_at is null`,
        [SEED_CASE_ID],
      );
      ok(caseRes.rowCount === 1, `owner reads the seed case (id ${SEED_CASE_ID})`);
      const row = caseRes.rows[0] ?? {};

      // The fields the mapper + permit need.
      ok(!!row.hebrew_name, `  hebrew_name present: ${JSON.stringify(row.hebrew_name)}`);
      ok(
        !!row.secular_first && !!row.secular_last,
        `  secular name: ${row.secular_first} / ${row.secular_last}`,
      );
      ok(!!row.dob, `  dob present: ${row.dob instanceof Date ? row.dob.toISOString().slice(0, 10) : row.dob}`);
      ok(!!row.dod, `  dod present: ${row.dod?.toISOString?.() ?? row.dod}`);
      ok(!!row.place_of_death, `  place_of_death: ${JSON.stringify(row.place_of_death)}`);
      ok(!!row.id_number, `  id_number: ${JSON.stringify(row.id_number)}`);
      ok(!!row.nationality, `  nationality: ${JSON.stringify(row.nationality)}`);
      ok(row.status === "documents", `  status: ${row.status}`);
      // place_of_birth is a 0004 column; 0006 dropped last_address (address is canonical).
      ok("place_of_birth" in row, `  place_of_birth column exists (val: ${JSON.stringify(row.place_of_birth)})`);
      ok("cause_of_death" in row, `  cause_of_death column exists (val: ${JSON.stringify(row.cause_of_death)})`);
      ok("icd_code" in row, `  icd_code column exists (val: ${JSON.stringify(row.icd_code)})`);
      // For the permit's address binding: cases.address must resolve.
      const resolvedAddress = row.address;
      ok(!!resolvedAddress, `  resolved permit address (address): ${JSON.stringify(resolvedAddress)}`);

      // 3. Linked children the getCase() bundle reads.
      const legs = await client.query(
        "select id, type, from_location, to_location, carrier, flight_no, awb_no, status, scheduled_at from public.transport_legs where case_id = $1 and deleted_at is null",
        [SEED_CASE_ID],
      );
      ok(legs.rowCount >= 1, `  transport legs: ${legs.rowCount} (e.g. ${legs.rows[0]?.carrier} ${legs.rows[0]?.flight_no} ${legs.rows[0]?.from_location}→${legs.rows[0]?.to_location})`);

      const contacts = await client.query(
        "select contact_id, role from public.case_contacts where case_id = $1",
        [SEED_CASE_ID],
      );
      ok(contacts.rowCount >= 1, `  case_contacts: ${contacts.rowCount}`);

      const tasks = await client.query(
        "select id, title, status from public.tasks where case_id = $1 and deleted_at is null",
        [SEED_CASE_ID],
      );
      ok(tasks.rowCount >= 1, `  tasks: ${tasks.rowCount} (e.g. "${tasks.rows[0]?.title}")`);

      // 4. The full list shape (Today / Cases) — owner sees >= the seed case.
      const list = await client.query(
        "select id, status, urgency from public.cases where deleted_at is null",
      );
      ok(list.rowCount >= 1, `  owner list read returns ${list.rowCount} case(s)`);

      console.log("\n--- seed case row (as owner) ---");
      console.log(JSON.stringify(row, null, 2));
    });
  } finally {
    await client.end();
  }

  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});

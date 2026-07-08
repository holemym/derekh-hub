/**
 * M3 transport & repatriation live test — proves the transport_legs DB effects
 * (insert leg, append chain-of-custody, advance status) against the REAL
 * database, then generates the transport manifest PDF from the REAL module and
 * renders it for a human eyeball. Leaves NOTHING behind.
 *
 * DB strategy (same as stage.test.mjs): one transaction ending in ROLLBACK, so
 * no row is ever committed. We impersonate the authenticated owner exactly as
 * PostgREST would (set local role authenticated + request.jwt.claims sub=…) and
 * run the SAME statements the server actions issue:
 *   1. INSERT a transport_leg (status 'planned').
 *   2. UPDATE custody = <prior chain> || <new event>   (append-only).
 *   3. UPDATE status  = 'booked'                        (advance one step).
 * Then assert the shapes and ROLLBACK.
 *
 * Manifest: buildManifestPdf() (src/lib/documents/manifest.ts) is imported via
 * Node's --experimental-strip-types and written to test-output/manifest.pdf.
 * No storage object is created (the DB write path is exercised by the tx; we do
 * not upload to keep Storage clean — see NOTE below).
 *
 * Usage:  node --experimental-strip-types test/transport.test.mjs
 * Reads SUPABASE_DB_URL from app/.env.local.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { buildManifestPdf } from "../src/lib/documents/manifest.ts";

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

const OWNER_UID = "7cf11041-33a9-4f8e-b78d-e7a4e013da3d";
const TMP_CASE_ID = "ca5e0003-0000-4000-8000-00000000d1e9";
const TMP_LEG_ID = "1e900003-0000-4000-8000-00000000d1e9";

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

async function dbPortion() {
  const client = new pg.Client({
    connectionString: DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  let legRow = null;
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: OWNER_UID, role: "authenticated" }),
    ]);

    // Temp case + leg.
    await client.query(
      `insert into public.cases (id, hebrew_name, secular_first, secular_last, status, urgency)
       values ($1, 'טסט בן טסט', 'Temp', 'Transport-Case', 'transport', 0)`,
      [TMP_CASE_ID],
    );
    ok(true, "inserted temp case (status=transport)");

    // (1) INSERT leg — mirrors saveTransportLeg().
    const ins = await client.query(
      `insert into public.transport_legs
         (id, case_id, type, status, from_location, to_location, carrier, flight_no, awb_no, scheduled_at)
       values ($1, $2, 'air_cargo', 'planned', 'VIE', 'TLV', 'EL AL Cargo', 'LY 364', '114-12345675', now() + interval '2 days')
       returning id, status, custody`,
      [TMP_LEG_ID, TMP_CASE_ID],
    );
    ok(ins.rowCount === 1, "inserted transport leg (status=planned)");
    ok(Array.isArray(ins.rows[0].custody) && ins.rows[0].custody.length === 0, "  custody starts as empty array");

    // (2) APPEND a custody event — mirrors addCustodyEvent() (jsonb || append).
    const event = { event: "collected", at: new Date().toISOString(), by: "Chevra Kadisha", note: "sealed metal coffin" };
    await client.query(
      `update public.transport_legs
          set custody = coalesce(custody, '[]'::jsonb) || $2::jsonb
        where id = $1 and case_id = $3 and deleted_at is null`,
      [TMP_LEG_ID, JSON.stringify([event]), TMP_CASE_ID],
    );
    // Append a SECOND one to prove prior events aren't clobbered.
    const event2 = { event: "handed_over", at: new Date().toISOString(), by: "EL AL Cargo" };
    await client.query(
      `update public.transport_legs
          set custody = coalesce(custody, '[]'::jsonb) || $2::jsonb
        where id = $1 and case_id = $3 and deleted_at is null`,
      [TMP_LEG_ID, JSON.stringify([event2]), TMP_CASE_ID],
    );

    // (3) ADVANCE status planned → booked — mirrors advanceLegStatus().
    await client.query(
      `update public.transport_legs set status = 'booked'
        where id = $1 and case_id = $2 and deleted_at is null`,
      [TMP_LEG_ID, TMP_CASE_ID],
    );

    // ── Assertions ──────────────────────────────────────────────────────────
    const after = await client.query(
      "select status, custody, from_location, to_location, awb_no from public.transport_legs where id = $1",
      [TMP_LEG_ID],
    );
    legRow = after.rows[0];
    ok(legRow.status === "booked", `status advanced planned → booked (is '${legRow.status}')`);
    ok(Array.isArray(legRow.custody) && legRow.custody.length === 2, `custody chain has 2 events (has ${legRow.custody?.length})`);
    ok(legRow.custody[0]?.event === "collected", "  first custody event preserved (collected)");
    ok(legRow.custody[1]?.event === "handed_over", "  second custody event appended (handed_over)");
    ok(legRow.custody[0]?.note === "sealed metal coffin", "  custody note round-trips");
    ok(legRow.from_location === "VIE" && legRow.to_location === "TLV", "  route persisted VIE → TLV");
  } catch (e) {
    ok(false, `unexpected DB error: ${e.message}`);
  } finally {
    await client.query("rollback");
  }

  // Prove nothing leaked.
  const leakCase = await client.query("select count(*)::int as n from public.cases where id = $1", [TMP_CASE_ID]);
  const leakLeg = await client.query("select count(*)::int as n from public.transport_legs where id = $1", [TMP_LEG_ID]);
  ok(leakCase.rows[0].n === 0, "cleanup: no temp case left in the live DB");
  ok(leakLeg.rows[0].n === 0, "cleanup: no temp transport_leg left in the live DB");

  await client.end();
  return legRow;
}

async function manifestPortion() {
  const bytes = await buildManifestPdf({
    niftar: {
      hebrewName: "טסט בן טסט",
      secularName: "Temp Transport-Case",
      idOrPassport: "12345675",
      nationality: "Austrian",
      dod: "2026-07-05T14:30:00.000Z",
      placeOfDeath: "Hospital Hietzing, Vienna",
      burialPlace: "Har HaMenuchot, Jerusalem",
    },
    legs: [
      {
        id: "1", caseId: "c", type: "ground",
        from: "Vienna morgue", to: "VIE airport",
        carrier: "Bestattung Wien", flightNo: undefined, awbNo: undefined,
        scheduledAt: "2026-07-07T06:00:00.000Z", status: "completed",
        custodyChain: [
          { event: "collected", at: "2026-07-06T09:00:00.000Z", by: "Chevra Kadisha Wien", note: "sealed metal coffin" },
          { event: "handed_over", at: "2026-07-07T06:30:00.000Z", by: "EL AL Cargo VIE" },
        ],
        custody: {},
      },
      {
        id: "2", caseId: "c", type: "air_cargo",
        from: "VIE", to: "TLV",
        carrier: "EL AL Cargo", flightNo: "LY 364", awbNo: "114-12345675",
        scheduledAt: "2026-07-07T10:15:00.000Z", status: "in_transit",
        custodyChain: [
          { event: "received", at: "2026-07-07T13:00:00.000Z", by: "Chevra Kadisha TLV" },
        ],
        custody: {},
      },
    ],
    reference: "ca5e0003",
    generatedAt: new Date().toISOString(),
  });

  ok(bytes.length > 800, `manifest PDF generated (${bytes.length} bytes)`);
  const outDir = join(appDir, "test-output");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "manifest.pdf"), bytes);
  console.log("Wrote test-output/manifest.pdf");
}

async function main() {
  await dbPortion();
  await manifestPortion();
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});

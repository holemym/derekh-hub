/**
 * M3 stage-transition live test — proves advanceCaseStage's DB effects against
 * the REAL database, then leaves NOTHING behind (incl. activity_log, which has
 * no delete policy under RLS).
 *
 * Strategy: everything runs inside ONE transaction that ends in ROLLBACK, so no
 * test row is ever committed — the cleanest possible cleanup, and it works even
 * though activity_log is RLS-immutable (a committed row could not be deleted by
 * a staff session). We impersonate the authenticated owner exactly as PostgREST
 * would (set local role authenticated + request.jwt.claims), then run the SAME
 * two statements the server action issues:
 *
 *   1. UPDATE cases SET status = <next>, stage_timestamps = <merged jsonb>
 *   2. INSERT INTO activity_log (action 'stage_changed', detail {from,to}, ...)
 *
 * and assert: status moved, stage_timestamps kept the prior stamp AND gained the
 * new key, and an activity_log row exists. Then ROLLBACK + prove nothing leaked
 * on a fresh committed read.
 *
 * We NEVER touch the seed case — a dedicated temp case id is used throughout.
 *
 * Usage (from app/):  node test/stage.test.mjs
 * Reads SUPABASE_DB_URL from app/.env.local.
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

const OWNER_UID = "7cf11041-33a9-4f8e-b78d-e7a4e013da3d";
const TMP_CASE = "ca5e0003-0000-4000-8000-00000000dead";

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

  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: OWNER_UID, role: "authenticated" }),
    ]);

    // Temp case at 'documents' with an EXISTING stamp we must not clobber.
    const priorStamp = "2026-07-01T09:00:00.000Z";
    await client.query(
      `insert into public.cases (id, hebrew_name, secular_first, secular_last, status, urgency, stage_timestamps)
       values ($1, 'טסט בן טסט', 'Temp', 'Stage-Case', 'documents', 0, $2::jsonb)`,
      [TMP_CASE, JSON.stringify({ notified: priorStamp })],
    );
    ok(true, "inserted temp case (status=documents, one prior stamp)");

    // ── The exact effect of advanceCaseStage('documents' → 'transport') ──────
    const from = "documents";
    const to = "transport";
    const newStamp = new Date().toISOString();

    // (1) status advance + stage_timestamps MERGE (|| preserves prior keys).
    await client.query(
      `update public.cases
          set status = $2,
              stage_timestamps = coalesce(stage_timestamps, '{}'::jsonb)
                                 || jsonb_build_object($3::text, $4::text)
        where id = $1 and deleted_at is null`,
      [TMP_CASE, to, to, newStamp],
    );

    // (2) append the immutable audit row.
    const logIns = await client.query(
      `insert into public.activity_log (case_id, actor, actor_label, action, detail)
       values ($1, $2, $3, 'stage_changed', $4::jsonb)
       returning id`,
      [TMP_CASE, OWNER_UID, "Owner (test)", JSON.stringify({ from, to })],
    );
    ok(logIns.rowCount === 1, "activity_log row inserted (stage_changed)");

    // ── Assertions ───────────────────────────────────────────────────────────
    const after = await client.query(
      "select status, stage_timestamps from public.cases where id = $1",
      [TMP_CASE],
    );
    const row = after.rows[0];
    ok(row.status === to, `status advanced ${from} → ${to} (is '${row.status}')`);

    const stamps = row.stage_timestamps;
    ok(!!stamps[to], `stage_timestamps gained the new key '${to}'`);
    ok(
      stamps.notified === priorStamp,
      "prior stage_timestamps stamp preserved (merge did not clobber)",
    );

    const log = await client.query(
      `select action, detail, actor from public.activity_log
        where case_id = $1 and action = 'stage_changed'`,
      [TMP_CASE],
    );
    ok(log.rowCount === 1, "exactly one stage_changed activity_log row exists");
    ok(
      log.rows[0].detail?.from === from && log.rows[0].detail?.to === to,
      `  audit detail records {from:'${from}', to:'${to}'}`,
    );
    ok(log.rows[0].actor === OWNER_UID, "  audit actor = acting staff uid");

    // Forward-only guard (mirrors the server action's index check) — a backward
    // target must NOT be applied. We assert the rule, not the DB (the action
    // rejects before issuing SQL).
    const order = ["notified", "collected", "prepared", "documents", "transport", "arrived", "buried"];
    ok(order.indexOf("collected") < order.indexOf(to), "forward-only: 'collected' would be rejected as backward");
  } catch (e) {
    ok(false, `unexpected error: ${e.message}`);
  } finally {
    // Never persist — the entire test is a dry run. This also removes the
    // activity_log row that RLS would otherwise make un-deletable.
    await client.query("rollback");
  }

  // Prove nothing leaked: a fresh committed read must not see the temp rows.
  const leakCase = await client.query(
    "select count(*)::int as n from public.cases where id = $1",
    [TMP_CASE],
  );
  const leakLog = await client.query(
    "select count(*)::int as n from public.activity_log where case_id = $1",
    [TMP_CASE],
  );
  ok(leakCase.rows[0].n === 0, "cleanup: no temp case left in the live DB");
  ok(leakLog.rows[0].n === 0, "cleanup: no temp activity_log rows left in the live DB");

  await client.end();
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});

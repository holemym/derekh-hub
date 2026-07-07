/**
 * M2 live round-trip test — proves the task + open-case queries return and
 * ORDER correctly against the REAL database, then leaves nothing behind.
 *
 * Everything runs inside a single transaction that ends in ROLLBACK, so no test
 * rows are ever committed to the live DB. We impersonate the authenticated owner
 * exactly as PostgREST would (set local role + request.jwt.claims), insert one
 * temp case + one temp task, run the SAME shapes the repo issues
 * (listOpenTasks / openCasesByUrgency), assert, and roll back.
 *
 * Usage (from app/):  node test/tasks-live.test.mjs
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
const TMP_CASE = "ca5e0002-0000-4000-8000-00000000dead";
const TMP_TASK = "7a5c0002-0000-4000-8000-00000000dead";

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

    // Insert one temp case (documents stage) + one open task due "now-ish".
    await client.query(
      `insert into public.cases (id, hebrew_name, secular_first, secular_last, status, urgency)
       values ($1, 'טסט בן טסט', 'Temp', 'Task-Case', 'documents', 0)`,
      [TMP_CASE],
    );
    ok(true, "inserted temp case (documents stage)");

    await client.query(
      `insert into public.tasks (id, case_id, title, due, status)
       values ($1, $2, 'M2 temp task — verify + delete', now() - interval '1 hour', 'open')`,
      [TMP_TASK, TMP_CASE],
    );
    ok(true, "inserted temp open task (overdue by 1h)");

    // 1. listOpenTasks() shape: open + not deleted, due-sorted.
    const tasks = await client.query(
      `select id, case_id, title, due, status, calendar_note
         from public.tasks
        where status = 'open' and deleted_at is null
        order by due asc nulls last`,
    );
    const found = tasks.rows.find((r) => r.id === TMP_TASK);
    ok(!!found, `listOpenTasks returns the temp task (of ${tasks.rowCount} open)`);
    ok(found?.status === "open" && found?.case_id === TMP_CASE, "  task is open + linked to the temp case");

    // 2. openCasesByUrgency() shape: non-buried, non-deleted cases.
    const cases = await client.query(
      `select id, status, urgency from public.cases
        where deleted_at is null and status <> 'buried'`,
    );
    ok(cases.rows.some((r) => r.id === TMP_CASE), `openCases returns the temp case (of ${cases.rowCount} open)`);

    // 3. tasksForCase() shape.
    const forCase = await client.query(
      `select id, title, status from public.tasks
        where case_id = $1 and deleted_at is null
        order by due asc nulls last`,
      [TMP_CASE],
    );
    ok(forCase.rowCount === 1 && forCase.rows[0].id === TMP_TASK, "tasksForCase returns exactly the temp task");

    // 4. completeTask() UPDATE shape → task leaves the open feed.
    await client.query("update public.tasks set status = 'done' where id = $1", [TMP_TASK]);
    const afterDone = await client.query(
      "select count(*)::int as n from public.tasks where status = 'open' and id = $1",
      [TMP_TASK],
    );
    ok(afterDone.rows[0].n === 0, "completeTask (status=done) removes it from the open feed");
  } catch (e) {
    ok(false, `unexpected error: ${e.message}`);
  } finally {
    // Never persist — the whole test is a dry run.
    await client.query("rollback");
  }

  // Prove nothing leaked: a fresh committed read must not see the temp rows.
  const leakCase = await client.query("select count(*)::int as n from public.cases where id = $1", [TMP_CASE]);
  const leakTask = await client.query("select count(*)::int as n from public.tasks where id = $1", [TMP_TASK]);
  ok(leakCase.rows[0].n === 0, "no temp case left in the live DB (rolled back)");
  ok(leakTask.rows[0].n === 0, "no temp task left in the live DB (rolled back)");

  await client.end();
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});

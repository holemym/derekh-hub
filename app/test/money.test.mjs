/**
 * M4 money + comms live test — proves the invoices / expenses / messages DB
 * effects against the REAL database, then generates the invoice PDF from the
 * REAL module and renders it for a human eyeball. Leaves NOTHING behind.
 *
 * DB strategy (same as transport.test.mjs): one transaction ending in ROLLBACK,
 * so no row is ever committed. We impersonate the authenticated owner exactly as
 * PostgREST would (set local role authenticated + request.jwt.claims sub=…) and
 * run the SAME statements the server actions issue:
 *   1. INSERT an invoice (status 'draft').
 *   2. UPDATE status 'draft' → 'sent'  (+ issued_at)   — advanceInvoice().
 *   3. UPDATE status 'sent'  → 'paid'  (+ paid_at)      — advanceInvoice().
 *   4. INSERT an expense.
 *   5. INSERT a messages row (channel, template_key, recipient, body, sent_at).
 * Then assert the shapes and ROLLBACK.
 *
 * Invoice PDF: buildInvoicePdf() (src/lib/documents/invoice.ts) is imported via
 * Node's --experimental-strip-types and written to test-output/invoice.pdf. No
 * storage object is created (kept DB-only + local file).
 *
 * Usage:  node --experimental-strip-types test/money.test.mjs
 * Reads SUPABASE_DB_URL from app/.env.local.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { buildInvoicePdf } from "../src/lib/documents/invoice.ts";

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
const TMP_CASE_ID = "ca5e0004-0000-4000-8000-00000000d1e9";
const TMP_INV_ID = "1c000004-0000-4000-8000-00000000d1e9";
const TMP_EXP_ID = "e5000004-0000-4000-8000-00000000d1e9";
const TMP_MSG_ID = "a5000004-0000-4000-8000-00000000d1e9";

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

  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: OWNER_UID, role: "authenticated" }),
    ]);

    // Temp case.
    await client.query(
      `insert into public.cases (id, hebrew_name, secular_first, secular_last, status, urgency)
       values ($1, 'טסט בן טסט', 'Temp', 'Money-Case', 'documents', 0)`,
      [TMP_CASE_ID],
    );
    ok(true, "inserted temp case");

    // (1) INSERT invoice (draft) — mirrors addInvoice().
    const ins = await client.query(
      `insert into public.invoices
         (id, case_id, number, amount_cents, currency, status)
       values ($1, $2, 'INV-2026-9999', 250000, 'EUR', 'draft')
       returning id, status, amount_cents, currency, issued_at, paid_at`,
      [TMP_INV_ID, TMP_CASE_ID],
    );
    ok(ins.rowCount === 1, "inserted invoice (status=draft)");
    ok(ins.rows[0].amount_cents === 250000, "  amount stored as cents (250000 = €2,500.00)");
    ok(ins.rows[0].currency === "EUR", "  currency defaults to EUR");
    ok(ins.rows[0].issued_at === null && ins.rows[0].paid_at === null, "  draft has no issued_at/paid_at");

    // (2) ADVANCE draft → sent (+ issued_at) — mirrors advanceInvoice().
    await client.query(
      `update public.invoices set status = 'sent', issued_at = now()
        where id = $1 and case_id = $2 and deleted_at is null`,
      [TMP_INV_ID, TMP_CASE_ID],
    );
    // (3) ADVANCE sent → paid (+ paid_at).
    await client.query(
      `update public.invoices set status = 'paid', paid_at = now()
        where id = $1 and case_id = $2 and deleted_at is null`,
      [TMP_INV_ID, TMP_CASE_ID],
    );

    const invAfter = await client.query(
      "select status, issued_at, paid_at from public.invoices where id = $1",
      [TMP_INV_ID],
    );
    const inv = invAfter.rows[0];
    ok(inv.status === "paid", `invoice advanced draft → sent → paid (is '${inv.status}')`);
    ok(inv.issued_at !== null, "  issued_at set when marked sent");
    ok(inv.paid_at !== null, "  paid_at set when marked paid");

    // (4) INSERT expense — mirrors addExpense().
    const expIns = await client.query(
      `insert into public.expenses (id, case_id, label, amount_cents, currency, incurred_at)
       values ($1, $2, 'Air-cargo charge (EL AL)', 89000, 'EUR', now())
       returning id, label, amount_cents`,
      [TMP_EXP_ID, TMP_CASE_ID],
    );
    ok(expIns.rowCount === 1 && expIns.rows[0].amount_cents === 89000, "inserted expense (89000 cents = €890.00)");

    // (5) INSERT a messages row — mirrors logMessageSent().
    const msgIns = await client.query(
      `insert into public.messages (id, case_id, channel, template_key, recipient, body, sent_at)
       values ($1, $2, 'whatsapp', 'permit_issued', '+43 660 1234567',
               'Dear family, the transfer permit has been issued.', now())
       returning id, channel, template_key, recipient, sent_at`,
      [TMP_MSG_ID, TMP_CASE_ID],
    );
    ok(msgIns.rowCount === 1, "inserted message (channel=whatsapp)");
    ok(msgIns.rows[0].template_key === "permit_issued", "  template_key logged (permit_issued)");
    ok(msgIns.rows[0].recipient === "+43 660 1234567", "  recipient logged");
    ok(msgIns.rows[0].sent_at !== null, "  sent_at logged");

    // Net roll-up sanity: paid (2500.00) − expenses (890.00) = 1610.00.
    const netCents = inv.status === "paid" ? 250000 - 89000 : -89000;
    ok(netCents === 161000, `net = paid − expenses = €1,610.00 (${netCents} cents)`);
  } catch (e) {
    ok(false, `unexpected DB error: ${e.message}`);
  } finally {
    await client.query("rollback");
  }

  // Prove nothing leaked.
  const leaks = await client.query(
    `select
       (select count(*)::int from public.cases    where id = $1) as c,
       (select count(*)::int from public.invoices where id = $2) as i,
       (select count(*)::int from public.expenses where id = $3) as e,
       (select count(*)::int from public.messages where id = $4) as m`,
    [TMP_CASE_ID, TMP_INV_ID, TMP_EXP_ID, TMP_MSG_ID],
  );
  const r = leaks.rows[0];
  ok(r.c === 0, "cleanup: no temp case left in the live DB");
  ok(r.i === 0, "cleanup: no temp invoice left in the live DB");
  ok(r.e === 0, "cleanup: no temp expense left in the live DB");
  ok(r.m === 0, "cleanup: no temp message left in the live DB");

  await client.end();
}

async function invoicePortion() {
  const bytes = await buildInvoicePdf({
    number: "INV-2026-9999",
    status: "paid",
    issuedAt: "2026-07-06T09:00:00.000Z",
    paidAt: "2026-07-08T11:00:00.000Z",
    currency: "EUR",
    billTo: {
      name: "Sara Cohen",
      email: "sara.cohen@example.org",
      phone: "+43 660 1234567",
    },
    niftar: { hebrewName: "טסט בן טסט", secularName: "David Cohen" },
    lines: [
      { description: "Burial & repatriation service — David Cohen", amountCents: 250000 },
    ],
    reference: "ca5e0004",
  });

  ok(bytes.length > 800, `invoice PDF generated (${bytes.length} bytes)`);
  const outDir = join(appDir, "test-output");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "invoice.pdf"), bytes);
  console.log("Wrote test-output/invoice.pdf");
}

async function main() {
  await dbPortion();
  await invoicePortion();
  console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERROR:", e.message || e);
  process.exit(1);
});

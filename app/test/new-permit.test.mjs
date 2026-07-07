/**
 * New-permit acceptance test — build a permit context from a FULLY-FILLED sample
 * of the New-permit form via a faithful JS mirror of
 * src/lib/documents/form.ts::buildPermitContextFromForm (Node can't resolve the
 * app's "@/" TS alias without a loader), generate against the real blank form,
 * and write test-output/new-permit.pdf.
 *
 * If you change form.ts, mirror the change here. The rendered PDF is inspected
 * page-by-page (pypdfium2, scale ~2) to confirm every value lands in its cell,
 * both digit grids print one-char-per-box, and the page-2 X marks sit inside the
 * ticked boxes with the declaration date on the Date line.
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generate, validate } from "../../packages/doc-engine/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, "..");

/* ── mirror of context.ts / form.ts helpers ─────────────────────────────── */

function formatPermitDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vienna",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}`;
}

function idForGrid(id) {
  if (!id) return "";
  return id.replace(/[\s\-]/g, "").toUpperCase();
}

/** Mirror of buildPermitContextFromForm. */
function buildPermitContextFromForm(form) {
  return {
    case: {
      secular_last: form.surname.trim(),
      secular_first: form.firstname.trim(),
      dob: formatPermitDate(form.dob),
      place_of_birth: form.pob.trim(),
      last_address: form.address.trim(),
      nationality: form.nationality.trim(),
      id_number: idForGrid(form.id_number),
      dod: formatPermitDate(form.dod),
      place_of_death: form.pod.trim(),
      cause_of_death: form.cause.trim(),
      icd_code: form.icd.trim(),
      burial_place: form.burial_place.trim(),
    },
    transport: {
      flight_no: form.flight.trim(),
      airline: form.airline.trim(),
      disembarkation_point: form.disembarkation.trim(),
      transfer_date: formatPermitDate(form.transfer_date),
    },
    funeral_service: {
      name_address: form.funeral_service.trim(),
      license_no: idForGrid(form.funeral_no),
      license_expiry: formatPermitDate(form.license_expiry),
    },
    declaration: { date: formatPermitDate(form.decl_date) },
    documents: { ...form.documents },
  };
}

/* ── a fully-filled sample form (exercises every field + both grids) ─────── */

const sampleForm = {
  surname: "Weiss",
  firstname: "Hannah",
  hebrew_name: "חנה בת שרה",
  dob: "1938-03-14",
  pob: "Vienna, Austria",
  address: "Taborstrasse 12/4, 1020 Vienna, Austria",
  nationality: "Austrian",
  natType: "foreigner",
  id_number: "P-AT 4471822", // → PAT4471822 (10 chars, exactly fills the grid)
  dod: "2026-06-05",
  pod: "Rudolfstiftung, Vienna",
  cause: "Cardiac arrest",
  icd: "I46.9",
  burial_place: "Har HaMenuchot, Jerusalem — Chelka 7, row 12",
  flight: "LY 364",
  airline: "EL AL Cargo",
  disembarkation: "Ben Gurion Airport",
  transfer_date: "2026-06-08",
  funeral_service: "Kadisha Ltd., 5 Yirmeyahu St., Jerusalem",
  funeral_no: "512345678", // 9 digits, exactly fills the grid
  license_expiry: "2027-12-31",
  documents: {
    death_certificate: true,
    id_copy: true,
    doctor_certificate: true,
    local_transfer_permit: true,
    sealing_permit: true,
    c19_sealing: false,
    funeral_acceptance: true,
    preservation_certificate: false,
    moh_permit: false,
  },
  decl_date: "2026-07-07",
};

/* ── generate ────────────────────────────────────────────────────────────── */

const template = JSON.parse(
  await readFile(
    path.join(appRoot, "src/lib/documents/templates/il-mfa-transfer-permit.json"),
    "utf8",
  ),
);

const context = buildPermitContextFromForm(sampleForm);
console.log("Context:", JSON.stringify(context, null, 2));

const result = validate(template, context);
console.log("Validation ok:", result.ok, "issues:", result.issues);

const pdfBytes = new Uint8Array(
  await readFile(path.join(appRoot, "public/forms/il-mfa-transfer-permit.pdf")),
);

const filled = await generate(template, pdfBytes, context);

await mkdir(path.join(appRoot, "test-output"), { recursive: true });
await writeFile(path.join(appRoot, "test-output/new-permit.pdf"), filled);
console.log("Wrote test-output/new-permit.pdf —", filled.length, "bytes");

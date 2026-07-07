/**
 * M1 acceptance test — generate the real Israeli MFA transfer permit from a
 * full mock case, entirely via the doc-engine, and write test-output/permit.pdf.
 *
 * This is a faithful JS MIRROR of src/lib/documents/context.ts::buildPermitContext
 * (Node can't resolve the app's "@/" TS alias without a loader). If you change
 * the mapper, mirror the change here. The rendered PDF is inspected page-by-page
 * to confirm every value lands in its cell.
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { generate, validate } from "../../packages/doc-engine/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, "..");

/* ── mirror of context.ts helpers ───────────────────────────────────────── */

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

function splitSecularName(full) {
  const tokens = full.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: "", last: "" };
  if (tokens.length === 1) return { first: "", last: tokens[0] };
  return { first: tokens.slice(0, -1).join(" "), last: tokens[tokens.length - 1] };
}

function idForGrid(id) {
  if (!id) return "";
  return id.replace(/[\s\-]/g, "").toUpperCase();
}

const DEFAULT_DOCUMENT_CHECKS = {
  death_certificate: true,
  id_copy: true,
  doctor_certificate: true,
  local_transfer_permit: true,
  sealing_permit: true,
  c19_sealing: false,
  funeral_acceptance: true,
  preservation_certificate: false,
  moh_permit: false,
};

function buildPermitContext(c, opts = {}) {
  const { first, last } = splitSecularName(c.secularName);
  const air =
    c.transportLegs.find((l) => l.type === "air_cargo") ?? c.transportLegs[0];
  return {
    case: {
      secular_last: last,
      secular_first: first,
      dob: formatPermitDate(c.dob),
      place_of_birth: opts.placeOfBirth ?? "",
      last_address: opts.lastAddress ?? "",
      nationality: c.nationality ?? "",
      id_number: idForGrid(c.idOrPassport),
      dod: formatPermitDate(c.dod),
      place_of_death: c.placeOfDeath ?? "",
      cause_of_death: opts.causeOfDeath ?? "",
      icd_code: opts.icdCode ?? "",
      burial_place: c.burialPlace ?? c.cemetery ?? "",
    },
    transport: {
      flight_no: air?.flightOrAwb ?? "",
      airline: air?.carrier ?? "",
      disembarkation_point: air?.to ?? "",
      transfer_date: formatPermitDate(air?.scheduledAt),
    },
    funeral_service: {
      name_address: opts.funeralService?.name_address ?? "See attachment",
      license_no: opts.funeralService?.license_no ?? "",
      license_expiry: opts.funeralService?.license_expiry
        ? formatPermitDate(opts.funeralService.license_expiry)
        : "",
    },
    declaration: {
      date: formatPermitDate(opts.declarationDate ?? new Date().toISOString()),
    },
    documents: opts.documents ?? DEFAULT_DOCUMENT_CHECKS,
  };
}

/* ── full mock case (mirrors src/lib/mock.ts + the extra fields via opts) ── */

const mockCase = {
  id: "c-weiss",
  hebrewName: "חנה בת שרה",
  secularName: "Hannah Weiss",
  dob: "1938-03-14",
  dod: "2026-06-05T09:20:00.000Z",
  placeOfDeath: "Rudolfstiftung, Vienna",
  idOrPassport: "P-AT 4471822",
  nationality: "Austrian",
  status: "documents",
  urgent: true,
  cemetery: "Har HaMenuchot, Jerusalem",
  burialPlace: "Chelka 7, row 12",
  assignedTo: "Motty",
  transportLegs: [
    {
      id: "t-weiss-air",
      type: "air_cargo",
      from: "VIE",
      to: "TLV",
      carrier: "EL AL Cargo",
      flightOrAwb: "LY 364",
      scheduledAt: "2026-06-08T14:00:00.000Z",
      status: "booked",
      custody: {},
    },
  ],
  documents: [],
};

// Extra fields not yet on the Case shape — supplied via opts (as the real UI
// would from a FuneralService record / intake form).
const opts = {
  placeOfBirth: "Vienna, Austria",
  lastAddress: "Taborstrasse 12/4, 1020 Vienna, Austria",
  nationality: "Austrian",
  causeOfDeath: "Cardiac arrest",
  icdCode: "I46.9",
  funeralService: {
    name_address: "Kadisha Ltd., 5 Yirmeyahu St., Jerusalem",
    license_no: "512345678",
    license_expiry: "2027-12-31",
  },
  declarationDate: "2026-07-07T10:00:00.000Z",
};

/* ── generate ────────────────────────────────────────────────────────────── */

const template = JSON.parse(
  await readFile(
    path.join(appRoot, "src/lib/documents/templates/il-mfa-transfer-permit.json"),
    "utf8",
  ),
);

const context = buildPermitContext(mockCase, opts);
console.log("Context:", JSON.stringify(context, null, 2));

const result = validate(template, context);
console.log("Validation ok:", result.ok, "issues:", result.issues);

const pdfBytes = new Uint8Array(
  await readFile(path.join(appRoot, "public/forms/il-mfa-transfer-permit.pdf")),
);

const filled = await generate(template, pdfBytes, context);

await mkdir(path.join(appRoot, "test-output"), { recursive: true });
await writeFile(path.join(appRoot, "test-output/permit.pdf"), filled);
console.log("Wrote test-output/permit.pdf —", filled.length, "bytes");

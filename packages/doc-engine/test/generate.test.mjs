/**
 * End-to-end test for @derech/doc-engine.
 *
 * 1. Builds the package (tsc).
 * 2. Loads the REAL blank Israeli-MFA permit PDF.
 * 3. Generates with full sample data (every field, all 9 checks,
 *    10-digit id, 9-digit funeral number).
 * 4. Writes test-output/filled.pdf and asserts a non-trivial size.
 * 5. Exercises validate() / validateEncoding() / resolveBindings().
 *
 * Run: node test/generate.test.mjs
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLANK_PDF = 'C:\\Users\\User\\Downloads\\Application Leer.pdf';

// ---------- (a) build ----------
console.log('[1/5] tsc build...');
execSync('npx tsc -p tsconfig.json', { cwd: pkgRoot, stdio: 'inherit' });

const { generate, generateDetailed, validate, validateEncoding, resolveBindings } =
  await import(new URL('../dist/index.js', import.meta.url));

const template = JSON.parse(
  readFileSync(path.join(pkgRoot, 'templates', 'il-mfa-transfer-permit.json'), 'utf8'),
);

// ---------- sample data (bound via dot-paths) ----------
const data = {
  case: {
    secular_last: 'Mustermann',
    secular_first: 'Chaim David',
    dob: '12.03.1941',
    place_of_birth: 'Vienna, Austria',
    last_address: 'Seitenstettengasse 4, 1010 Vienna, Austria',
    nationality: 'Austria',
    id_number: '0123456789',
    dod: '05.07.2026',
    place_of_death: 'Vienna, Austria',
    cause_of_death: 'Cardiac arrest',
    icd_code: 'I46.9',
    burial_place: 'Har HaMenuchot, Jerusalem',
  },
  transport: {
    flight_no: 'LY364',
    airline: 'EL AL Israel Airlines',
    disembarkation_point: 'Ben Gurion Airport',
    transfer_date: '08.07.2026',
  },
  funeral_service: {
    name_address: 'Chevra Kadisha Jerusalem, Shamgar St 9, Jerusalem',
    license_no: '123456789',
    license_expiry: '31.12.2027',
  },
  declaration: { date: '07.07.2026' },
  documents: {
    death_certificate: true,
    id_copy: true,
    doctor_certificate: true,
    local_transfer_permit: true,
    sealing_permit: true,
    c19_sealing: true,
    funeral_acceptance: true,
    preservation_certificate: true,
    moh_permit: true,
  },
};

// ---------- (b) unit-ish checks ----------
console.log('[2/5] resolveBindings / validate / validateEncoding...');
const resolved = resolveBindings(template, data);
assert.equal(resolved.surname, 'Mustermann');
assert.equal(resolved.id_number, '0123456789');
assert.equal(resolved.chk_doc9, true);
assert.equal(resolved.disembarkation, 'Ben Gurion Airport');

const ok = validate(template, data);
assert.equal(ok.ok, true, `expected valid, got: ${JSON.stringify(ok.issues)}`);

// missing required
const bad = validate(template, { case: {} });
assert.equal(bad.ok, false);
assert.ok(bad.issues.some((i) => i.key === 'surname' && i.kind === 'missing'));
assert.ok(bad.issues.some((i) => i.key === 'id_number' && i.kind === 'missing'));

// encoding: Hebrew must be flagged per field, not thrown
assert.deepEqual(validateEncoding('Jerusalem'), []);
assert.deepEqual(validateEncoding('ירושלים').length > 0, true);
const heb = validate(template, {
  ...data,
  case: { ...data.case, burial_place: 'הר המנוחות' },
});
assert.ok(heb.issues.some((i) => i.key === 'burial_place' && i.kind === 'encoding'));

// grid overflow flagged
const over = validate(template, {
  ...data,
  case: { ...data.case, id_number: '01234567890X' },
});
assert.ok(over.issues.some((i) => i.key === 'id_number' && i.kind === 'overflow'));

// generate() must refuse non-encodable input BEFORE drawing
console.log('[3/5] generate() pre-flight rejection of Hebrew...');
const blank = new Uint8Array(readFileSync(BLANK_PDF));
await assert.rejects(
  () => generate(template, blank, { ...data, case: { ...data.case, cause_of_death: 'עברית' } }),
  (err) => Array.isArray(err.issues) && err.issues[0].kind === 'encoding',
);

// ---------- (c) full generation against the real blank form ----------
console.log('[4/5] generating filled.pdf from the real blank form...');
const t0 = Date.now();
const result = await generateDetailed({ template, pdfBytes: blank, data });
const ms = Date.now() - t0;

assert.equal(result.skipped.length, 0, `nothing should be skipped: ${result.skipped}`);
assert.equal(
  result.drawn.length,
  template.fields.length + template.grids.length + template.checks.length,
  'every field, grid and check must draw',
);
assert.ok(result.bytes.length > 100_000, `filled.pdf suspiciously small: ${result.bytes.length}`);
// the blank must be untouched and the output must differ from it
assert.notEqual(result.bytes.length, blank.length);

// ---------- (d) write output ----------
const outDir = path.join(pkgRoot, 'test-output');
mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'filled.pdf');
writeFileSync(outFile, result.bytes);

console.log(`[5/5] OK — wrote ${outFile} (${result.bytes.length} bytes, generated in ${ms} ms)`);
console.log(`      drawn: ${result.drawn.length} keys (${template.fields.length} fields, ${template.grids.length} grids, ${template.checks.length} checks)`);

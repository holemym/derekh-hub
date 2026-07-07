// Apply the Derech schema to Supabase over a direct Postgres connection.
// Usage: from app/, `node scripts/apply-migrations.mjs`
// Reads SUPABASE_DB_URL from app/.env.local. Idempotent where the SQL is.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const dbDir = join(appDir, '..', 'db');

// --- load SUPABASE_DB_URL from .env.local ---
const env = Object.fromEntries(
  readFileSync(join(appDir, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const conn = env.SUPABASE_DB_URL;
if (!conn) {
  console.error('Missing SUPABASE_DB_URL in app/.env.local.');
  console.error('Get it: Supabase → Project Settings → Database → Connection string → URI');
  process.exit(1);
}

const steps = [
  'migrations/0001_init.sql',
  'migrations/0002_rls.sql',
  'migrations/0003_storage.sql',
  'migrations/0004_case_permit_fields.sql',
  'seed/seed.sql',
  'seed/seed_form_template.sql',
];

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('connected\n');
  for (const rel of steps) {
    const sql = readFileSync(join(dbDir, rel), 'utf8');
    process.stdout.write(`applying ${rel} ... `);
    try {
      await client.query(sql);
      console.log('OK');
    } catch (e) {
      console.log('FAILED');
      console.error(`\n  ${e.message}\n  (${rel})`);
      await client.end();
      process.exit(1);
    }
  }

  console.log('\n--- verification ---');
  const checks = [
    ["tables in public", `select count(*)::int n from information_schema.tables where table_schema='public'`],
    ["RLS-enabled tables", `select count(*)::int n from pg_tables where schemaname='public' and rowsecurity=true`],
    ["policies", `select count(*)::int n from pg_policies where schemaname='public'`],
    ["storage buckets (private)", `select count(*)::int n from storage.buckets where public=false`],
    ["form_templates rows", `select count(*)::int n from public.form_templates`],
    ["demo cases", `select count(*)::int n from public.cases`],
    ["cases.place_of_birth col", `select count(*)::int n from information_schema.columns where table_name='cases' and column_name='place_of_birth'`],
  ];
  for (const [label, q] of checks) {
    const { rows } = await client.query(q);
    console.log(`  ${label}: ${rows[0].n}`);
  }
  await client.end();
  console.log('\ndone.');
}
main().catch(async (e) => { console.error(e); try { await client.end(); } catch {} process.exit(1); });

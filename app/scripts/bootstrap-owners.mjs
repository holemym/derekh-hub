// Provision owner accounts: create confirmed auth users + owner staff rows.
// Idempotent. Usage: from app/, `node scripts/bootstrap-owners.mjs`
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  readFileSync(join(appDir, '.env.local'), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const OWNERS = [
  { email: 'holemymora@gmail.com', name: 'David' },
  { email: 'mottyhammer@gmail.com', name: 'Motty Hammer' },
];

async function findUserByEmail(email) {
  // paginate through users (small project, one page is plenty)
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function main() {
  for (const { email, name } of OWNERS) {
    let user = await findUserByEmail(email);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error) throw error;
      user = data.user;
      console.log(`created auth user  ${email}  (${user.id})`);
    } else {
      console.log(`auth user exists   ${email}  (${user.id})`);
    }
    const { error: sErr } = await admin
      .from('staff')
      .upsert({ id: user.id, name, role: 'owner', active: true }, { onConflict: 'id' });
    if (sErr) throw sErr;
    console.log(`  -> staff row (owner) upserted for ${name}`);
  }

  const { data: staff, error } = await admin.from('staff').select('name, role, active');
  if (error) throw error;
  console.log('\nstaff table now:', staff);
}
main().catch((e) => { console.error('FAILED:', e.message || e); process.exit(1); });

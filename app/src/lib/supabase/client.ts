import { createClient } from '@supabase/supabase-js';

/**
 * Browser Supabase client — uses the publishable (anon) key.
 * Row-level security governs what this can see; never put secrets here.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — see app/.env.local (db/CONNECT.md).');
}

export const supabase = createClient(url, anon);

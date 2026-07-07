import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../../db/types';

/**
 * Server-side ANON (publishable-key) Supabase client for the PUBLIC family
 * intake path. Unlike ./server (which binds to the staff session cookies) this
 * client carries NO session, so every call runs strictly under the `anon` role
 * and its row-level-security policies:
 *   - anon may INSERT into intake_submissions ONLY with status 'new' AND
 *     case_id null (0002_rls.sql), and
 *   - anon may INSERT storage objects ONLY under case-docs/intake/ (0003).
 * It can never read cases, read submissions back, or link a case — exactly the
 * public data-collection surface we want. Never use this for staff work.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — see app/.env.local.',
  );
}

/** Fresh anon client (no session persistence). */
export function createSupabaseAnonClient() {
  return createClient<Database>(url!, anon!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

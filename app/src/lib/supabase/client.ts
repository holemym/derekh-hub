'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '../../../../db/types';

/**
 * Browser Supabase client (@supabase/ssr) — cookie-based, so the session it
 * establishes (magic-link sign-in) is readable by the server client + proxy.
 * Uses the publishable (anon) key; row-level security governs what it sees.
 * Never put secrets here.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — see app/.env.local.',
  );
}

/**
 * A single shared browser client. `createBrowserClient` is safe to call once
 * at module scope in the browser bundle.
 */
export const supabase = createBrowserClient<Database>(url, anon);

/** Factory form, for callers that prefer to create their own instance. */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(url!, anon!);
}

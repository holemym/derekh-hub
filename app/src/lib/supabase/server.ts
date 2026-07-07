import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '../../../../db/types';

/**
 * RLS-scoped server Supabase client (@supabase/ssr).
 *
 * Reads the logged-in staff session from cookies via next/headers and writes
 * refreshed auth cookies back. Every read through this client is governed by
 * row-level security under the *user's* identity — so a non-staff user (or
 * anon) sees nothing. Use this for all server-component / route-handler /
 * server-action reads that must respect the session.
 *
 * (For privileged, RLS-bypassing writes use `./admin` — service_role.)
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — see app/.env.local.',
    );
  }

  return createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // In a Server Component the cookie store is read-only; the write throws.
        // That's fine — the proxy refreshes the session on every request, so the
        // dropped writes here are re-applied there. We swallow the error.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          /* called from a Server Component — safe to ignore (proxy handles it) */
        }
      },
    },
  });
}

import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client — uses the service_role secret key and
 * BYPASSES row-level security. Only import this from server code
 * (route handlers, server actions, server components). Never ship to the browser.
 *
 * LAZY on purpose: Next evaluates route modules at build time ("collect page
 * data"), where env vars may be absent — a module-scope throw fails the whole
 * Vercel build (it did, for /api/stripe/webhook). Constructing on first call
 * moves the failure to runtime, where the env is actually present.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — server env only.');
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

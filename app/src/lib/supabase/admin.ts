import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client — uses the service_role secret key and
 * BYPASSES row-level security. Only import this from server code
 * (route handlers, server actions, server components). Never ship to the browser.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — server env only.');
}

export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

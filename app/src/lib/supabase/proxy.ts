import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '../../../../db/types';

/**
 * Session-refresh + access-control for the Next.js proxy (Next 16's renamed
 * middleware). Follows the @supabase/ssr SSR guide: build a server client bound
 * to the request/response cookie jars, call `getUser()` to refresh the session,
 * and always return the SAME `response` object so refreshed auth cookies reach
 * the browser.
 *
 * Access rules layered on top:
 *   - Public routes (/login, /auth/callback, /no-access) are always allowed.
 *   - No session  -> redirect to /login?next=<path>.
 *   - Session but not an active staff row -> redirect to /no-access.
 *   - Active staff -> pass through.
 */

const PUBLIC_PATHS = ['/login', '/auth/callback', '/no-access'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    // Misconfigured env — let the request through so the app can surface the
    // error itself rather than hard-failing every route at the edge.
    return response;
  }

  const supabase = createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT (per SSR guide): do not run code between createServerClient and
  // getUser(); getUser() revalidates the token and triggers the cookie refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  // Public routes: refresh cookies but never gate.
  if (isPublic(pathname)) {
    // A signed-in *staff* user hitting /login has no business there — bounce to
    // Today. (We only redirect away from /login, not /auth/callback.)
    if (user && pathname === '/login') {
      const staff = await activeStaff(supabase, user.id);
      if (staff) {
        const to = request.nextUrl.clone();
        to.pathname = '/today';
        to.search = '';
        return NextResponse.redirect(to);
      }
    }
    return response;
  }

  // Not signed in -> login (remember where they were going).
  if (!user) {
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    to.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(to);
  }

  // Signed in but not active staff -> no-access.
  const staff = await activeStaff(supabase, user.id);
  if (!staff) {
    const to = request.nextUrl.clone();
    to.pathname = '/no-access';
    to.search = '';
    return NextResponse.redirect(to);
  }

  return response;
}

/**
 * Is this user an ACTIVE staff member? Queried through the RLS-scoped client:
 * the `staff` RLS policy lets a user read their own row, so this returns the
 * row only when it exists AND is active.
 */
async function activeStaff(
  supabase: ReturnType<typeof createServerClient<Database>>,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('staff')
    .select('id, active')
    .eq('id', userId)
    .eq('active', true)
    .maybeSingle();
  return !!data;
}

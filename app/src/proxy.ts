import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

/**
 * Next.js 16 proxy (formerly middleware.ts). Runs on the Node.js runtime by
 * default in Next 16, which suits @supabase/ssr. On every matched request it
 * refreshes the Supabase session (writing rotated auth cookies back) and gates
 * access: unauthenticated -> /login, authed-but-not-staff -> /no-access.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every path EXCEPT:
     * - _next/static, _next/image (build assets / image optimizer)
     * - favicon.ico, manifest.json, sw.js, robots.txt, sitemap.xml (metadata)
     * - the /forms and /icons public asset folders (blank PDF, PWA icons)
     * - anything with a file extension (.png, .svg, .pdf, .css, .js, ...)
     * So the auth gate never blocks CSS/JS/images or the offline blank permit.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|sitemap.xml|forms/|icons/|.*\\.[\\w]+$).*)',
  ],
};

"use client";

import { usePathname } from "next/navigation";

/**
 * Chrome gate — hides the app shell (sticky Header + bottom TabNav) on the
 * standalone auth screens (/login, /no-access, /auth/*) and the PUBLIC family
 * intake page (/intake, /intake/thanks), which are shown to users who aren't
 * inside the staff app. Everywhere else, renders children.
 */
const BARE_PREFIXES = ["/login", "/no-access", "/auth", "/intake"];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (bare) return null;
  return <>{children}</>;
}

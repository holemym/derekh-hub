"use client";

import { useEffect, useState } from "react";

/**
 * First-load splash (DESIGN.md §Loading): a centered monoline mark that draws
 * in, then the whole layer fades to reveal the app. Rendered once at the root;
 * it removes itself from the DOM after the fade so it never traps focus or
 * intercepts clicks. Reduced-motion-safe via the CSS (splash-out still runs).
 *
 * Session-scoped: only shown on the first paint of a browsing session so it
 * doesn't reappear on every client navigation.
 */
export default function Splash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("derech.splash") === "1") return;
      sessionStorage.setItem("derech.splash", "1");
    } catch {
      /* storage unavailable — show once for this mount */
    }
    setShow(true);
    // Matches the CSS: 0.9s hold + 0.5s fade ≈ 1.4s, add slack.
    const t = setTimeout(() => setShow(false), 1600);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="splash" role="presentation" aria-hidden>
      <svg
        className="splash-mark"
        width="56"
        height="56"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path style={{ ["--dash" as string]: 42 }} d="M5 19c0-5 3-8 7-8s7 3 7 8" />
        <path style={{ ["--dash" as string]: 14 }} d="M12 11V4M9.5 6.5 12 4l2.5 2.5" />
      </svg>
    </div>
  );
}

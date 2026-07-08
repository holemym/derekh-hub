/**
 * Page transition (DESIGN.md §Motion) — a subtle 200ms fade + 6px rise on every
 * route change. `template.tsx` remounts on navigation (unlike layout), so the
 * `.page-enter` animation replays each time. Reduced-motion-safe via CSS.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}

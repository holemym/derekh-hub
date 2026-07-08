import {
  IconToday,
  IconCases,
  IconPlane,
  IconMoney,
  IconTasks,
  IconMore,
} from "./icons";

/**
 * Shared navigation model — one source of truth for both shells.
 * Mobile bottom TabNav shows a compact subset; the desktop sidebar shows the
 * full operational nav. Transport & Money routes land in M3/M4; they render as
 * "soon" and don't navigate yet (kept in the structure per DESIGN.md).
 */
export type NavItem = {
  href: string;
  key: string; // messages key under "nav"
  Icon: (p: { size?: number; strokeWidth?: number; className?: string }) => React.ReactNode;
  soon?: boolean; // route not built yet — show but don't link
};

/** Full desktop sidebar nav. */
export const SIDEBAR_ITEMS: NavItem[] = [
  { href: "/today", key: "today", Icon: IconToday },
  { href: "/cases", key: "cases", Icon: IconCases },
  { href: "/transport", key: "transport", Icon: IconPlane },
  { href: "/money", key: "money", Icon: IconMoney },
  { href: "/tasks", key: "tasks", Icon: IconTasks },
  { href: "/intake-inbox", key: "intake", Icon: IconMore },
];

/** Compact mobile bottom tabs. */
export const TAB_ITEMS: NavItem[] = [
  { href: "/today", key: "today", Icon: IconToday },
  { href: "/cases", key: "cases", Icon: IconCases },
  { href: "/transport", key: "transport", Icon: IconPlane },
  { href: "/more", key: "more", Icon: IconMore },
];

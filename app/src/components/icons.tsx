/**
 * Monoline icon set — consistent 1.5px stroke, currentColor (PLANNING §9).
 */

import type { SVGProps } from "react";

function Base({
  children,
  size = 22,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement> & { size?: number };

export function IconToday(p: P) {
  return (
    <Base {...p}>
      <rect x="3.5" y="4.5" width="17" height="16" rx="3" />
      <path d="M3.5 9.5h17M8 2.5v3.5M16 2.5v3.5" />
      <circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function IconCases(p: P) {
  return (
    <Base {...p}>
      <path d="M4 7.5h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-11Z" />
      <path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
      <path d="M4 12h16" />
    </Base>
  );
}

export function IconPlane(p: P) {
  return (
    <Base {...p}>
      <path d="M10.5 13.5 3 11l1.5-1.5L10 10l4-4.5c.6-.6 1.6-.6 2.1 0 .6.6.6 1.5 0 2.1L11.5 12l.5 5.5L10.5 19l-2.5-7.5" />
      <path d="M4.5 19.5h15" />
    </Base>
  );
}

export function IconMore(p: P) {
  return (
    <Base {...p}>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    </Base>
  );
}

export function IconChevronRight(p: P) {
  return (
    <Base {...p}>
      <path d="m9 6 6 6-6 6" />
    </Base>
  );
}

export function IconPlus(p: P) {
  return (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function IconCheck(p: P) {
  return (
    <Base {...p}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Base>
  );
}

/** Stroke-draw variant: the check draws itself on mount (completion motion). */
export function IconCheckDraw(p: P) {
  return (
    <Base {...p}>
      <path className="stroke-draw" d="m5 12.5 4.5 4.5L19 7" />
    </Base>
  );
}

export function IconCandles(p: P) {
  return (
    <Base {...p}>
      <path d="M9 11v7M15 11v7M5.5 21h13" />
      <path d="M9 8.5c-1 0-1.6-.9-1.1-1.8C8.2 6 9 5 9 4c0 1 .8 2 1.1 2.7.5.9-.1 1.8-1.1 1.8ZM15 8.5c-1 0-1.6-.9-1.1-1.8.3-.7 1.1-1.7 1.1-2.7 0 1 .8 2 1.1 2.7.5.9-.1 1.8-1.1 1.8Z" />
    </Base>
  );
}

export function IconDoc(p: P) {
  return (
    <Base {...p}>
      <path d="M6 3.5h8l4 4V20.5H6a0 0 0 0 1 0 0v-17Z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
    </Base>
  );
}

export function IconContacts(p: P) {
  return (
    <Base {...p}>
      <circle cx="9" cy="9" r="3" />
      <path d="M3.5 19.5c.8-2.8 2.9-4.5 5.5-4.5s4.7 1.7 5.5 4.5" />
      <path d="M16 6.5a3 3 0 0 1 0 5M18.5 15.5c1 .8 1.7 2 2 4" />
    </Base>
  );
}

export function IconActivity(p: P) {
  return (
    <Base {...p}>
      <path d="M3.5 12.5h4l2.5-6 4 11 2.5-5h4" />
    </Base>
  );
}

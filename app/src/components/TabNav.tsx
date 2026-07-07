"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconToday, IconCases, IconPlane, IconMore } from "./icons";

const TABS = [
  { href: "/today", key: "today", Icon: IconToday },
  { href: "/cases", key: "cases", Icon: IconCases },
  { href: "/transport", key: "transport", Icon: IconPlane },
  { href: "/more", key: "more", Icon: IconMore },
] as const;

/** Bottom tab navigation — Today · Cases · Transport · More. */
export default function TabNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-[680px]">
        {TABS.map(({ href, key, Icon }) => {
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`pressable flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-ink" : "text-muted"
              }`}
            >
              <Icon size={22} strokeWidth={active ? 1.9 : 1.5} />
              {t(key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { TAB_ITEMS } from "./nav-items";

/**
 * Bottom tab navigation (mobile shell) — Today · Cases · Transport · More.
 * The active tab gets a soft settling indicator pill above the icon.
 */
export default function TabNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex w-full max-w-[680px]">
        {TAB_ITEMS.map(({ href, key, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`pressable relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-ink" : "text-muted"
              }`}
            >
              <span
                aria-hidden
                className={`nav-indicator absolute top-1.5 h-1 w-1 rounded-full bg-ink ${
                  active ? "opacity-100" : "opacity-0"
                }`}
              />
              <Icon size={22} strokeWidth={active ? 1.9 : 1.5} />
              {t(key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

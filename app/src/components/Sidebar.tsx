"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { SIDEBAR_ITEMS } from "./nav-items";
import { IconMark } from "./icons";
import LanguageSwitch from "./LanguageSwitch";
import SignOutButton from "./SignOutButton";

/**
 * Desktop left sidebar (DESIGN.md §Responsive) — brand at top, vertical
 * operational nav in the middle, language + sign-out at the bottom. Replaces
 * the mobile bottom TabNav at ≥lg. Hidden below lg.
 */
export default function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-line lg:bg-card/60">
      {/* Brand */}
      <Link
        href="/today"
        className="flex items-center gap-2.5 px-5 pb-4 pt-6"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-card text-ink">
          <IconMark size={20} />
        </span>
        <span className="leading-tight">
          <span className="block t-heading font-semibold tracking-tight">
            {t("app.name")}
          </span>
          <span className="block t-meta text-muted">{t("app.tagline")}</span>
        </span>
      </Link>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-1">
          {SIDEBAR_ITEMS.map(({ href, key, Icon, soon }) => {
            const active =
              pathname === href || pathname.startsWith(`${href}/`);
            const body = (
              <>
                <Icon size={19} strokeWidth={active ? 1.9 : 1.5} />
                <span className="flex-1">{t(`nav.${key}`)}</span>
                {soon ? (
                  <span className="t-label rounded-chip border border-line px-1.5 py-0.5">
                    {t("more.comingSoon")}
                  </span>
                ) : null}
              </>
            );
            const base =
              "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium";
            if (soon) {
              return (
                <li key={href}>
                  <span
                    className={`${base} cursor-default text-muted/70`}
                    aria-disabled
                  >
                    {body}
                  </span>
                </li>
              );
            }
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`pressable ${base} ${
                    active
                      ? "bg-ink/[0.06] text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`nav-indicator absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-ink ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                  {body}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom — language + sign out */}
      <div className="border-t border-line p-3">
        <LanguageSwitch />
        <div className="mt-2">
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}

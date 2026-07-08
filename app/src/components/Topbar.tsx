"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconPlus } from "./icons";

/**
 * Desktop slim top bar (DESIGN.md §Responsive) — page title area, today's
 * Hebrew + secular date, and the primary New-permit action. Dates are computed
 * server-side and passed in so this stays a light client component (only the
 * pathname → title mapping needs the client).
 */
export default function Topbar({
  hebrewDate,
  gregDate,
}: {
  hebrewDate: string;
  gregDate: string;
}) {
  const pathname = usePathname();
  const t = useTranslations();

  const title = titleFor(pathname, t);

  return (
    <header className="sticky top-0 z-20 hidden border-b border-line bg-bg/85 backdrop-blur lg:block">
      <div className="flex items-center justify-between gap-4 px-8 py-4">
        <h1 className="t-title truncate">{title}</h1>

        <div className="flex items-center gap-5">
          <div className="text-right leading-tight">
            <div dir="rtl" lang="he" className="t-meta font-medium text-ink">
              {hebrewDate}
            </div>
            <div className="t-meta text-muted">{gregDate}</div>
          </div>
          <Link
            href="/cases/new"
            className="pressable flex min-h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-[14px] font-semibold text-bg"
          >
            <IconPlus size={16} />
            {t("today.newPermit")}
          </Link>
        </div>
      </div>
    </header>
  );
}

function titleFor(
  pathname: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (pathname.startsWith("/today")) return t("today.title");
  if (pathname.startsWith("/cases/new")) return t("newPermit.title");
  if (pathname.startsWith("/cases")) return t("cases.title");
  if (pathname.startsWith("/transport")) return t("transportPage.title");
  if (pathname.startsWith("/tasks")) return t("tasks.title");
  if (pathname.startsWith("/intake-inbox")) return t("intakeInbox.title");
  if (pathname.startsWith("/more")) return t("more.title");
  return t("app.name");
}

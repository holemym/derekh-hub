import { getLocale, getTranslations } from "next-intl/server";
import { hebrewDate } from "@/lib/zmanim";
import { formatDate } from "@/lib/format";

/** App header — wordmark + today's Hebrew date and secular date. */
export default async function Header() {
  const t = await getTranslations("app");
  const locale = await getLocale();
  const now = new Date();
  const hd = hebrewDate(now);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[17px] font-semibold tracking-tight">
            {t("name")}
          </span>
          <span className="hidden text-xs text-muted sm:inline">
            {t("tagline")}
          </span>
        </div>
        <div className="text-right leading-tight">
          <div dir="rtl" lang="he" className="text-sm font-medium">
            {hd.he}
          </div>
          <div className="text-xs text-muted">{formatDate(now, locale)}</div>
        </div>
      </div>
    </header>
  );
}

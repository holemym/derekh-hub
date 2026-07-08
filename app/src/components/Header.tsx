import { getLocale, getTranslations } from "next-intl/server";
import { hebrewDate } from "@/lib/zmanim";
import { formatDate } from "@/lib/format";
import { IconMark } from "./icons";

/** Mobile app header — wordmark + today's Hebrew date and secular date. */
export default async function Header() {
  const t = await getTranslations("app");
  const locale = await getLocale();
  const now = new Date();
  const hd = hebrewDate(now);

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-card text-ink">
            <IconMark size={16} />
          </span>
          <span className="t-heading font-semibold tracking-tight">
            {t("name")}
          </span>
          <span className="hidden t-meta text-muted sm:inline">
            {t("tagline")}
          </span>
        </div>
        <div className="text-right leading-tight">
          <div dir="rtl" lang="he" className="t-meta font-medium">
            {hd.he}
          </div>
          <div className="t-meta text-muted">{formatDate(now, locale)}</div>
        </div>
      </div>
    </header>
  );
}

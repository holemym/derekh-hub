import { getLocale, getTranslations } from "next-intl/server";
import { casesByUrgency } from "@/lib/repo";
import { hebrewDate, shabbosWindow } from "@/lib/zmanim";
import { formatWeekdayTime } from "@/lib/format";
import CaseCard from "@/components/CaseCard";
import { IconCandles } from "@/components/icons";

export const dynamic = "force-dynamic";

/**
 * The signature screen (PLANNING §9): one scroll — Shabbos pressure first,
 * then every case needing action, sorted by real urgency.
 */
export default async function TodayPage() {
  const t = await getTranslations("today");
  const locale = await getLocale();

  const now = new Date();
  const win = shabbosWindow(now);
  const cases = casesByUrgency(now).filter((c) => c.status !== "buried");

  const showCountdown = win !== null && win.withinWindow;
  const hoursWhole = win ? Math.floor(win.hoursUntil) : 0;
  const minutes = win ? Math.floor((win.hoursUntil - hoursWhole) * 60) : 0;
  // Red only when the window is truly closing.
  const critical = win !== null && win.hoursUntil <= 12;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

        {showCountdown && win ? (
          <span
            className={`flex items-center gap-1.5 rounded-chip border px-3 py-1.5 text-[13px] font-medium ${
              critical
                ? "border-urgent/40 text-urgent"
                : "border-line bg-card text-ink"
            }`}
          >
            <IconCandles size={15} />
            {t("shabbosIn", { hours: hoursWhole, minutes })}
            <span className={critical ? "text-urgent/70" : "text-muted"}>
              · {formatWeekdayTime(win.candleLighting, locale)}
            </span>
          </span>
        ) : (
          <span
            dir="rtl"
            lang="he"
            className="rounded-chip border border-line bg-card px-3 py-1.5 text-[13px] font-medium"
          >
            {hebrewDate(now).he}
          </span>
        )}
      </div>

      <p className="mb-3 text-sm text-muted">
        {t("openCases", { count: cases.length })}
      </p>

      {cases.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">{t("allQuiet")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {cases.map((c, i) => (
            <CaseCard key={c.id} c={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
